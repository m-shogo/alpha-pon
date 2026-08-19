import assert from "node:assert/strict";
import { requireMustWatchThemes } from "../src/must-watch-audit-input.js";
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

assert.deepEqual(
  requireMustWatchThemes({ mustWatchThemes: { ai: { label: "AI", whyRequired: "fixture" } } }),
  { ai: { label: "AI", whyRequired: "fixture" } },
  "object-shaped must-watch theme maps remain accepted",
);
assert.throws(
  () => requireMustWatchThemes({ mustWatchThemes: [] }),
  /mustWatchThemes must be an object/,
  "array-shaped mustWatchThemes must not become a false-green zero-audit report",
);
assert.throws(
  () => requireMustWatchThemes({ mustWatchThemes: null }),
  /mustWatchThemes must be an object/,
  "null mustWatchThemes must fail closed",
);
assert.throws(
  () => requireMustWatchThemes([]),
  /must-watch config must be an object/,
  "non-object config roots must fail closed",
);

console.log("must-watch-audit-status.test.ts passed");
