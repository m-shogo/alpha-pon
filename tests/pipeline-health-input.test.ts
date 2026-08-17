import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeCompanyCoverageRoots } from "../src/company-coverage-input.js";
import { readKnowledgeReviewJsonl } from "../src/knowledge-review-input.js";
import { extractPipelineHealthConfidence, pipelineHealthConfidenceAtDate, shouldNotifyPipelineHealth } from "../src/pipeline-health-alert-input.js";
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
assert.equal(hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-08-16"), true, "same-day pipeline status remains visible at the read-only cutoff");
assert.equal(
  hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-08-16", "2026-08-16T11:00:00.000000000Z"),
  true,
  "generatedAt exactly at the read-only instant remains visible",
);
assert.equal(
  hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-08-16", "2026-08-16T10:59:59.999999999Z"),
  false,
  "same-day generatedAt one nanosecond after the read-only instant must fail closed",
);
assert.equal(
  hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-08-16", "2026-08-16T20:00:00+09:00"),
  true,
  "equivalent explicit-timezone instants remain visible",
);
assert.equal(
  hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-08-16", "2026-08-16T11:00:00"),
  false,
  "timezone-less read-only instant cutoffs must fail closed",
);
assert.equal(hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-08-15"), false, "future pipeline dates must not leak into a past/current read-only health summary");
assert.equal(hasCanonicalPipelineStatus(BASE_PIPELINE_STATUS, "2026-02-31"), false, "invalid read-only cutoffs must fail closed");
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
assert.equal(hasCanonicalPipelineStatus({
  ...BASE_PIPELINE_STATUS,
  status: "partial_failed",
  results: [
    { name: "scan_universe", status: "ok" },
    { name: "scan_universe", status: "fail" },
  ],
  failedSteps: ["scan_universe"],
}), false, "duplicate result identities must not let display order hide a failed step");

assert.equal(extractPipelineHealthConfidence("- report confidence: normal"), "normal", "normal health remains recognizable");
assert.equal(shouldNotifyPipelineHealth("normal"), false, "normal health must not notify");
assert.equal(shouldNotifyPipelineHealth("caution"), true, "caution health must notify");
assert.equal(shouldNotifyPipelineHealth("low"), true, "low health must notify");
assert.equal(extractPipelineHealthConfidence(""), "unknown", "missing or malformed health summaries remain unknown");
assert.equal(shouldNotifyPipelineHealth("unknown"), true, "unknown health must fail closed instead of suppressing the alert");
const CURRENT_PIPELINE_HEALTH = "# alpha-pon pipeline health summary\n\ndate: 2026-08-17\n\n## confidence\n\n- report confidence: normal\n";
assert.equal(pipelineHealthConfidenceAtDate(CURRENT_PIPELINE_HEALTH, "2026-08-17"), "normal", "current normal health remains suppressible");
assert.equal(pipelineHealthConfidenceAtDate(CURRENT_PIPELINE_HEALTH, "2026-08-18"), "unknown", "stale normal health must fail closed instead of suppressing the current alert");
assert.equal(pipelineHealthConfidenceAtDate("- report confidence: normal", "2026-08-17"), "unknown", "health summaries without a canonical current date must fail closed");

const validCoverageRoots = normalizeCompanyCoverageRoots(
  { categories: { entertainment: { label: "Entertainment", companies: [] } } },
  { companies: { "8136": { name: "Sanrio" } } },
);
assert.deepEqual(validCoverageRoots.warnings, [], "canonical company coverage roots remain usable");
assert.notEqual(validCoverageRoots.hypotheses, null, "canonical hypothesis roots remain available");
assert.notEqual(validCoverageRoots.network, null, "canonical network roots remain available");

const malformedCoverageRoots = normalizeCompanyCoverageRoots(
  [],
  { companies: { "8136": { name: "Sanrio" } } },
);
assert.equal(malformedCoverageRoots.hypotheses, null, "array-shaped hypothesis roots must not look like an empty healthy dataset");
assert.notEqual(malformedCoverageRoots.network, null, "a valid sibling network root remains available for read-only diagnostics");
assert.match(
  malformedCoverageRoots.warnings.join("\n"),
  /company-hypotheses\.yml root\/categories shape is invalid/,
  "malformed hypothesis roots stay visible as metadata-only warnings",
);

const malformedNetworkRoots = normalizeCompanyCoverageRoots(
  { categories: {} },
  "not-an-object",
);
assert.equal(malformedNetworkRoots.network, null, "non-object network roots must not look like an empty healthy dataset");
assert.match(
  malformedNetworkRoots.warnings.join("\n"),
  /company-network\.yml root\/companies shape is invalid/,
  "malformed network roots stay visible as metadata-only warnings",
);

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
