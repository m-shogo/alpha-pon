// 世界情勢候補仮説の手動評価を記録する。
// 例:
//   node --import tsx/esm src/world-theme-candidate-review-result.ts <hypothesisId> 30 hit "一次情報で受注接続を確認"

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { todayJst } from "./date.js";

const HYPOTHESIS_PATH = "data/world_theme_candidate_hypotheses.jsonl";
const RESULT_PATH = "data/world_theme_candidate_review_results.jsonl";

type ReviewResult = "hit" | "miss" | "too_early" | "priced_in" | "unclear";

type PersistedWorldThemeCandidateHypothesis = {
  hypothesisId: string;
  detectedAt: string;
  sourceEventTitle: string;
  theme: string;
  candidateCode: string;
  candidateCompany: string;
};

type ManualReviewResult = {
  schemaVersion: 1;
  hypothesisId: string;
  reviewedAt: string;
  afterDays: 30 | 90 | 180;
  result: ReviewResult;
  memo: string;
  theme: string;
  candidateCode: string;
  candidateCompany: string;
  sourceEventTitle: string;
};

function usage(): string {
  return [
    "使い方:",
    "  node --import tsx/esm src/world-theme-candidate-review-result.ts <hypothesisId> <30|90|180> <hit|miss|too_early|priced_in|unclear> [memo]",
    "",
    "例:",
    "  node --import tsx/esm src/world-theme-candidate-review-result.ts 2026-06-29__space__7011__xxx 30 too_early \"一次情報は未確認\"",
  ].join("\n");
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function parseAfterDays(value: string | undefined): 30 | 90 | 180 {
  if (value === "30" || value === "90" || value === "180") return Number(value) as 30 | 90 | 180;
  throw new Error(usage());
}

function parseResult(value: string | undefined): ReviewResult {
  if (value === "hit" || value === "miss" || value === "too_early" || value === "priced_in" || value === "unclear") return value;
  throw new Error(usage());
}

function main(): void {
  const [, , hypothesisId, afterDaysRaw, resultRaw, ...memoParts] = process.argv;
  if (!hypothesisId) throw new Error(usage());
  const afterDays = parseAfterDays(afterDaysRaw);
  const result = parseResult(resultRaw);
  const hypotheses = readJsonl<PersistedWorldThemeCandidateHypothesis>(HYPOTHESIS_PATH);
  const hypothesis = hypotheses.find(row => row.hypothesisId === hypothesisId);
  if (!hypothesis) throw new Error(`hypothesisId が見つかりません: ${hypothesisId}`);

  const record: ManualReviewResult = {
    schemaVersion: 1,
    hypothesisId,
    reviewedAt: todayJst(),
    afterDays,
    result,
    memo: memoParts.join(" "),
    theme: hypothesis.theme,
    candidateCode: hypothesis.candidateCode,
    candidateCompany: hypothesis.candidateCompany,
    sourceEventTitle: hypothesis.sourceEventTitle,
  };

  mkdirSync("data", { recursive: true });
  appendFileSync(RESULT_PATH, `${JSON.stringify(record)}\n`, "utf-8");
  console.log(`world theme review result added: ${hypothesis.candidateCode} ${hypothesis.candidateCompany} ${afterDays}d ${result}`);
}

main();
