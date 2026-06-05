// 特殊状況 outcome seed レポートの構造テスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 1) reports が生成されているか
const reportData = readJson("reports/special_situation_outcome_seed_latest.json");
assert(reportData !== null, "reports/special_situation_outcome_seed_latest.json は必ず生成される必要があります");
assert(isObject(reportData), "seed report は object である必要があります");

// 2) 必須フィールド
assert(typeof reportData.dryRun === "boolean", "dryRun は boolean");
assert(isObject(reportData.summary), "summary は object");
assert(Array.isArray(reportData.seedPreview), "seedPreview は配列");
assert(Array.isArray(reportData.skipped), "skipped は配列");
assert(Array.isArray(reportData.notes), "notes は配列");

// 3) summary フィールド
{
  const s = reportData.summary as Record<string, unknown>;
  assert(typeof s.candidates === "number", "summary.candidates は number");
  assert(typeof s.existingSpecialOutcomes === "number", "summary.existingSpecialOutcomes は number");
  assert(typeof s.seedableCandidates === "number", "summary.seedableCandidates は number");
  assert(typeof s.seedableOutcomes === "number", "summary.seedableOutcomes は number");
  assert(typeof s.createdOutcomes === "number", "summary.createdOutcomes は number");
  assert(typeof s.skippedCandidates === "number", "summary.skippedCandidates は number");
  assert(typeof s.ambiguousDuplicates === "number", "summary.ambiguousDuplicates は number");
}

// 4) dryRun=true の時、seedPreview[].willWrite は全て false
if (reportData.dryRun === true) {
  for (const item of reportData.seedPreview as Array<Record<string, unknown>>) {
    assert(item.willWrite === false,
      `dryRun=true のとき seedPreview.willWrite は false でなければならない (code=${item.code})`);
  }
}

// 5) seedPreview 各行の検証
const ALLOWED_HORIZONS = new Set(["1d", "1w", "1m", "3m"]);
for (const item of reportData.seedPreview as Array<Record<string, unknown>>) {
  assert(typeof item.code === "string" && item.code.length > 0, "seedPreview.code は非空 string");
  assert(typeof item.name === "string", "seedPreview.name は string");
  assert(Array.isArray(item.horizons), "seedPreview.horizons は配列");
  for (const h of item.horizons as string[]) {
    assert(ALLOWED_HORIZONS.has(h), `不正な horizon: ${h}`);
  }
  assert(typeof item.detectedAt === "string", "seedPreview.detectedAt は string");
  assert(Array.isArray(item.outcomeKeys), "seedPreview.outcomeKeys は配列");
  assert(typeof item.willWrite === "boolean", "seedPreview.willWrite は boolean");
  assert(typeof item.reason === "string", "seedPreview.reason は string");
}

// 6) skipped 各行の検証
const ALLOWED_SKIP_REASONS = new Set([
  "already_has_special_outcome",
  "ambiguous_duplicate",
  "missing_candidate_data",
  "not_seedable",
]);
for (const item of reportData.skipped as Array<Record<string, unknown>>) {
  assert(typeof item.code === "string", "skipped.code は string");
  assert(ALLOWED_SKIP_REASONS.has(item.reason as string), `不正な skip reason: ${item.reason}`);
  assert(typeof item.detail === "string", "skipped.detail は string");
}

// 7) notes に免責事項
assert(
  (reportData.notes as string[]).some(n => n.includes("売買推奨ではありません")),
  "notes に「売買推奨ではありません」が含まれる"
);

// 8) 禁止文言テスト
const text = JSON.stringify(reportData) + "\n" + (existsSync("reports/special_situation_outcome_seed_latest.md")
  ? readFileSync("reports/special_situation_outcome_seed_latest.md", "utf-8")
  : "");
for (const forbidden of ["買うべき", "売るべき", "必ず上がる", "確実に上がる", "推奨銘柄"]) {
  assert(!text.includes(forbidden), `禁止文言 ${forbidden} を含めない`);
}

console.log("special-situation-outcome-seed.test.ts passed");
