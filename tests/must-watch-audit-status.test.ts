import assert from "node:assert/strict";
import { mustWatchThemeStatus } from "../src/must-watch-audit-status.js";

const clean = {
  missingEntities: [],
  missingJapanLinks: [],
  missingQuestions: [],
  missingSafetyRules: [],
};

assert.equal(mustWatchThemeStatus(clean), "ok", "complete must-watch coverage should remain ok");
assert.equal(
  mustWatchThemeStatus({ ...clean, missingSafetyRules: ["do not use unverified social claims"] }),
  "warning",
  "missing safety rules must fail closed instead of reporting a false-green status",
);
assert.equal(
  mustWatchThemeStatus({ ...clean, missingEntities: ["required entity"] }),
  "warning",
  "existing required-entity behavior must remain fail closed",
);

console.log("must-watch-audit-status.test.ts passed");
