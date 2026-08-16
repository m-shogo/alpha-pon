import assert from "node:assert/strict";
import { hasUsableSourceHealthText, sourceHealthHistoryState } from "../src/pipeline-health-input.js";

assert.equal(hasUsableSourceHealthText("# source health\n- ok"), true, "meaningful source health text stays usable");
assert.equal(hasUsableSourceHealthText(""), false, "empty source health text must fail closed");
assert.equal(hasUsableSourceHealthText("  \n\t  "), false, "whitespace-only source health text must fail closed");
assert.equal(sourceHealthHistoryState(true), "ok", "existing source-health history remains usable");
assert.equal(sourceHealthHistoryState(false), "missing", "missing source-health history must not look healthy");

console.log("pipeline-health-input.test.ts passed");
