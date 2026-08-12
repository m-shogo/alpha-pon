import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { periodicReviewStart, type PeriodicReviewPeriod } from "./periodic-review-date.js";
import { loadAnalogyOutcomeRecords, type AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

type Period = PeriodicReviewPeriod;

type ScoreLogEntry = {
  code: string;
  name: string;
  priority?: string;
  tags?: string[];
  rules?: string[];
  score: number;
  alertLevel: string;
  warnings?: string[];
  negativeReasons?: string[];
  createdAt: string;
  expertReview?: { finalVerdict: string; consensusScore: number };
  riskReview?: { decision: string; blockers: string[] };
};

type OutcomeStats = {
  count: number;
  same: number;
  opposite: number;
  mixed: number;
  unknown: number;
  pricedCount: number;
  avgReturnPct: number | null;
  avgBenchmarkReturnPct: number | null;
  avgRelativeReturnPct: number | null;
  avgWinRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
  avgMaxDrawdownPct: number | null;
};

const period = (process.argv.includes("--monthly") ? "monthly" : "weekly") as Period;

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top(map: Map<string, number>, limit = 10): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function loadScoreLogs(): ScoreLogEntry[] {
  if (!existsSync("reports")) return [];
  return readdirSync("reports")
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .flatMap(file => {
      try {
        return JSON.parse(readFileSync(join("reports", file), "utf-8")) as ScoreLogEntry[];
      } catch {
        return [];
      }
    });
}

function outcomeStats(outcomes: AnalogyOutcomeRecord[]): OutcomeStats {
  const relativeReturns = outcomes.map(o => o.relativeReturnPct);
  return {
    count: outcomes.length,
    same: outcomes.filter(o => o.direction === "same").length,
    opposite: outcomes.filter(o => o.direction === "opposite").length,
    mixed: outcomes.filter(o => o.direction === "mixed").length,
    unknown: outcomes.filter(o => o.direction === "unknown").length,
    pricedCount: outcomes.filter(o => o.relativeReturnPct != null || o.returnPct != null).length,
    avgReturnPct: average(outcomes.map(o => o.returnPct)),
    avgBenchmarkReturnPct: average(outcomes.map(o => o.benchmarkReturnPct)),
    avgRelativeReturnPct: average(relativeReturns),
    avgWinRelativeReturnPct: average(relativeReturns.filter((value): value is number => typeof value === "number" && value > 0)),
    avgLossRelativeReturnPct: average(relativeReturns.filter((value): value is number => typeof value === "number" && value < 0)),
    avgMaxDrawdownPct: average(outcomes.map(o => o.maxDrawdownPct)),
  };
}

function expectation(stats: OutcomeStats): number {
  if (stats.count === 0) return 0;
  return (stats.same - stats.opposite) / stats.count;
}

function groupOutcomes(outcomes: AnalogyOutcomeRecord[], keyFn: (o: AnalogyOutcomeRecord) => string): Map<string, AnalogyOutcomeRecord[]> {
  const map = new Map<string, AnalogyOutcomeRecord[]>();
  for (const outcome of outcomes) {
    const key = keyFn(outcome);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(outcome);
  }
  return map;
}

function pushOutcomeTable(lines: string[], title: string, groups: Map<string, AnalogyOutcomeRecord[]>): void {
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| グループ | 件数 | 価格件数 | same | opposite | mixed | unknown | 方向性期待値 | 平均相対 | 平均勝ち幅 | 平均負け幅 | 平均最大下落 |");
  lines.push("|----------|------|----------|------|----------|-------|---------|--------------|----------|------------|------------|--------------|");
  for (const [key, group] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = outcomeStats(group);
    lines.push(`| ${key} | ${s.count} | ${s.pricedCount} | ${s.same} | ${s.opposite} | ${s.mixed} | ${s.unknown} | ${expectation(s).toFixed(2)} | ${fmtPct(s.avgRelativeReturnPct)} | ${fmtPct(s.avgWinRelativeReturnPct)} | ${fmtPct(s.avgLossRelativeReturnPct)} | ${fmtPct(s.avgMaxDrawdownPct)} |`);
  }
  lines.push("");
}

function main() {
  const today = todayJst();
  const start = periodicReviewStart(today, period);
  const scores = loadScoreLogs().filter(entry => entry.createdAt >= start && entry.createdAt <= today);
  const outcomes = loadAnalogyOutcomeRecords().filter(outcome => outcome.evaluatedAt >= start && outcome.evaluatedAt <= today);
  const warnings = new Map<string, number>();
  const blockers = new Map<string, number>();
  const rules = new Map<string, number>();
  const tags = new Map<string, number>();
  const weakLessons = new Map<string, number>();

  for (const entry of scores) {
    for (const warning of entry.warnings ?? []) increment(warnings, warning);
    for (const blocker of entry.riskReview?.blockers ?? []) increment(blockers, blocker);
    for (const rule of entry.rules ?? []) increment(rules, rule);
    for (const tag of entry.tags ?? []) increment(tags, tag);
  }
  for (const outcome of outcomes) {
    if (outcome.direction === "opposite" || outcome.quality === "misleading" || (outcome.relativeReturnPct ?? 0) < 0) {
      increment(weakLessons, outcome.lessonTitle);
    }
  }

  const s = outcomeStats(outcomes);
  const lines: string[] = [];
  lines.push(`# alpha-pon ${period === "weekly" ? "週次" : "月次"}レビュー`);
  lines.push("");
  lines.push(`対象期間: ${start} 〜 ${today}`);
  lines.push("");
  lines.push("> 毎日のニュース・銘柄スコア・類推答え合わせをまとめ、改善候補を出すためのレポートです。買い推奨ではありません。");
  lines.push("");
  lines.push("## サマリー");
  lines.push("");
  lines.push(`- スコアログ: ${scores.length}件`);
  lines.push(`- 類推レビュー: ${s.count}件`);
  lines.push(`- 価格レビュー: ${s.pricedCount}件`);
  lines.push(`- same/opposite/mixed/unknown: ${s.same}/${s.opposite}/${s.mixed}/${s.unknown}`);
  lines.push(`- 方向性期待値: ${expectation(s).toFixed(2)}`);
  lines.push(`- 平均相対リターン: ${fmtPct(s.avgRelativeReturnPct)}`);
  lines.push(`- 平均勝ち幅/負け幅: ${fmtPct(s.avgWinRelativeReturnPct)} / ${fmtPct(s.avgLossRelativeReturnPct)}`);
  lines.push(`- 平均最大下落: ${fmtPct(s.avgMaxDrawdownPct)}`);
  lines.push(`- 即通知: ${scores.filter(x => x.alertLevel === "urgent").length}件`);
  lines.push(`- 朝まとめ: ${scores.filter(x => x.alertLevel === "daily").length}件`);
  lines.push(`- expert strong: ${scores.filter(x => x.expertReview?.finalVerdict === "strong").length}件`);
  lines.push(`- expert block: ${scores.filter(x => x.expertReview?.finalVerdict === "block").length}件`);
  lines.push("");

  if (outcomes.length > 0) {
    pushOutcomeTable(lines, "時間軸別レビュー成績", groupOutcomes(outcomes, outcome => outcome.timeframe ?? "unknown"));
    pushOutcomeTable(lines, "過去事例別レビュー成績", groupOutcomes(outcomes, outcome => outcome.lessonTitle));
  }

  lines.push("## 頻出ルール・タグ");
  lines.push("");
  lines.push("### ルール");
  top(rules).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### タグ");
  top(tags).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");

  lines.push("## 反省・改善候補");
  lines.push("");
  if (s.count === 0) lines.push("- まだ答え合わせ件数が少ない。まずは1週間以上ログを貯める。");
  if (s.count > 0 && expectation(s) < 0) lines.push("- 期間全体の方向性期待値がマイナス。通知条件を厳しくし、反証条件の重みを上げる。");
  if (s.pricedCount > 0 && (s.avgRelativeReturnPct ?? 0) < 0) lines.push("- 期間全体の平均相対リターンがマイナス。same率だけでなく値幅の悪さを確認する。");
  if (s.avgLossRelativeReturnPct != null && s.avgWinRelativeReturnPct != null && Math.abs(s.avgLossRelativeReturnPct) > Math.abs(s.avgWinRelativeReturnPct)) {
    lines.push("- 平均負け幅が平均勝ち幅より大きい。通知条件を増やすより、反証条件・損失側の検出を優先する。");
  }
  if (top(weakLessons).length > 0) {
    lines.push("- 逆方向/ミスリード/相対リターン悪化が多い過去事例を確認する。");
    top(weakLessons, 5).forEach(([key, count]) => lines.push(`  - ${count}件: ${key}`));
  }
  if (top(blockers).length > 0) {
    lines.push("- 調査前ブロッカーが多い。候補発見よりデータ品質・流動性・財務安全性を優先改善する。");
    top(blockers, 5).forEach(([key, count]) => lines.push(`  - ${count}件: ${key}`));
  }
  if (top(warnings).length > 0) {
    lines.push("- 警告が多い項目を次の実装優先にする。");
    top(warnings, 5).forEach(([key, count]) => lines.push(`  - ${count}件: ${key}`));
  }
  lines.push("");

  lines.push("## 次の自動改善アクション案");
  lines.push("");
  lines.push("- oppositeが多い事例はスコアに使わず、反証質問の表示優先度を上げる。");
  lines.push("- sameが多くても平均相対リターンが弱い場合は、通知候補ではなく検証候補に留める。");
  lines.push("- unknownが多い場合は、価格データ・ベンチマーク・銘柄コードの欠損確認を優先する。");
  lines.push("- 週次/月次レビューを見て、しきい値変更は手動確認後に行う。自動でルール削除はしない。");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon periodic review | ${period} | ${today}*`);

  mkdirSync("reports", { recursive: true });
  const name = period === "weekly" ? "weekly_review" : "monthly_review";
  writeFileSync(join("reports", `${name}_${today}.md`), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", `${name}_latest.md`), lines.join("\n"), "utf-8");
  console.log(`レポート: reports/${name}_${today}.md`);
}

main();
