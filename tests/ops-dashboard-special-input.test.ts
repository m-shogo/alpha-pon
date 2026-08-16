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
  {},
  { healthStatus: 123 },
  { healthStatus: "green", actionItems: [] },
  { healthStatus: "ok", actionItems: "urgent" },
  { healthStatus: "ok", actionItems: [null] },
  { healthStatus: "ok", actionItems: [{ priority: 1, title: "broken" }] },
  { healthStatus: "ok", actionItems: [{ priority: "mystery", title: "broken" }] },
  { healthStatus: "ok", actionItems: [{ priority: "urgent", title: "must be action_required" }] },
  { healthStatus: "ok", actionItems: [{ priority: "attention", title: "must need attention" }] },
  { healthStatus: "needs_attention", actionItems: [{ priority: "attention", title: "   " }] },
  { healthStatus: "ok", reviewDue: [] },
  { healthStatus: "ok", reviewDue: { overdue: "1" } },
  { healthStatus: "ok", reviewDue: { dueToday: Number.NaN } },
  { healthStatus: "ok", reviewDue: { dueThisWeek: -1 } },
]) {
  const normalized = normalizeOpsSpecialSituationInput(malformed);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.deepEqual(normalized?.actionItems, [
    { priority: "urgent", title: "invalid_special_situation_ops_input" },
  ]);
}

assert.equal(normalizeOpsSpecialSituationInput(null), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard special input: malformed and inconsistent shapes fail closed OK");
