import assert from "node:assert/strict";
import { lockAgeMs } from "../src/jobs/job-lock.js";

const NOW = Date.parse("2026-08-27T12:00:00Z");

assert.equal(
  lockAgeMs("not-a-date", NOW),
  null,
  "malformed locked_at must fail closed instead of being treated as stale",
);
assert.equal(
  lockAgeMs("2026-08-27T11:00:00Z", NOW),
  60 * 60 * 1000,
  "valid recent lock timestamps must retain a finite age",
);
assert.equal(
  lockAgeMs("2026-08-27T04:00:00Z", NOW),
  8 * 60 * 60 * 1000,
  "valid stale lock timestamps must retain a finite age",
);

console.log("job-lock-input.test.ts passed");