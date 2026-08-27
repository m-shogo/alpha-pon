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

const lockOwnerStart = script.indexOf('if mkdir "$LOCK_DIR"');
const lockOwnerEnd = script.indexOf("\nelse\n  echo \"another alpha-pon daily pipeline", lockOwnerStart);
assert(lockOwnerStart >= 0 && lockOwnerEnd > lockOwnerStart, "lock-owner initialization must remain discoverable");
const lockOwnerBlock = script.slice(lockOwnerStart, lockOwnerEnd);
assert.match(
  lockOwnerBlock,
  /if ! write_status \"running\"; then[\s\S]*?pipeline status write failed[\s\S]*?exit 1[\s\S]*?fi/,
  "the lock owner must not start work when the canonical initial status cannot be persisted",
);

const finalStatusStart = script.indexOf('if [ -n "$FAILED_STEPS" ]; then');
const finalStatusEnd = script.indexOf('\necho ""', finalStatusStart);
assert(finalStatusStart >= 0 && finalStatusEnd > finalStatusStart, "final status publication must remain discoverable");
const finalStatusBlock = script.slice(finalStatusStart, finalStatusEnd);
assert.match(
  finalStatusBlock,
  /FINAL_STATUS=\"completed_with_warnings\"[\s\S]*?FINAL_STATUS=\"completed\"/,
  "the final status must preserve completed versus completed_with_warnings semantics",
);
assert.match(
  finalStatusBlock,
  /if ! write_status \"\$FINAL_STATUS\"; then[\s\S]*?pipeline status write failed[\s\S]*?exit 1[\s\S]*?fi/,
  "the pipeline must not exit successfully when its canonical final status cannot be persisted",
);

console.log("run-daily-status-write.test.ts passed");