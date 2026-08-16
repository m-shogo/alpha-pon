import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readKnowledgeReviewJsonl } from "../src/knowledge-review-input.js";
import { hasCanonicalPipelineStatus, hasUsableSourceHealthText, sourceHealthHistoryState } from "../src/pipeline-health-input.js";
import { readStaleHypothesisJsonl } from "../src/stale-hypothesis-input.js";

const BASE_PIPELINE_STATUS = {
  app: "alpha-pon",
  date: "2026-08-16",
  runType: "daily",
  status: "ok",
  results: [] as Array<{ name: string; status: "ok" | "skip" | "fail" }>,
  failedSteps: [] as string[],
  generatedAt: "2026-08-16T11:00:00.000Z",
};

assert.equal(hasUsableSourceHealthText("# source health\n- ok"), true, "meaningful source health text stays usable");
assert.equal(hasUsableSourceHealthText(""), false, "empty source health text must fail closed");
assert.equal(hasUsableSourceHealthText("  \n\t  "), false, "whitespace-only source health text must fail closed");
assert.equal(sourceHealthHistoryState(true), "ok", "existing source-health history remains usable");
assert.equal(sourceHealthHistoryState(false), "missing", "missing source-health history must not look healthy");
assert.equal(hasCanonicalPipelineStatus({}), false, "empty pipeline status objects must fail closed");
assert.equal(hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS), true, "canonical daily pipeline status remains valid");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, status: "unknown" }), false, "unknown pipeline status must fail closed");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, date: "2026-02-31" }), false, "impossible Gregorian pipeline dates must fail closed");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, date: "0000-01-01" }), false, "Gregorian year zero pipeline dates must fail closed");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, generatedAt: "2026-08-16T11:00:00" }), false, "timezone-less generatedAt must fail closed");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, generatedAt: "2026-02-31T11:00:00+09:00" }), false, "impossible Gregorian generatedAt must fail closed");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, generatedAt: "2026-08-16T11:00:00-00:00" }), false, "unknown timezone offsets must fail closed");
assert.equal(hasCanonicalPipelineStatus({
  ...BASE_PIPELINE_STATUS,
  status: "partial_failed",
  results: [{ name: "scan_universe", status: "fail" }],
  failedSteps: ["scan_universe"],
}), true, "canonical partial failures remain valid");
assert.equal(hasCanonicalPipelineStatus({
  ...BASE_PIPELINE_STATUS,
  results: [{ name: "scan_universe", status: "fail" }],
  failedSteps: [],
}), false, "status=ok must not hide failed result rows");
assert.equal(hasCanonicalPipelineStatus({
  ...BASE_PIPELINE_STATUS,
  status: "partial_failed",
  results: [{ name: "scan_universe", status: "fail" }],
  failedSteps: ["daily_company_score"],
}), false, "failedSteps must match failed result identities");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, status: "partial_failed" }), false, "partial_failed requires an actual failed result");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, results: [{ name: " scan_universe", status: "ok" }] }), false, "pipeline result names must be canonical non-empty strings");
assert.equal(hasCanonicalPipelineStatus({ ...BASE_PIPELINE_STATUS, results: [{ name: "scan_universe", status: "mystery" }] }), false, "pipeline result statuses must use the producer enum");

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
