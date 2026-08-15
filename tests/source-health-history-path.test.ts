import assert from "node:assert/strict";
import { sourceHealthScorePath } from "../src/source-health-history-path.js";

assert.equal(sourceHealthScorePath("2026-08-15"), "reports/scores_2026-08-15.json");
assert.notEqual(
  sourceHealthScorePath("2026-08-15"),
  "reports/pipeline_status_latest.json",
  "source-health history must measure the actual daily score artifact, not pipeline status",
);

console.log("source-health-history-path.test.ts passed");
