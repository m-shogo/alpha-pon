import assert from "node:assert/strict";
import { normalizeOpsOutcomeQualityInput } from "../src/ops-dashboard-outcome-quality-input.js";

const valid = {
  healthStatus: "ok",
  checks: {
    reviewMissing: { count: 0 },
    horizonGaps: { count: 0 },
    judgedWithLimitedData: { count: 0 },
    unknownMatchedAsHit: { count: 0 },
    pendingWithSignals: { count: 0 },
    emptyReviewNotes: { count: 0 },
    dueAtMismatch: { count: 0 },
  },
};

assert.deepEqual(normalizeOpsOutcomeQualityInput(valid), valid);
assert.equal(normalizeOpsOutcomeQualityInput(null), null);

for (const malformed of [
  [],
  { healthStatus: "ok", checks: "broken" },
  { healthStatus: "green", checks: valid.checks },
  { healthStatus: "ok", checks: { ...valid.checks, reviewMissing: {} } },
  { healthStatus: "ok", checks: { ...valid.checks, reviewMissing: { count: -1 } } },
  { healthStatus: "ok", checks: { ...valid.checks, reviewMissing: { count: 1.5 } } },
  { healthStatus: "ok", checks: { ...valid.checks, reviewMissing: { count: "1" } } },
]) {
  const normalized = normalizeOpsOutcomeQualityInput(malformed);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.equal(normalized?.checks?.invalidInput?.count, 1);
}

console.log("ops-dashboard outcome-quality input: malformed input fails closed OK");
