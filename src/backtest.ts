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
  basePrice: number | null;
  "30d": ReturnData;
  "90d": ReturnData;
  "180d": ReturnData;
};

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

  // 統計サマリー
  const withData = rows.filter(r => r.basePrice != null);
  if (withData.length > 0) {
    lines.push(`## 統計 (価格データあり: ${withData.length}件)`);
    lines.push(``);
    lines.push(`| 期間 | 平均リターン | 勝率 |`);
    lines.push(`|------|------------|------|`);

    for (const [key, label] of [["30d", "30日"], ["90d", "90日"], ["180d", "180日"]] as const) {
      const valid = rows.filter(r => r[key].returnPct != null);
      if (valid.length === 0) continue;
      const avg = valid.reduce((s, r) => s + (r[key].returnPct ?? 0), 0) / valid.length;
      const wins = valid.filter(r => (r[key].returnPct ?? 0) > 0).length;
      const winRate = ((wins / valid.length) * 100).toFixed(0);
      const sign = avg >= 0 ? "+" : "";
      lines.push(`| ${label} | ${sign}${avg.toFixed(1)}% | ${winRate}% (${wins}/${valid.length}) |`);
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
