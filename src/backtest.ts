// バックテスト: 通知後 30日/90日/180日のリターンを追跡
// pnpm backtest

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fetchDailyQuotes } from "./fetcher/jquants.js";
import { addDaysJst, todayJst, toCompactDate } from "./date.js";

type ScoreEntry = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  reasons: string[];
  createdAt: string;
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
  notifiedDate: string;
  score: number;
  alertLevel: string;
  rules: string[];
  priority: string;
  dataQuality: string;
  basePrice: number | null;
  "30d": ReturnData;
  "90d": ReturnData;
  "180d": ReturnData;
};

type PeriodKey = "30d" | "90d" | "180d";

function findPriceOnOrAfter(
  quotes: { Date: string; AdjustmentClose: number }[],
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
  lines.push("| グループ | 件数 | 30日平均 | 30日中央値 | 30日勝率 | 90日平均 | 90日中央値 | 90日勝率 | 180日平均 | 180日中央値 | 180日勝率 |");
  lines.push("|----------|------|----------|------------|----------|----------|------------|----------|-----------|-------------|-----------|");

  for (const [key, group] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
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
      `| ${key} | ${group.length} | ${fmtPct(stats[0].avg)} | ${fmtPct(stats[0].med)} | ${fmtPct(stats[0].winRate)} (${stats[0].count}) | ${fmtPct(stats[1].avg)} | ${fmtPct(stats[1].med)} | ${fmtPct(stats[1].winRate)} (${stats[1].count}) | ${fmtPct(stats[2].avg)} | ${fmtPct(stats[2].med)} | ${fmtPct(stats[2].winRate)} (${stats[2].count}) |`
    );
  }

  lines.push("");
  return lines;
}

async function main() {
  const today = todayJst();
  const hasJquants = !!process.env.JQUANTS_EMAIL && !!process.env.JQUANTS_PASSWORD;

  console.log(`\nalpha-pon バックテスト: ${today}\n`);

  if (!hasJquants) {
    console.log("⚠️  JQUANTS_EMAIL/JQUANTS_PASSWORD 未設定: 価格データなしで履歴のみ出力します\n");
  }

  const reportsDir = "reports";
  let files: string[];
  try {
    files = readdirSync(reportsDir)
      .filter(f => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(f))
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

  // 通知対象エントリを収集
  const notified: ScoreEntry[] = [];
  for (const f of files) {
    const entries = JSON.parse(readFileSync(join(reportsDir, f), "utf-8")) as ScoreEntry[];
    for (const e of entries) {
      if (e.alertLevel === "urgent" || e.alertLevel === "daily") {
        notified.push(e);
      }
    }
  }

  if (notified.length === 0) {
    console.log("通知対象エントリなし (alertLevel: urgent/daily が0件)");
    return;
  }

  console.log(`通知対象: ${notified.length}件\n`);

  const rows: BacktestRow[] = [];

  for (const entry of notified) {
    process.stdout.write(`  ${entry.code} ${entry.name} (${entry.createdAt}) ... `);

    const row: BacktestRow = {
      code: entry.code,
      name: entry.name,
      notifiedDate: entry.createdAt,
      score: entry.score,
      alertLevel: entry.alertLevel,
      rules: entry.rules ?? [],
      priority: entry.priority ?? "unknown",
      dataQuality: entry.dataQuality ?? "unknown",
      basePrice: null,
      "30d": { price: null, returnPct: null },
      "90d": { price: null, returnPct: null },
      "180d": { price: null, returnPct: null },
    };

    if (hasJquants) {
      try {
        const from = toCompactDate(entry.createdAt);
        const to = toCompactDate(addDaysJst(entry.createdAt, 200));
        const quotes = await fetchDailyQuotes(entry.code, from, to);
        const sorted = [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));

        row.basePrice = findPriceOnOrAfter(sorted, entry.createdAt);

        for (const days of [30, 90, 180] as const) {
          const targetDate = addDaysJst(entry.createdAt, days);
          // 未来日付はスキップ
          if (targetDate > today) continue;
          const price = findPriceOnOrAfter(sorted, targetDate);
          row[`${days}d`] = {
            price,
            returnPct: calcReturnPct(row.basePrice, price),
          };
        }

        console.log(row.basePrice ? `¥${row.basePrice.toLocaleString()}` : "価格なし");
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.log(`取得失敗 (${err instanceof Error ? err.message : err})`);
      }
    } else {
      console.log("skip (J-Quants未設定)");
    }

    rows.push(row);
  }

  // Markdown レポート生成
  const lines: string[] = [
    `# バックテスト結果`,
    ``,
    `生成日: ${today}  `,
    `通知後 30日 / 90日 / 180日 のリターン追跡`,
    ``,
    `> ※買い推奨ではありません。スクリーニング精度の確認用です。`,
    ``,
  ];

  if (!hasJquants) {
    lines.push(`> ⚠️ J-Quants未設定のため価格なし。履歴のみ表示します。`);
    lines.push(``);
  }

  lines.push(`## 通知履歴 × リターン`);
  lines.push(``);
  lines.push(`| 通知日 | コード | 銘柄名 | スコア | Lv | 通知時価格 | +30日 | +90日 | +180日 |`);
  lines.push(`|--------|--------|--------|--------|----|------------|-------|-------|--------|`);

  for (const r of [...rows].sort((a, b) => b.notifiedDate.localeCompare(a.notifiedDate))) {
    const lv = r.alertLevel === "urgent" ? "🚨" : "📋";
    const base = r.basePrice ? `¥${r.basePrice.toLocaleString()}` : "N/A";
    lines.push(
      `| ${r.notifiedDate} | ${r.code} | ${r.name} | ${r.score} | ${lv} | ${base} | ${fmtReturn(r["30d"])} | ${fmtReturn(r["90d"])} | ${fmtReturn(r["180d"])} |`
    );
  }

  lines.push(``);

  lines.push(...groupRows(rows, "スコア帯別成績", row => [scoreBand(row.score)]));
  lines.push(...groupRows(rows, "ルール別成績", row => row.rules.length > 0 ? row.rules : ["unknown"]));
  lines.push(...groupRows(rows, "優先度別成績", row => [row.priority]));

  // 統計サマリー
  const withData = rows.filter(r => r.basePrice != null);
  if (withData.length > 0) {
    lines.push(`## 全体統計 (価格データあり: ${withData.length}件)`);
    lines.push(``);
    lines.push(`| 期間 | 平均リターン | 中央値 | 勝率 |`);
    lines.push(`|------|------------|--------|------|`);

    for (const [key, label] of [["30d", "30日"], ["90d", "90日"], ["180d", "180日"]] as const) {
      const returns = rows
        .map(r => r[key].returnPct)
        .filter((v): v is number => v != null);
      if (returns.length === 0) continue;
      const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
      const med = median(returns);
      const wins = returns.filter(v => v > 0).length;
      const winRate = (wins / returns.length) * 100;
      lines.push(`| ${label} | ${fmtPct(avg)} | ${fmtPct(med)} | ${fmtPct(winRate)} (${wins}/${returns.length}) |`);
    }

    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`*alpha-pon v0.1 | ${today} | ※投資判断の参考情報ではありません*`);

  mkdirSync(reportsDir, { recursive: true });
  const outputPath = join(reportsDir, `backtest_${today}.md`);
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`\nレポート: ${outputPath}`);
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
