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
  { generatedAt: asOf, today: asOf, healthStatus: "ok", reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: "urgent", reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [null], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: 1, title: "broken" }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: "mystery", title: "broken" }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: "urgent", title: "must be action_required" }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [{ priority: "attention", title: "must need attention" }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "needs_attention", actionItems: [{ priority: "attention", title: "   " }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "action_required", actionItems: [{ priority: "attention", title: "wrong escalation" }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "needs_attention", actionItems: [{ priority: "info", title: "no attention action" }], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "action_required", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "needs_attention", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: [] },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: "1", historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: Number.NaN, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: -1 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0.5, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: Number.MAX_SAFE_INTEGER + 1, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: "2026-08-18", today: "2026-08-18", healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: "2026-02-31", today: "2026-02-31", healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, today: "2026-08-18", healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { generatedAt: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  { today: asOf, healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
]) {
  const normalized = normalizeOpsSpecialSituationInput(malformed, asOf);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.deepEqual(normalized?.actionItems, [
    { priority: "urgent", title: "invalid_special_situation_ops_input" },
  ]);
}

const validAttention = {
  generatedAt: asOf,
  today: asOf,
  healthStatus: "needs_attention",
  actionItems: [{ priority: "attention", title: "review due" }],
  reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 1, dueThisWeek: 0 },
};
assert.deepEqual(normalizeOpsSpecialSituationInput(validAttention, asOf), validAttention);

const validUrgent = {
  generatedAt: asOf,
  today: asOf,
  healthStatus: "action_required",
  actionItems: [
    { priority: "urgent", title: "outcome missing" },
    { priority: "attention", title: "review due" },
  ],
  reviewDue: { overdue: 1, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 },
};
assert.deepEqual(normalizeOpsSpecialSituationInput(validUrgent, asOf), validUrgent);

assert.equal(normalizeOpsSpecialSituationInput(null, asOf), null, "missing input remains distinguishable from malformed input");

console.log("ops-dashboard special input: malformed, stale, truncated, and contradictory health evidence fail closed OK");
