import assert from "node:assert/strict";
import { buildOpsDashboard } from "../src/ops-dashboard.js";
import { normalizeOpsWorldImpactInput } from "../src/ops-dashboard-world-impact-input.js";
import { applyWorldImpactAuditHealth } from "../src/ops-dashboard-world-impact-health.js";

const valid = {
  healthStatus: "ok",
  totalReviews: 2,
  pendingReviews: 0,
  overdueReviews: 0,
  priorityIssues: [],
};

assert.deepEqual(normalizeOpsWorldImpactInput(valid), valid);
assert.equal(normalizeOpsWorldImpactInput(null), null);

for (const malformed of [
  [],
  "broken",
  1,
  {},
  { healthStatus: "green", totalReviews: 0, pendingReviews: 0, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "ok" },
  { healthStatus: "ok", totalReviews: 0 },
  { healthStatus: "ok", totalReviews: 0, pendingReviews: 0, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: "2", pendingReviews: 0, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: 2, pendingReviews: -1, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: 2, pendingReviews: 0, overdueReviews: -1, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: 2.5, pendingReviews: 0, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: Number.MAX_SAFE_INTEGER + 1, pendingReviews: 0, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: 1, pendingReviews: 2, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "needs_attention", totalReviews: 2, pendingReviews: 0, overdueReviews: 1, priorityIssues: [{ severity: "attention", title: "impossible overdue count", detail: "overdue must be pending" }] },
  { healthStatus: "ok", totalReviews: 2, pendingReviews: 1, overdueReviews: 1, priorityIssues: [] },
  { healthStatus: "ok", totalReviews: 2, pendingReviews: 1, overdueReviews: 1, priorityIssues: [{ severity: "info", title: "overdue hidden as info", detail: "overdue must require attention" }] },
  { healthStatus: "ok", totalReviews: 1, pendingReviews: 0, overdueReviews: 0 },
  { healthStatus: "ok", totalReviews: 1, pendingReviews: 0, overdueReviews: 0, priorityIssues: [{}] },
  { healthStatus: "ok", totalReviews: 1, pendingReviews: 0, overdueReviews: 0, priorityIssues: [{ severity: "urgent", title: "broken", detail: "must not be hidden" }] },
  { healthStatus: "ok", totalReviews: 1, pendingReviews: 0, overdueReviews: 0, priorityIssues: [{ severity: "attention", title: "broken", detail: "must not be hidden" }] },
  { healthStatus: "needs_attention", totalReviews: 1, pendingReviews: 0, overdueReviews: 0, priorityIssues: [] },
  { healthStatus: "action_required", totalReviews: 1, pendingReviews: 0, overdueReviews: 0, priorityIssues: [{ severity: "attention", title: "broken", detail: "wrong severity" }] },
]) {
  const normalized = normalizeOpsWorldImpactInput(malformed);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.equal(normalized?.priorityIssues?.[0]?.severity, "urgent");
}

const validAttention = {
  healthStatus: "needs_attention",
  totalReviews: 2,
  pendingReviews: 1,
  overdueReviews: 1,
  priorityIssues: [{ severity: "attention", title: "review due", detail: "review pending item" }],
};
assert.deepEqual(normalizeOpsWorldImpactInput(validAttention), validAttention);

const validUrgent = {
  healthStatus: "action_required",
  totalReviews: 2,
  pendingReviews: 1,
  overdueReviews: 0,
  priorityIssues: [{ severity: "urgent", title: "parse error", detail: "repair source data" }],
};
assert.deepEqual(normalizeOpsWorldImpactInput(validUrgent), validUrgent);

const normalizedMalformed = normalizeOpsWorldImpactInput([]);
const base = buildOpsDashboard({
  today: "2026-08-17",
  pipelineStatus: { date: "2026-08-17", status: "ok" },
  alphaData: { generatedAt: "2026-08-17T00:00:00+09:00" },
  outcomes: [],
  specialOps: { healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
  integrity: { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  outcomeQuality: { healthStatus: "ok", checks: {} },
  worldImpact: normalizedMalformed,
  safeOutput: { healthStatus: "ok", scannedFiles: 1, findingsCount: 0 },
  safeWordingScannedFiles: 1,
  safeWordingFindings: [],
});
const dashboard = applyWorldImpactAuditHealth(base, normalizedMalformed);
assert.equal(dashboard.healthStatus, "action_required");
assert.ok(dashboard.allIssues.some(issue => issue.category === "world_impact" && issue.severity === "urgent"));

console.log("ops-dashboard world-impact input: malformed, truncated, impossible counts, overdue acknowledgement, and contradictory health evidence fail closed OK");
