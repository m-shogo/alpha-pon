import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/run-daily.sh", "utf-8");
const runStepStart = script.indexOf("run_step() {");
const runStepEnd = script.indexOf("\nrun_if_monday()", runStepStart);
assert(runStepStart >= 0 && runStepEnd > runStepStart, "run_step must remain discoverable");

const runStep = script.slice(runStepStart, runStepEnd);
assert.match(
  runStep,
  /if ! append_step_status \"\$name\" \"\$critical\" \"ok\" \"0\"[\s\S]*?return 1[\s\S]*?fi/,
  "a successful command must fail the step when its canonical pipeline status cannot be persisted",
);
assert.match(
  runStep,
  /if ! append_step_status \"\$name\" \"\$critical\" \"failed\" \"\$code\"[\s\S]*?pipeline status write failed[\s\S]*?return 1[\s\S]*?fi/,
  "a failed command must surface pipeline status persistence failure instead of silently continuing",
);

console.log("run-daily-status-write.test.ts passed");
