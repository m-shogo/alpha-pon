// バックテスト: score log 後 30日/90日/180日のリターンを追跡
// pnpm backtest

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import { addDaysJst, todayJst, toCompactDate } from "./date.js";

type ScoreEntry = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  reasons?: string[];
  createdAt?: string;
  rules?: string[];
  priority?: string;
  dataQuality?: string;
};

type ReturnData = {
  price: number | null;
  returnPct: number | null;
};

type BacktestRow = {
  code: string;
  name: string;
  observedDate: string;
  score: number;
  alertLevel: string;
  isNotified: boolean;
  rules: string[];
  priority: string;
  dataQuality: string;
  basePrice: number | null;
  "30d": ReturnData;
  "90d": ReturnData;
  "180d": ReturnData;
};

type PeriodKey = "30d" | "90d" | "180d";
type Quote = { Date: string; AdjustmentClose: number };

function findPriceOnOrAfter(
  quotes: Quote[],
  targetDate: string
): number | null {
  const target = toCompactDate(targetDate);
  const match = quotes.find(q => q.Date >= target);
  return match?.AdjustmentClose ?? null;
}

function calcReturnPct(base: number | null, target: number | null): number | null {
  if (!base || !target) return null;
  return ((target - base) / base) * 100;
}

function fmtReturn(d: ReturnData): string {
  if (d.returnPct == null) return "N/A";
  const sign = d.returnPct >= 0 ? "+" : "";
  return `${sign}${d.returnPct.toFixed(1)}%`;
}

function scoreBand(score: number): string {
  if (score >= 85) return "score >= 85";
  if (score >= 70) return "70 <= score < 85";
  if (score >= 50) return "50 <= score < 70";
  return "score < 50";
}

function notificationBucket(row: BacktestRow): string {
  return row.isNotified ? "notified: urgent/daily" : "not_notified";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtPct(value: number | null): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function extractScoreFileDate(fileName: string): string | null {
  return fileName.match(/^scores_(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? null;
}

function isNotificationAlert(alertLevel: string): boolean {
  return alertLevel === "urgent" || alertLevel === "daily";
}

function emptyReturn(): ReturnData {
  return { price: null, returnPct: null };
}

function buildRow(entry: ScoreEntry, observedDate: string): BacktestRow {
  return {
    code: entry.code,
    name: entry.name,
    observedDate,
    score: entry.score,
    alertLevel: entry.alertLevel,
    isNotified: isNotificationAlert(entry.alertLevel),
    rules: entry.rules ?? [],
    priority: entry.priority ?? "unknown",
    dataQuality: entry.dataQuality ?? "unknown",
    basePrice: null,
    "30d": emptyReturn(),
    "90d": emptyReturn(),
    "180d": emptyReturn(),
  };
}

function groupRows(rows: BacktestRow[], groupName: string, pick: (row: BacktestRow) => string[]): string[] {
  const lines: string[] = [];
  const groups = new Map<string, BacktestRow[]>();

  for (const row of rows) {
    for (const key of pick(row)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
  }

  if (groups.size === 0) return lines;

  lines.push(`## ${groupName}`);
  lines.push("");
  lines.push("| グループ | 件数 | 価格あり | 30日平均 | 30日中央値 | 30日勝率 | 90日平均 | 90日中央値 | 90日勝率 | 180日平均 | 180日中央値 | 180日勝率 |");
  lines.push("|----------|------|----------|----------|------------|----------|----------|------------|----------|-----------|-------------|-----------|");

  for (const [key, group] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const priced = group.filter(row => row.basePrice != null).length;
    const stats = (["30d", "90d", "180d"] as PeriodKey[]).map(period => {
      const returns = group
        .map(r => r[period].returnPct)
        .filter((v): v is number => v != null);
      const avg = returns.length > 0 ? returns.reduce((sum, v) => sum + v, 0) / returns.length : null;
      const med = median(returns);
      const wins = returns.filter(v => v > 0).length;
      const winRate = returns.length > 0 ? (wins / returns.length) * 100 : null;
      return { avg, med, winRate, count: returns.length };
    });

    lines.push(
      `| ${key} | ${group.length} | ${priced} | ${fmtPct(stats[0].avg)} | ${fmtPct(stats[0].med)} | ${fmtPct(stats[0].winRate)} (${stats[0].count}) | ${fmtPct(stats[1].avg)} | ${fmtPct(stats[1].med)} | ${fmtPct(stats[1].winRate)} (${stats[1].count}) | ${fmtPct(stats[2].avg)} | ${fmtPct(stats[2].med)} | ${fmtPct(stats[2].winRate)} (${stats[2].count}) |`
    );
  }

  lines.push("");
  return lines;
}

function readScoreEntries(reportsDir: string, files: string[]): BacktestRow[] {
  const rows: BacktestRow[] = [];

  for (const file of files) {
    const fileDate = extractScoreFileDate(file);
    let entries: ScoreEntry[] = [];
    try {
      const parsed = JSON.parse(readFileSync(join(reportsDir, file), "utf-8"));
      entries = Array.isArray(parsed) ? parsed as ScoreEntry[] : [];
    } catch (error) {
      console.warn(`[WARN] score log を読めませんでした: ${file} (${error instanceof Error ? error.message : error})`);
      continue;
    }

    for (const entry of entries) {
      if (!entry.code || !entry.name || typeof entry.score !== "number") continue;
      const observedDate = entry.createdAt ?? fileDate;
      if (!observedDate) continue;
      rows.push(buildRow(entry, observedDate));
    }
  }

  return rows;
}

async function fillReturnData(rows: BacktestRow[], today: string): Promise<void> {
  const byCode = new Map<string, BacktestRow[]>();
  for (const row of rows) {
    if (!byCode.has(row.code)) byCode.set(row.code, []);
    byCode.get(row.code)!.push(row);
  }

  for (const [code, codeRows] of [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dates = codeRows.map(row => row.observedDate).sort();
    const fromDate = dates[0];
    const toDate = addDaysJst(dates.at(-1)!, 200);
    process.stdout.write(`  ${code} (${codeRows.length} entries) ... `);

    try {
      const quotes = await fetchDailyQuotes(code, toCompactDate(fromDate), toCompactDate(toDate));
      const sorted = [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));

      for (const row of codeRows) {
        row.basePrice = findPriceOnOrAfter(sorted, row.observedDate);
        for (const days of [30, 90, 180] as const) {
          const targetDate = addDaysJst(row.observedDate, days);
          if (targetDate > today) continue;
          const price = findPriceOnOrAfter(sorted, targetDate);
          row[`${days}d`] = {
            price,
            returnPct: calcReturnPct(row.basePrice, price),
          };
        }
      }

      const priced = codeRows.filter(row => row.basePrice != null).length;
      console.log(`priced ${priced}/${codeRows.length}`);
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.log(`取得失敗 (${error instanceof Error ? error.message : error})`);
    }
  }
}

async function main() {
  const today = todayJst();
  const hasJquants = isJQuantsConfigured();

  console.log(`\nalpha-pon バックテスト: ${today}\n`);

  if (!hasJquants) {
    console.log("⚠️  JQUANTS_API_KEY または JQUANTS_EMAIL/PASSWORD 未設定: 価格データなしで履歴のみ出力します\n");
  }

  const reportsDir = "reports";
  let files: string[];
  try {
    files = readdirSync(reportsDir)
      .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort();
  } catch {
    console.log("reports/ ディレクトリが見つかりません。先に pnpm daily を実行してください。");
    return;
  }

  if (files.length === 0) {
    console.log("スコアログなし (reports/scores_*.json)。先に pnpm daily を実行してください。");
    return;
  }

  console.log(`スコアログ: ${files.length}件\n`);

  const rows = readScoreEntries(reportsDir, files);
  if (rows.length === 0) {
    console.log("score entries なし");
    return;
  }

  const notifiedRows = rows.filter(row => row.isNotified);
  const notNotifiedRows = rows.filter(row => !row.isNotified);
  console.log(`全score entries: ${rows.length}件`);
  console.log(`通知対象: ${notifiedRows.length}件 / 非通知: ${notNotifiedRows.length}件\n`);

  if (hasJquants) {
    await fillReturnData(rows, today);
  } else {
    console.log("価格照合 skip (J-Quants未設定)");
  }

  // Markdown レポート生成
  const lines: string[] = [
    `# バックテスト結果`,
    ``,
    `生成日: ${today}  `,
    `score log 後 30日 / 90日 / 180日 のリターン追跡`,
    ``,
    `> ※買い推奨ではありません。スクリーニング精度の確認用です。`,
    ``,
  ];

  if (!hasJquants) {
    lines.push(`> ⚠️ J-Quants未設定のため価格なし。履歴のみ表示します。`);
    lines.push(``);
  }

  lines.push(`## 対象サマリー`);
  lines.push(``);
  lines.push(`- score log files: ${files.length}`);
  lines.push(`- all score entries: ${rows.length}`);
  lines.push(`- notified urgent/daily: ${notifiedRows.length}`);
  lines.push(`- not notified: ${notNotifiedRows.length}`);
  lines.push(``);

  lines.push(`## 通知履歴 × リターン`);
  lines.push(``);
  if (notifiedRows.length === 0) {
    lines.push(`通知対象エントリなし (alertLevel: urgent/daily が0件)`);
    lines.push(``);
  } else {
    lines.push(`| 観測日 | コード | 銘柄名 | スコア | Lv | 観測時価格 | +30日 | +90日 | +180日 |`);
    lines.push(`|--------|--------|--------|--------|----|------------|-------|-------|--------|`);

    for (const row of [...notifiedRows].sort((a, b) => b.observedDate.localeCompare(a.observedDate))) {
      const lv = row.alertLevel === "urgent" ? "🚨" : "📋";
      const base = row.basePrice ? `¥${row.basePrice.toLocaleString()}` : "N/A";
      lines.push(
        `| ${row.observedDate} | ${row.code} | ${row.name} | ${row.score} | ${lv} | ${base} | ${fmtReturn(row["30d"])} | ${fmtReturn(row["90d"])} | ${fmtReturn(row["180d"])} |`
      );
    }
    lines.push(``);
  }

  lines.push(...groupRows(rows, "通知対象 vs 非通知対象", row => [notificationBucket(row)]));
  lines.push(...groupRows(rows, "スコア帯別成績（全score log）", row => [scoreBand(row.score)]));
  lines.push(...groupRows(notifiedRows, "スコア帯別成績（通知対象のみ）", row => [scoreBand(row.score)]));
  lines.push(...groupRows(rows, "ルール別成績（全score log）", row => row.rules.length > 0 ? row.rules : ["unknown"]));
  lines.push(...groupRows(rows, "優先度別成績（全score log）", row => [row.priority]));

  // 統計サマリー
  const withData = rows.filter(row => row.basePrice != null);
  if (withData.length > 0) {
    lines.push(`## 全体統計 (価格データあり: ${withData.length}件)`);
    lines.push(``);
    lines.push(`| 期間 | 平均リターン | 中央値 | 勝率 |`);
    lines.push(`|------|------------|--------|------|`);

    for (const [key, label] of [["30d", "30日"], ["90d", "90日"], ["180d", "180日"]] as const) {
      const returns = rows
        .map(row => row[key].returnPct)
        .filter((v): v is number => v != null);
      if (returns.length === 0) continue;
      const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
      const med = median(returns);
      const wins = returns.filter(value => value > 0).length;
      const winRate = (wins / returns.length) * 100;
      lines.push(`| ${label} | ${fmtPct(avg)} | ${fmtPct(med)} | ${fmtPct(winRate)} (${wins}/${returns.length}) |`);
    }

    lines.push(``);
  }

  lines.push(`## 読み方`);
  lines.push(``);
  lines.push(`- 「通知対象 vs 非通知対象」で、通知した候補が非通知候補より良かったかを確認します。`);
  lines.push(`- 件数が少ないグループは参考値です。平均だけでなく中央値と勝率も見てください。`);
  lines.push(`- J-Quants未設定または提供遅延中は価格データが N/A になります。`);
  lines.push(``);

  lines.push(`---`);
  lines.push(`*alpha-pon v0.1 | ${today} | ※投資判断の参考情報ではありません*`);

  mkdirSync(reportsDir, { recursive: true });
  const outputPath = join(reportsDir, `backtest_${today}.md`);
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`\nレポート: ${outputPath}`);
}

main().catch(error => {
  console.error("エラー:", error);
  process.exit(1);
});
