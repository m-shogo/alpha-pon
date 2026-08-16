import assert from "node:assert/strict";
import { hasUniqueSourceHealthScoreIdentities } from "../src/source-health-input.js";

for (const rows of [
  [{ dataQuality: "ok" }],
  [{ code: "", dataQuality: "ok" }],
  [{ code: "   ", dataQuality: "ok" }],
  [{ code: 8136, dataQuality: "ok" }],
  [
    { code: "8136", dataQuality: "ok" },
    { code: "8136", dataQuality: "ok" },
  ],
] as const) {
  assert.equal(
    hasUniqueSourceHealthScoreIdentities(rows),
    false,
    "missing or duplicate stable score identities must not inflate source-health coverage",
  );
}

assert.equal(
  hasUniqueSourceHealthScoreIdentities([
    { code: "8136", dataQuality: "ok" },
    { code: "7974", dataQuality: "partial" },
  ]),
  true,
  "distinct non-empty score identities remain valid",
);

console.log("source health score identity: required and unique code contract OK");
