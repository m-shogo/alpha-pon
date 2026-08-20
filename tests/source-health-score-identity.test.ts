import assert from "node:assert/strict";
import { hasUniqueSourceHealthScoreIdentities } from "../src/source-health-input.js";

const valid = [
  { code: "8136", name: "サンリオ" },
  { code: "9984", name: "ソフトバンクグループ" },
];
assert.equal(hasUniqueSourceHealthScoreIdentities(valid), true);

for (const malformed of [
  [{ code: "8136" }],
  [{ code: "8136", name: "" }],
  [{ code: "8136", name: "   " }],
  [{ code: "8136", name: " サンリオ" }],
  [{ code: "8136", name: "サンリオ " }],
] as const) {
  assert.equal(
    hasUniqueSourceHealthScoreIdentities(malformed),
    false,
    "source-health coverage must not count score rows without canonical company names",
  );
}

assert.equal(
  hasUniqueSourceHealthScoreIdentities([
    { code: "8136", name: "サンリオ" },
    { code: "8136", name: "別名" },
  ]),
  false,
  "duplicate company codes remain invalid even when names differ",
);

console.log("source-health-score-identity.test.ts passed");
