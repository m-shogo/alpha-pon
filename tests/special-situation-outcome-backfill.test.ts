// 特殊状況 outcome backfill レポートの構造テスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { statSync } from "fs";
import { partitionSpecialSituationOutcomesByDetectedAt } from "../src/special-situation-review-due-date.js";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// backfill が期限計算・価格取得へ渡す前に、不正 detectedAt を隔離できることを固定する。
{
  const rows = [
    { id: "valid", hypothesis: { detectedAt: "2026-08-07" }, reviewHorizon: "1d" as const },
    { id: "impossible", hypothesis: { detectedAt: "2026-02-31" }, reviewHorizon: "1d" as const },
    { id: "year-zero", hypothesis: { detectedAt: "0000-01-01" }, reviewHorizon: "1d" as const },
  ];
  const partitioned = partitionSpecialSituationOutcomesByDetectedAt(rows);
  assert.deepEqual(partitioned.valid.map(row => row.id), ["valid"]);
  assert.deepEqual(partitioned.invalid.map(row => row.id), ["impossible", "year-zero"]);
}

// backfill report が生成されているか
const reportData = readJson("reports/special_situation_outcome_backfill_latest.json");
assert(reportData !== null, "reports/special_situation_outcome_backfill_latest.json は必ず生成される必要があります");
assert(isObject(reportData), "backfill report は object である必要があります");

// 必須フィールドの検証
assert(typeof reportData.dryRun === "boolean", "dryRun は boolean");
assert(isObject(reportData.summary), "summary は object");
assert(isObject(reportData.missing), "missing は object");
assert(isObject(reportData.notDueYet), "notDueYet は object");
assert(Array.isArray(reportData.byCode), "byCode は配列");
assert(Array.isArray(reportData.updatesPreview), "updatesPreview は配列");
assert(Array.isArray(reportData.notes), "notes は配列");

// summary フィールド
{
  const s = reportData.summary as Record<string, unknown>;
  assert(typeof s.candidates === "number", "summary.candidates は number");
  assert(typeof s.matchedOutcomes === "number", "summary.matchedOutcomes は number");
  assert(typeof s.updatableOutcomes === "number", "summary.updatableOutcomes は number");
  assert(typeof s.updatedOutcomes === "number", "summary.updatedOutcomes は number");
  assert(typeof s.notDueYet === "number", "summary.notDueYet は number");
}

// missing フィールド
{
  const m = reportData.missing as Record<string, unknown>;
  assert(typeof m.result === "number", "missing.result は number");
  assert(typeof m.return1w === "number", "missing.return1w は number");
  assert(typeof m.return1m === "number", "missing.return1m は number");
  assert(typeof m.topixRelative1m === "number", "missing.topixRelative1m は number");
}

// notDueYet フィールド
{
  const n = reportData.notDueYet as Record<string, unknown>;
  assert(typeof n.return1w === "number", "notDueYet.return1w は number");
  assert(typeof n.return1m === "number", "notDueYet.return1m は number");
}

// byCode 各行の検証
for (const row of reportData.byCode as Array<Record<string, unknown>>) {
  assert(typeof row.code === "string", "byCode.code は string");
  assert(typeof row.name === "string", "byCode.name は string");
  assert(typeof row.matchedOutcomes === "number", "byCode.matchedOutcomes は number");
  assert(typeof row.updatable === "number", "byCode.updatable は number");
  assert(typeof row.updated === "number", "byCode.updated は number");
  assert(typeof row.skipped === "number", "byCode.skipped は number");
  assert(Array.isArray(row.missingReasons), "byCode.missingReasons は配列");
  assert(typeof row.nextAction === "string" && row.nextAction.length > 0, "byCode.nextAction は非空 string");
}

// updatesPreview 各行の検証
for (const u of reportData.updatesPreview as Array<Record<string, unknown>>) {
  assert(typeof u.code === "string", "updatesPreview.code は string");
  assert(typeof u.outcomeKey === "string", "updatesPreview.outcomeKey は string");
  assert(Array.isArray(u.fieldsToFill), "updatesPreview.fieldsToFill は配列");
  assert(typeof u.reason === "string", "updatesPreview.reason は string");
  assert(typeof u.willWrite === "boolean", "updatesPreview.willWrite は boolean");
}

// dry-run では data/hypothesis_outcomes.jsonl が変更されていないことを確認
// (テスト実行前後のmtimeを比較するのが理想だが、ここでは「willWrite=true の行がない」で代用)
const hasWrite = (reportData.updatesPreview as Array<Record<string, unknown>>).some(u => u.willWrite === true);
if (reportData.dryRun === true) {
  assert(!hasWrite, "dryRun=true の場合、willWrite=true の行は存在しない");
}

// 禁止文言テスト
const text = JSON.stringify(reportData) + "\n" + (existsSync("reports/special_situation_outcome_backfill_latest.md")
  ? readFileSync("reports/special_situation_outcome_backfill_latest.md", "utf-8")
  : "");
for (const forbidden of ["買うべき", "売るべき", "必ず上がる", "確実に上がる", "推奨銘柄", "買い推奨銘柄"]) {
  assert(!text.includes(forbidden), `禁止文言 ${forbidden} を含めない`);
}

// notes に免責事項が含まれる
assert(
  (reportData.notes as string[]).some(n => n.includes("売買推奨ではありません")),
  "notes に「売買推奨ではありません」が含まれる"
);

console.log("special-situation-outcome-backfill.test.ts passed");