import assert from "node:assert/strict";
import { normalizeOpsSpecialSituationInput } from "../src/ops-dashboard-special-input.js";

const asOf = "2026-08-19";
const valid = normalizeOpsSpecialSituationInput({
  generatedAt: asOf,
  today: asOf,
  healthStatus: "ok",
  actionItems: [],
  reviewDue: { overdue: 1, historicalSeedOverdue: 0, priceDataPending: 1, dueToday: 0, dueThisWeek: 2 },
}, asOf);
assert.deepEqual(valid, {
  generatedAt: asOf,
  today: asOf,
  healthStatus: "ok",
  actionItems: [],
  reviewDue: { overdue: 1, historicalSeedOverdue: 0, priceDataPending: 1, dueToday: 0, dueThisWeek: 2 },
});

for (const malformed of [
  [],
  "broken",
  {},
  { generatedAt: asOf, today: asOf, healthStatus: 123 },
  { generatedAt: asOf, today: asOf, healthStatus: "green", actionItems: [] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: "urgent" },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [null] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: 1, title: "broken" }] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: "mystery", title: "broken" }] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: "urgent", title: "must be action_required" }] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: "attention", title: "must need attention" }] },
  { generatedAt: asOf, today: asOf, healthStatus: "needs_attention", actionItems: [{ priority: "attention", title: "   " }] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: [] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: { overdue: "1" } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: { dueToday: Number.NaN } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: { dueThisWeek: -1 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: { overdue: 0.5 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: { priceDataPending: Number.MAX_SAFE_INTEGER + 1 } },
  { generatedAt: "2026-08-18", today: "2026-08-18", healthStatus: "ok", actionItems: [] },
  { generatedAt: "2026-02-31", today: "2026-02-31", healthStatus: "ok", actionItems: [] },
  { generatedAt: asOf, today: "2026-08-18", healthStatus: "ok", actionItems: [] },
  { generatedAt: asOf, healthStatus: "ok", actionItems: [] },
  { today: asOf, healthStatus: "ok", actionItems: [] },
]) {
  const normalized = normalizeOpsSpecialSituationInput(malformed, asOf);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.deepEqual(normalized?.actionItems, [
    { priority: "urgent", title: "invalid_special_situation_ops_input" },
  ]);
}

assert.equal(normalizeOpsSpecialSituationInput(null, asOf), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard special input: malformed, stale, and inconsistent shapes fail closed OK");
