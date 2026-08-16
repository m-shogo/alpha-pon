import assert from "node:assert/strict";
import { normalizeOpsSpecialSituationInput } from "../src/ops-dashboard-special-input.js";

const valid = normalizeOpsSpecialSituationInput({
  healthStatus: "ok",
  actionItems: [],
  reviewDue: { overdue: 1, historicalSeedOverdue: 0, priceDataPending: 1, dueToday: 0, dueThisWeek: 2 },
});
assert.deepEqual(valid, {
  healthStatus: "ok",
  actionItems: [],
  reviewDue: { overdue: 1, historicalSeedOverdue: 0, priceDataPending: 1, dueToday: 0, dueThisWeek: 2 },
});

for (const malformed of [
  [],
  "broken",
  { healthStatus: 123 },
  { actionItems: "urgent" },
  { actionItems: [null] },
  { actionItems: [{ priority: 1, title: "broken" }] },
  { reviewDue: [] },
  { reviewDue: { overdue: "1" } },
  { reviewDue: { dueToday: Number.NaN } },
  { reviewDue: { dueThisWeek: -1 } },
]) {
  const normalized = normalizeOpsSpecialSituationInput(malformed);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.deepEqual(normalized?.actionItems, [
    { priority: "urgent", title: "invalid_special_situation_ops_input" },
  ]);
}

assert.equal(normalizeOpsSpecialSituationInput(null), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard special input: malformed shapes fail closed OK");
