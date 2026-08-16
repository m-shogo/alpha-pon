import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readKnowledgeReviewJsonl } from "../src/knowledge-review-input.js";
import { hasCanonicalPipelineStatus, hasUsableSourceHealthText, sourceHealthHistoryState } from "../src/pipeline-health-input.js";
import { readStaleHypothesisJsonl } from "../src/stale-hypothesis-input.js";

assert.equal(hasUsableSourceHealthText("# source health\n- ok"), true, "meaningful source health text stays usable");
assert.equal(hasUsableSourceHealthText(""), false, "empty source health text must fail closed");
assert.equal(hasUsableSourceHealthText("  \n\t  "), false, "whitespace-only source health text must fail closed");
assert.equal(sourceHealthHistoryState(true), "ok", "existing source-health history remains usable");
assert.equal(sourceHealthHistoryState(false), "missing", "missing source-health history must not look healthy");
assert.equal(hasCanonicalPipelineStatus({}), false, "empty pipeline status objects must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00.000Z" }), true, "canonical daily pipeline status remains valid");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "unknown", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00.000Z" }), false, "unknown pipeline status must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-02-31", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00.000Z" }), false, "impossible Gregorian pipeline dates must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "0000-01-01", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00.000Z" }), false, "Gregorian year zero pipeline dates must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00" }), false, "timezone-less generatedAt must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-02-31T11:00:00+09:00" }), false, "impossible Gregorian generatedAt must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00-00:00" }), false, "unknown timezone offsets must fail closed");

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-knowledge-review-"));
try {
  const path = join(dir, "history.jsonl");
  writeFileSync(path, '{"code":"8136"}\nnot-json\n{"code":"6758"}\n', "utf-8");
  const result = readKnowledgeReviewJsonl<{ code: string }>(path);
  assert.deepEqual(result.rows.map(row => row.code), ["8136", "6758"], "valid rows continue through a malformed JSONL row");
  assert.match(result.warning ?? "", /parse_error 1 \(lines 2\)/, "malformed JSONL rows remain visible as metadata-only warnings");

  const staleResult = readStaleHypothesisJsonl<{ code: string }>(path);
  assert.deepEqual(staleResult.rows.map(row => row.code), ["8136", "6758"], "stale-hypothesis aggregation keeps valid rows around a malformed JSONL row");
  assert.match(staleResult.warning ?? "", /parse_error 1 \(lines 2\)/, "stale-hypothesis report must expose malformed history instead of silently undercounting misses");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("pipeline-health-input.test.ts passed");