import assert from "node:assert/strict";
import { hasUniqueSourceHealthScoreIdentities } from "../src/source-health-input.js";

for (const rows of [
  [{ dataQuality: "ok" }],
  [{ code: "", dataQuality: "ok" }],
  [{ code: "   ", dataQuality: "ok" }],
  [{ code: " 8136", dataQuality: "ok" }],
  [{ code: "8136 ", dataQuality: "ok" }],
  [{ code: 8136, dataQuality: "ok" }],
  [
    { code: "8136", name: "サンリオ", dataQuality: "ok" },
    { code: "8136", name: "サンリオ", dataQuality: "ok" },
  ],
] as const) {
  assert.equal(
    hasUniqueSourceHealthScoreIdentities(rows),
    false,
    "missing, padded, or duplicate stable score identities must not inflate source-health coverage",
  );
}

for (const rows of [
  [{ code: "8136", dataQuality: "ok" }],
  [{ code: "8136", name: "", dataQuality: "ok" }],
  [{ code: "8136", name: "   ", dataQuality: "ok" }],
  [{ code: "8136", name: " サンリオ", dataQuality: "ok" }],
  [{ code: "8136", name: "サンリオ ", dataQuality: "ok" }],
] as const) {
  assert.equal(
    hasUniqueSourceHealthScoreIdentities(rows),
    false,
    "missing, blank, or padded company names must not inflate source-health coverage",
  );
}

assert.equal(
  hasUniqueSourceHealthScoreIdentities([
    { code: "8136", name: "サンリオ", dataQuality: "ok" },
    { code: "7974", name: "任天堂", dataQuality: "partial" },
  ]),
  true,
  "distinct canonical score identities remain valid",
);

console.log("source health score identity: canonical non-empty unique code/name contract OK");
