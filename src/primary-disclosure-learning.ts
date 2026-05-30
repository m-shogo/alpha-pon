import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { loadAnalogyOutcomeRecords, type AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

type PrimaryDecision = "confirmed" | "caution" | "block" | "missing" | "unknown_or_legacy";

type ScoreLogEntry = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  createdAt: string;
  primaryDisclosureReview?: {
    decision?: PrimaryDecision;
    sourceCoverage?: {
      tdnetCount?: number;
      edinetCount?: number;
      scannedEdinetDates?: string[];
      fetchErrorCount?: number;
    };
    positives?: string[];
    warnings?: string[];
    blockers?: string[];
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

function decisionForOutcome(outcome: AnalogyOutcomeRecord, scoreMap: Map<string, ScoreLogEntry>): PrimaryDecision {
  if (!outcome.candidateCode) return "unknown_or_legacy";
  const score = scoreMap.get(`${outcome.createdAt}_${outcome.candidateCode}`);
  return score?.primaryDisclosureReview?.decision ?? "unknown_or_legacy";
}

function groupOutcomes(outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>): Map<PrimaryDecision, AnalogyOutcomeRecord[]> {
  const groups = new Map<PrimaryDecision, AnalogyOutcomeRecord[]>();
  for (const outcome of outcomes) {
    const key = decisionForOutcome(outcome, scoreMap);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(outcome);
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

function top(map: Map<string, number>, limit = 12): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function main() {
  const date = todayJst();
  const scores = loadScoreLogs();
  const outcomes = loadAnalogyOutcomeRecords();
  const scoreMap = scoreByCodeDate(scores);
  const groups = groupOutcomes(outcomes, scoreMap);
  const blockerTitles = new Map<string, number>();
  const cautionTitles = new Map<string, number>();
  const positiveTitles = new Map<string, number>();

  for (const score of scores) {
    for (const item of score.primaryDisclosureReview?.blockers ?? []) increment(blockerTitles, item);
    for (const item of score.primaryDisclosureReview?.warnings ?? []) increment(cautionTitles, item);
    for (const item of score.primaryDisclosureReview?.positives ?? []) increment(positiveTitles, item);
  }

  const decisions: PrimaryDecision[] = ["confirmed", "caution", "block", "missing", "unknown_or_legacy"];
  const lines: string[] = [];
  lines.push("# alpha-pon 一次情報 学習レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> TDnet / EDINET の一次情報判定ごとに、類推レビュー結果を見ます。買い推奨ではなく、事故防止と検証用です。");
  lines.push("");

  lines.push("## dailyログ側の一次情報カバレッジ");
  lines.push("");
  lines.push(`- scores: ${scores.length}件`);
  lines.push(`- confirmed: ${scores.filter(s => s.primaryDisclosureReview?.decision === "confirmed").length}件`);
  lines.push(`- caution: ${scores.filter(s => s.primaryDisclosureReview?.decision === "caution").length}件`);
  lines.push(`- block: ${scores.filter(s => s.primaryDisclosureReview?.decision === "block").length}件`);
  lines.push(`- missing/legacy: ${scores.filter(s => !s.primaryDisclosureReview || s.primaryDisclosureReview.decision === "missing").length}件`);
  const scannedDates = [...new Set(scores.flatMap(s => s.primaryDisclosureReview?.sourceCoverage?.scannedEdinetDates ?? []))];
  if (scannedDates.length > 0) lines.push(`- EDINET確認日: ${scannedDates.join(" / ")}`);
  lines.push("");

  lines.push("## 一次情報判定別 類推レビュー成績");
  lines.push("");
  lines.push("| 判定 | 件数 | same | opposite | mixed | unknown | 方向性期待値 | 平均相対 | 平均負け幅 | 平均最大下落 |");
  lines.push("|------|------|------|----------|-------|---------|--------------|----------|------------|--------------|");
  for (const decision of decisions) {
    const stats = calcStats(groups.get(decision) ?? []);
    lines.push(`| ${decision} | ${stats.count} | ${stats.same} | ${stats.opposite} | ${stats.mixed} | ${stats.unknown} | ${expectation(stats).toFixed(2)} | ${fmtPct(stats.avgRelativeReturnPct)} | ${fmtPct(stats.avgLossRelativeReturnPct)} | ${fmtPct(stats.avgMaxDrawdownPct)} |`);
  }
  lines.push("");

  lines.push("## 頻出一次情報");
  lines.push("");
  lines.push("### block");
  top(blockerTitles).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### caution");
  top(cautionTitles).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### confirmed");
  top(positiveTitles).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");

  lines.push("## 改善案");
  lines.push("");
  const missingStats = calcStats(groups.get("missing") ?? []);
  const confirmedStats = calcStats(groups.get("confirmed") ?? []);
  const cautionStats = calcStats(groups.get("caution") ?? []);
  if (missingStats.count >= 5 && (missingStats.avgRelativeReturnPct ?? 0) < 0) {
    lines.push("- 一次情報missingの平均相対リターンが弱い。ニュース単独候補は通知を弱め、公式IR確認を必須化する。");
  }
  if (cautionStats.count >= 3 && cautionStats.opposite > cautionStats.same) {
    lines.push("- caution判定の逆方向が多い。即通知ではなく朝まとめ/ログ扱いを維持する。");
  }
  if (confirmedStats.count >= 5 && (confirmedStats.avgRelativeReturnPct ?? 0) < 0) {
    lines.push("- confirmedでも平均相対が弱い。開示種類別に細分化し、良い開示を過信しない。");
  }
  lines.push("- block判定はスコアに関係なく通知抑制する方針を維持する。");
  lines.push("- confirmedは買い材料ではなく、裏取り済みの調査材料として扱う。");
  lines.push("- EDINET取得日数は `PRIMARY_DISCLOSURE_EDINET_DAYS` で調整する。");
  lines.push("");

  lines.push("---");
  lines.push(`*alpha-pon primary disclosure learning | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `primary_disclosure_learning_${date}.md`), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "primary_disclosure_learning_latest.md"), lines.join("\n"), "utf-8");
  console.log(`レポート: reports/primary_disclosure_learning_${date}.md`);
}

main();
