import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { loadAnalogyOutcomeRecords, type AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

type ScoreLogEntry = {
  code: string;
  name: string;
  createdAt: string;
  primaryDisclosureReview?: {
    decision?: string;
    items?: Array<{
      source: string;
      title: string;
      category: string;
      severity: string;
      publishedAt: string;
    }>;
  };
};

type Stats = {
  count: number;
  same: number;
  opposite: number;
  mixed: number;
  unknown: number;
  avgRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
  avgMaxDrawdownPct: number | null;
};

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

function scoreByCodeDate(entries: ScoreLogEntry[]): Map<string, ScoreLogEntry> {
  const map = new Map<string, ScoreLogEntry>();
  for (const entry of entries) map.set(`${entry.createdAt}_${entry.code}`, entry);
  return map;
}

function categoriesForOutcome(outcome: AnalogyOutcomeRecord, scoreMap: Map<string, ScoreLogEntry>): string[] {
  if (!outcome.candidateCode) return ["unknown_or_legacy"];
  const score = scoreMap.get(`${outcome.createdAt}_${outcome.candidateCode}`);
  const items = score?.primaryDisclosureReview?.items ?? [];
  if (items.length === 0) return [score?.primaryDisclosureReview?.decision ?? "missing"];
  return [...new Set(items.map(item => `${item.category}:${item.severity}`))];
}

function groupOutcomes(outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>): Map<string, AnalogyOutcomeRecord[]> {
  const groups = new Map<string, AnalogyOutcomeRecord[]>();
  for (const outcome of outcomes) {
    for (const key of categoriesForOutcome(outcome, scoreMap)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(outcome);
    }
  }
  return groups;
}

function calcStats(outcomes: AnalogyOutcomeRecord[]): Stats {
  const relativeReturns = outcomes.map(outcome => outcome.relativeReturnPct);
  return {
    count: outcomes.length,
    same: outcomes.filter(outcome => outcome.direction === "same").length,
    opposite: outcomes.filter(outcome => outcome.direction === "opposite").length,
    mixed: outcomes.filter(outcome => outcome.direction === "mixed").length,
    unknown: outcomes.filter(outcome => outcome.direction === "unknown").length,
    avgRelativeReturnPct: average(relativeReturns),
    avgLossRelativeReturnPct: average(relativeReturns.filter((value): value is number => typeof value === "number" && value < 0)),
    avgMaxDrawdownPct: average(outcomes.map(outcome => outcome.maxDrawdownPct)),
  };
}

function expectation(stats: Stats): number {
  if (stats.count === 0) return 0;
  return (stats.same - stats.opposite) / stats.count;
}

function increment(map: Map<string, number>, value: string): void {
  map.set(value, (map.get(value) ?? 0) + 1);
}

function top(map: Map<string, number>, limit = 15): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function main() {
  const date = todayJst();
  const scores = loadScoreLogs();
  const outcomes = loadAnalogyOutcomeRecords();
  const scoreMap = scoreByCodeDate(scores);
  const groups = groupOutcomes(outcomes, scoreMap);
  const categoryCounts = new Map<string, number>();
  const severityCounts = new Map<string, number>();

  for (const score of scores) {
    for (const item of score.primaryDisclosureReview?.items ?? []) {
      increment(categoryCounts, item.category);
      increment(severityCounts, `${item.category}:${item.severity}`);
    }
  }

  const lines: string[] = [];
  lines.push("# alpha-pon 一次情報カテゴリ別 学習レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 一次情報の大分類ごとに、類推レビュー結果を確認します。買い推奨ではなく、分類改善と事故防止のためのレポートです。");
  lines.push("");

  lines.push("## 開示カテゴリ出現数");
  lines.push("");
  top(categoryCounts).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");

  lines.push("## 開示カテゴリ x severity 出現数");
  lines.push("");
  top(severityCounts).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");

  lines.push("## 開示カテゴリ別 類推レビュー成績");
  lines.push("");
  lines.push("| カテゴリ | 件数 | same | opposite | mixed | unknown | 方向性期待値 | 平均相対 | 平均負け幅 | 平均最大下落 |");
  lines.push("|----------|------|------|----------|-------|---------|--------------|----------|------------|--------------|");
  for (const [key, group] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const stats = calcStats(group);
    lines.push(`| ${key} | ${stats.count} | ${stats.same} | ${stats.opposite} | ${stats.mixed} | ${stats.unknown} | ${expectation(stats).toFixed(2)} | ${fmtPct(stats.avgRelativeReturnPct)} | ${fmtPct(stats.avgLossRelativeReturnPct)} | ${fmtPct(stats.avgMaxDrawdownPct)} |`);
  }
  lines.push("");

  lines.push("## 改善案");
  lines.push("");
  lines.push("- confirmed でもカテゴリ別に弱いものがあれば、良い開示として過信しない。");
  lines.push("- caution/block のカテゴリは通知抑制が効いているか、平均相対と負け幅で確認する。");
  lines.push("- 件数が少ないカテゴリは結論を出さず、まずログを貯める。");
  lines.push("- 次段階では、カテゴリ内のサブタイプを手動で追加する。");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon primary disclosure category learning | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `primary_disclosure_category_learning_${date}.md`), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "primary_disclosure_category_learning_latest.md"), lines.join("\n"), "utf-8");
  console.log(`レポート: reports/primary_disclosure_category_learning_${date}.md`);
}

main();
