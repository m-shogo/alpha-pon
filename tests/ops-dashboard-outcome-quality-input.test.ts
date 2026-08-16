import assert from "node:assert/strict";
import { buildOpsDashboard } from "../src/ops-dashboard.js";
import { applyOutcomeQualityAuditHealth } from "../src/ops-dashboard-outcome-quality-health.js";
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

function dashboardFor(outcomeQuality: typeof valid | { healthStatus: string; checks: typeof valid.checks }) {
  return buildOpsDashboard({
    today: "2026-08-17",
    pipelineStatus: { date: "2026-08-17", status: "ok" },
    alphaData: { generatedAt: "2026-08-17T00:00:00+09:00" },
    outcomes: [],
    specialOps: { healthStatus: "ok", actionItems: [] },
    integrity: { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
    outcomeQuality,
    worldImpact: { healthStatus: "ok" },
    safeOutput: { healthStatus: "ok", scannedFiles: 1, findingsCount: 0 },
    safeWordingScannedFiles: 1,
    safeWordingFindings: [],
  });
}

{
  const producerActionRequired = { ...valid, healthStatus: "action_required" };
  const base = dashboardFor(producerActionRequired);
  assert.equal(
    base.allIssues.some(issue => issue.category === "outcome_quality" && issue.severity === "urgent"),
    false,
    "zero check counts reproduce the producer-health false green before the adapter",
  );
  const dashboard = applyOutcomeQualityAuditHealth(base, producerActionRequired);
  assert.equal(dashboard.healthStatus, "action_required");
  assert.ok(
    dashboard.allIssues.some(
      issue => issue.category === "outcome_quality" && issue.severity === "urgent" && issue.title.includes("action_required"),
    ),
  );
  assert.ok(dashboard.nextSafeCommands.some(item => item.command === "pnpm audit:outcomes"));
}

{
  const producerNeedsAttention = { ...valid, healthStatus: "needs_attention" };
  const dashboard = applyOutcomeQualityAuditHealth(dashboardFor(producerNeedsAttention), producerNeedsAttention);
  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(
    dashboard.allIssues.some(
      issue => issue.category === "outcome_quality" && issue.severity === "attention" && issue.title.includes("needs_attention"),
    ),
  );
}

console.log("ops-dashboard outcome-quality input: malformed input and producer health fail closed OK");
