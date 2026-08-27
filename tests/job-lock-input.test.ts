import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lockAgeMs } from "../src/jobs/job-lock.js";

const NOW = Date.parse("2026-08-27T12:00:00Z");

assert.equal(
  lockAgeMs("not-a-date", NOW),
  null,
  "malformed locked_at must fail closed instead of being treated as stale",
);
assert.equal(
  lockAgeMs("2026-08-27T13:00:00Z", NOW),
  null,
  "future locked_at must fail closed instead of producing a negative active-lock age",
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

const healthCheckSource = readFileSync("scripts/health-check.ts", "utf8");
assert.match(
  healthCheckSource,
  /lockAgeMs\(lock\.locked_at\)/,
  "health check must reuse the canonical lock timestamp parser",
);
assert.match(
  healthCheckSource,
  /if \(age === null\)[\s\S]*invalid locked_at/,
  "health check must report invalid lock timestamps instead of NaN or negative active-lock ages",
);

console.log("job-lock-input.test.ts passed");