import assert from "node:assert/strict";
import { buildOpsDashboard } from "../src/ops-dashboard.js";
import { normalizeOpsWorldImpactInput } from "../src/ops-dashboard-world-impact-input.js";
import { applyWorldImpactAuditHealth } from "../src/ops-dashboard-world-impact-health.js";

const valid = {
  healthStatus: "ok",
  totalReviews: 2,
  pendingReviews: 0,
};

assert.deepEqual(normalizeOpsWorldImpactInput(valid), valid);
assert.equal(normalizeOpsWorldImpactInput(null), null);

for (const malformed of [
  [],
  "broken",
  1,
  {},
  { healthStatus: "green", totalReviews: 0, pendingReviews: 0 },
  { healthStatus: "ok" },
  { healthStatus: "ok", totalReviews: 0 },
  { healthStatus: "ok", totalReviews: "2", pendingReviews: 0 },
  { healthStatus: "ok", totalReviews: 2, pendingReviews: -1 },
  { healthStatus: "ok", totalReviews: 2.5, pendingReviews: 0 },
  { healthStatus: "ok", totalReviews: Number.MAX_SAFE_INTEGER + 1, pendingReviews: 0 },
  { healthStatus: "ok", totalReviews: 1, pendingReviews: 2 },
]) {
  const normalized = normalizeOpsWorldImpactInput(malformed);
  assert.equal(normalized?.healthStatus, "action_required");
  assert.equal(normalized?.priorityIssues?.[0]?.severity, "urgent");
}

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

console.log("ops-dashboard world-impact input: malformed and truncated core counts fail closed OK");
