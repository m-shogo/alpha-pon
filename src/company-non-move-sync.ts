import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import type { AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

type CompanyNonMoveRow = {
  date: string;
  code: string;
  name: string;
  category: string;
  hypothesis: string;
  outcome: string;
  nonMoveReasons: string[];
  lesson: string;
  nextAction: string;
  source: string;
};

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function existingKeys(path: string): Set<string> {
  return new Set(readJsonl<CompanyNonMoveRow>(path).map(row => `${row.date}:${row.code}:${row.source}`));
}

function inferReasons(outcome: AnalogyOutcomeRecord): string[] {
  const reasons = new Set<string>();
  if (outcome.direction === "opposite") reasons.add("theme_right_company_wrong");
  if (outcome.direction === "mixed") reasons.add("theme_right_timing_wrong");
  if (outcome.direction === "unknown") reasons.add("unknown_or_insufficient_data");
  if ((outcome.relativeReturnPct ?? 0) < 0) reasons.add("already_priced_in");
  if (outcome.dataAvailability === "missing") reasons.add("unknown_or_insufficient_data");
  for (const signal of outcome.missedSignals ?? []) {
    if (signal.includes("一次情報")) reasons.add("primary_source_missing");
    if (signal.includes("織り込み")) reasons.add("already_priced_in");
    if (signal.includes("流動性")) reasons.add("liquidity_problem");
    if (signal.includes("増資") || signal.includes("希薄")) reasons.add("dilution_or_supply_pressure");
  }
  if (reasons.size === 0) reasons.add("unknown_or_insufficient_data");
  return [...reasons];
}

function main() {
  const date = todayJst();
  const outcomes = readJsonl<AnalogyOutcomeRecord>(join("data", "analogy_outcomes.jsonl"));
  const targetPath = join("data", "company_non_move_history.jsonl");
  const keys = existingKeys(targetPath);
  const rows: CompanyNonMoveRow[] = [];

  for (const outcome of outcomes) {
    if (!outcome.candidateCode || !outcome.candidateName) continue;
    if (!["opposite", "mixed", "unknown"].includes(outcome.direction)) continue;
    const source = `analogy:${outcome.eventId ?? outcome.lessonId}:${outcome.timeframe ?? "unknown"}`;
    const key = `${outcome.evaluatedAt ?? date}:${outcome.candidateCode}:${source}`;
    if (keys.has(key)) continue;

    rows.push({
      date: outcome.evaluatedAt ?? date,
      code: outcome.candidateCode,
      name: outcome.candidateName,
      category: outcome.lessonTitle,
      hypothesis: outcome.actualOutcome || outcome.lessonTitle,
      outcome: outcome.direction,
      nonMoveReasons: inferReasons(outcome),
      lesson: outcome.whatDiffered?.slice(0, 3).join(" / ") || "外れ方を確認する",
      nextAction: outcome.improvedRuleIdeas?.slice(0, 3).join(" / ") || "一次情報・価格・関連会社を再確認する",
      source,
    });
  }

  if (rows.length > 0) {
    mkdirSync("data", { recursive: true });
    appendFileSync(targetPath, `${rows.map(row => JSON.stringify(row)).join("\n")}\n`, "utf-8");
  }

  console.log(`company non-move synced: ${rows.length}`);
}

main();
