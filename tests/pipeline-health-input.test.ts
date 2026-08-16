import assert from "node:assert/strict";
import { hasCanonicalPipelineStatus, hasUsableSourceHealthText, sourceHealthHistoryState } from "../src/pipeline-health-input.js";

assert.equal(hasUsableSourceHealthText("# source health\n- ok"), true, "meaningful source health text stays usable");
assert.equal(hasUsableSourceHealthText(""), false, "empty source health text must fail closed");
assert.equal(hasUsableSourceHealthText("  \n\t  "), false, "whitespace-only source health text must fail closed");
assert.equal(sourceHealthHistoryState(true), "ok", "existing source-health history remains usable");
assert.equal(sourceHealthHistoryState(false), "missing", "missing source-health history must not look healthy");
assert.equal(hasCanonicalPipelineStatus({}), false, "empty pipeline status objects must fail closed");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "ok", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00.000Z" }), true, "canonical daily pipeline status remains valid");
assert.equal(hasCanonicalPipelineStatus({ app: "alpha-pon", date: "2026-08-16", runType: "daily", status: "unknown", results: [], failedSteps: [], generatedAt: "2026-08-16T11:00:00.000Z" }), false, "unknown pipeline status must fail closed");

console.log("pipeline-health-input.test.ts passed");
