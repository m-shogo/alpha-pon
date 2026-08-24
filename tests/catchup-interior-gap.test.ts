import assert from "node:assert/strict";
import { computeMissingTargetDates } from "../src/jobs/job-runner.js";

const succeeded = new Set(["2026-08-18", "2026-08-20", "2026-08-22"]);
assert.deepEqual(
  computeMissingTargetDates("2026-08-22", 7, "2026-08-18", date => succeeded.has(date)),
  ["2026-08-19", "2026-08-21"],
  "latest successより前のwindow内gapもcatchup対象に残す",
);

assert.deepEqual(
  computeMissingTargetDates("2026-08-22", 7, null, () => false),
  [],
  "初回成功前の過去日はcatchup対象にしない",
);

console.log("catchup-interior-gap.test.ts passed");
