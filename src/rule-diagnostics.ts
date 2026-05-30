import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { loadAnalogyOutcomeRecords, type AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

type RuleDiagnosis =
  | "delete_candidate"
  | "weaken_candidate"
  | "condition_required"
  | "needs_more_data"
  | "keep_monitoring";

type ScoreLogEntry = {
  code: string;
  name: string;
  rules?: string[];
  score: number;
  alertLevel: string;
  createdAt: string;
};

type RuleStats = {
  rule: string;
  count: number;
  pricedCount: number;
  same: number;
  opposite: number;
  mixed: number;
  unknown: number;
  directionExpectation: number;
  avgRelativeReturnPct: number | null;
  avgWinRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
  avgMaxDrawdownPct: number | null;
  diagnosis: RuleDiagnosis;
  reason: string;
  action: string;
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
  for (const entry of entries) {
    map.set(`${entry.createdAt}_${entry.code}`, entry);
  }
  return map;
}

function groupOutcomesByRule(outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>): Map<string, AnalogyOutcomeRecord[]> {
  const groups = new Map<string, AnalogyOutcomeRecord[]>();

  for (const outcome of outcomes) {
    if (!outcome.candidateCode) continue;
    const score = scoreMap.get(`${outcome.createdAt}_${outcome.candidateCode}`);
    const rules = score?.rules?.length ? score.rules : ["unknown"];

    for (const rule of rules) {
      if (!groups.has(rule)) groups.set(rule, []);
      groups.get(rule)!.push(outcome);
    }
  }

  return groups;
}

function directionExpectation(outcomes: AnalogyOutcomeRecord[]): number {
  if (outcomes.length === 0) return 0;
  const same = outcomes.filter(o => o.direction === "same").length;
  const opposite = outcomes.filter(o => o.direction === "opposite").length;
  return (same - opposite) / outcomes.length;
}

function diagnose(input: {
  count: number;
  pricedCount: number;
  directionExpectation: number;
  avgRelativeReturnPct: number | null;
  avgLossRelativeReturnPct: number | null;
  avgWinRelativeReturnPct: number | null;
}): { diagnosis: RuleDiagnosis; reason: string; action: string } {
  const avgRelative = input.avgRelativeReturnPct ?? 0;
  const lossAbs = Math.abs(input.avgLossRelativeReturnPct ?? 0);
  const winAbs = Math.abs(input.avgWinRelativeReturnPct ?? 0);

  if (input.count < 10 || input.pricedCount < 5) {
    return {
      diagnosis: "needs_more_data",
      reason: `件数不足 count=${input.count}, priced=${input.pricedCount}`,
      action: "結論を出さずログを貯める。しきい値やルール削除はしない。",
    };
  }

  if (input.count >= 30 && input.pricedCount >= 15 && input.directionExpectation < -0.2 && avgRelative < -2) {
    return {
      diagnosis: "delete_candidate",
      reason: `方向性期待値 ${input.directionExpectation.toFixed(2)} かつ平均相対 ${fmtPct(input.avgRelativeReturnPct)} が十分悪い`,
      action: "即削除ではなく、rules.yml から外す候補として手動レビューする。代替条件がなければ無効化を検討。",
    };
  }

  if (input.count >= 20 && input.pricedCount >= 10 && avgRelative < -1) {
    return {
      diagnosis: "condition_required",
      reason: `平均相対 ${fmtPct(input.avgRelativeReturnPct)} が悪い` ,
      action: "ルール自体を消す前に、財務品質・流動性・一次情報確認・過熱リスクなどの追加条件を要求する。",
    };
  }

  if (input.count >= 10 && input.directionExpectation < 0) {
    return {
      diagnosis: "weaken_candidate",
      reason: `方向性期待値 ${input.directionExpectation.toFixed(2)} がマイナス`,
      action: "スコア加点を弱める候補。通知条件ではなく調査候補止まりにする。",
    };
  }

  if (input.pricedCount >= 10 && winAbs > 0 && lossAbs > winAbs) {
    return {
      diagnosis: "condition_required",
      reason: `平均負け幅 ${fmtPct(input.avgLossRelativeReturnPct)} が平均勝ち幅 ${fmtPct(input.avgWinRelativeReturnPct)} より大きい`,
      action: "反証条件・最大下落・短期過熱チェックを強化する。",
    };
  }

  return {
    diagnosis: "keep_monitoring",
    reason: "現時点で明確な悪化は未検出",
    action: "継続監視。件数が増えるまで自動変更はしない。",
  };
}

function buildRuleStats(rule: string, outcomes: AnalogyOutcomeRecord[]): RuleStats {
  const relativeReturns = outcomes.map(o => o.relativeReturnPct);
  const stats = {
    count: outcomes.length,
    pricedCount: outcomes.filter(o => o.relativeReturnPct != null || o.returnPct != null).length,
    same: outcomes.filter(o => o.direction === "same").length,
    opposite: outcomes.filter(o => o.direction === "opposite").length,
    mixed: outcomes.filter(o => o.direction === "mixed").length,
    unknown: outcomes.filter(o => o.direction === "unknown").length,
    directionExpectation: directionExpectation(outcomes),
    avgRelativeReturnPct: average(relativeReturns),
    avgWinRelativeReturnPct: average(relativeReturns.filter((value): value is number => typeof value === "number" && value > 0)),
    avgLossRelativeReturnPct: average(relativeReturns.filter((value): value is number => typeof value === "number" && value < 0)),
    avgMaxDrawdownPct: average(outcomes.map(o => o.maxDrawdownPct)),
  };
  const result = diagnose(stats);

  return {
    rule,
    ...stats,
    diagnosis: result.diagnosis,
    reason: result.reason,
    action: result.action,
  };
}

function diagnosisRank(diagnosis: RuleDiagnosis): number {
  return {
    delete_candidate: 0,
    condition_required: 1,
    weaken_candidate: 2,
    needs_more_data: 3,
    keep_monitoring: 4,
  }[diagnosis];
}

function renderMarkdown(date: string, rows: RuleStats[]): string {
  const lines: string[] = [];
  lines.push("# alpha-pon ルール診断レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 類推レビュー outcome DB を使い、弱いルールを分類するためのレポートです。");
  lines.push("> 自動で rules.yml を変更しません。削除・弱体化・条件追加は人間が確認してから行います。");
  lines.push("");

  lines.push("## サマリー");
  lines.push("");
  for (const diagnosis of ["delete_candidate", "condition_required", "weaken_candidate", "needs_more_data", "keep_monitoring"] as const) {
    lines.push(`- ${diagnosis}: ${rows.filter(row => row.diagnosis === diagnosis).length}件`);
  }
  lines.push("");

  lines.push("## ルール別診断");
  lines.push("");
  lines.push("| rule | 診断 | 件数 | 価格件数 | same | opposite | mixed | 方向性期待値 | 平均相対 | 平均勝ち幅 | 平均負け幅 | 平均最大下落 | 理由 |");
  lines.push("|------|------|------|----------|------|----------|-------|--------------|----------|------------|------------|--------------|------|");
  for (const row of rows) {
    lines.push(`| ${row.rule} | ${row.diagnosis} | ${row.count} | ${row.pricedCount} | ${row.same} | ${row.opposite} | ${row.mixed} | ${row.directionExpectation.toFixed(2)} | ${fmtPct(row.avgRelativeReturnPct)} | ${fmtPct(row.avgWinRelativeReturnPct)} | ${fmtPct(row.avgLossRelativeReturnPct)} | ${fmtPct(row.avgMaxDrawdownPct)} | ${row.reason} |`);
  }
  lines.push("");

  lines.push("## 推奨アクション");
  lines.push("");
  for (const row of rows.filter(r => r.diagnosis !== "keep_monitoring")) {
    lines.push(`### ${row.rule}`);
    lines.push(`- 診断: ${row.diagnosis}`);
    lines.push(`- 理由: ${row.reason}`);
    lines.push(`- 対応案: ${row.action}`);
    lines.push("");
  }

  lines.push("## 安全原則");
  lines.push("");
  lines.push("- 自動でルール削除しない");
  lines.push("- 件数不足のルールは結論を出さない");
  lines.push("- 方向性期待値だけでなく平均相対リターンと負け幅を見る");
  lines.push("- 削除候補でも、まず反証条件・追加条件で改善できるか確認する");
  lines.push("- 買い推奨ではなく、調査・検証・反省用に限定する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon rule diagnostics | ${date} | ※買い推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const date = todayJst();
  const scores = loadScoreLogs();
  const outcomes = loadAnalogyOutcomeRecords();
  const scoreMap = scoreByCodeDate(scores);
  const groups = groupOutcomesByRule(outcomes, scoreMap);
  const rows = [...groups.entries()]
    .map(([rule, group]) => buildRuleStats(rule, group))
    .sort((a, b) => diagnosisRank(a.diagnosis) - diagnosisRank(b.diagnosis) || b.count - a.count);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `rule_diagnostics_${date}.json`), JSON.stringify(rows, null, 2), "utf-8");
  writeFileSync(join("reports", "rule_diagnostics_latest.json"), JSON.stringify(rows, null, 2), "utf-8");
  writeFileSync(join("reports", `rule_diagnostics_${date}.md`), renderMarkdown(date, rows), "utf-8");
  writeFileSync(join("reports", "rule_diagnostics_latest.md"), renderMarkdown(date, rows), "utf-8");
  console.log(`レポート: reports/rule_diagnostics_${date}.md`);
}

main();
