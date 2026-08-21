import assert from "node:assert/strict";
import { normalizeOpsAlphaDataQualityWarningsInput } from "../src/ops-dashboard-alpha-input.js";
import { normalizeOpsOutcomesInput } from "../src/ops-dashboard-outcomes-input.js";
import type { OpsAlphaDataLike } from "../src/ops-dashboard.js";

const valid = {
  outcomes: [
    {
      code: "8136",
      reviewHorizon: "1m",
      result: "hit",
      dataAvailability: "ok",
    },
  ],
};

assert.deepEqual(normalizeOpsOutcomesInput(valid), valid);
assert.equal(normalizeOpsOutcomesInput(null), null);

for (const malformed of [
  [],
  {},
  { outcomes: {} },
  { outcomes: [null] },
  { outcomes: ["broken"] },
  { outcomes: [{ result: 1 }] },
  { outcomes: [{ dataAvailability: [] }] },
  { outcomes: [{ code: "8136", reviewHorizon: "1y", result: "hit", dataAvailability: "ok" }] },
  { outcomes: [{ code: "8136", reviewHorizon: "1m", result: "won", dataAvailability: "ok" }] },
  { outcomes: [{ code: "8136", reviewHorizon: "1m", result: "hit", dataAvailability: "perfect" }] },
]) {
  const normalized = normalizeOpsOutcomesInput(malformed);
  assert.equal(normalized?.outcomes.length, 1);
  assert.equal(normalized?.outcomes[0]?.result, "unevaluated");
  assert.equal(normalized?.outcomes[0]?.dataAvailability, "unknown");
}

const alphaWithAmbiguousCode = {
  generatedAt: "2026-08-21",
  meta: { warnings: [] },
  dataQualityByCode: {
    "8136": { quality: { level: "ok" }, warnings: [] },
    " 8136 ": { quality: { level: "missing" }, warnings: ["duplicate logical identity"] },
  },
} as OpsAlphaDataLike;
const normalizedAlpha = normalizeOpsAlphaDataQualityWarningsInput(alphaWithAmbiguousCode);
assert.deepEqual(Object.keys(normalizedAlpha?.dataQualityByCode ?? {}), ["8136"], "padded code keys must not create a second logical data-quality identity");
assert.ok(normalizedAlpha?.meta?.warnings?.some(warning => warning.includes("dataQualityByCode")), "invalid code identity must remain visible as metadata warning");

console.log("ops-dashboard outcomes input: malformed input fails closed OK");
