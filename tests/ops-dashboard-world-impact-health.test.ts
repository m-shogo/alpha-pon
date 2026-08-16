import assert from "node:assert/strict";
import { buildOpsDashboard, type OpsDashboardInputs, type OpsWorldImpactAuditLike } from "../src/ops-dashboard.js";
import { applyWorldImpactAuditHealth } from "../src/ops-dashboard-world-impact-health.js";

const TODAY = "2026-08-17";

function cleanInputs(): OpsDashboardInputs {
  return {
    today: TODAY,
    pipelineStatus: { date: TODAY, status: "completed", failedSteps: "", steps: [{ name: "daily", status: "ok" }] },
    alphaData: { generatedAt: TODAY, meta: { warnings: [] }, universeScan: { scanStatus: "ok", fallbackReason: null }, dataQualityByCode: {} },
    outcomes: [],
    specialOps: { healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 } },
    integrity: { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
    outcomeQuality: { healthStatus: "ok", checks: {} },
    worldImpact: null,
    safeOutput: { healthStatus: "ok", scannedFiles: 1, findingsCount: 0, findings: [] },
    safeWordingScannedFiles: 1,
    safeWordingFindings: [],
  };
}

{
  const worldImpact: OpsWorldImpactAuditLike = {
    healthStatus: "action_required",
    totalReviews: 0,
    pendingReviews: 0,
    overdueReviews: 0,
    missingCounterArguments: 0,
    missingMechanisms: 0,
    dataUnavailable: 0,
    priceDataPending: 0,
    sourceQualityUnknown: 0,
    unknownMatchedAsHit: 0,
    jsonlParseErrors: 0,
    latestMismatch: 0,
    priorityIssues: [{ severity: "urgent", title: "latest snapshot invalid", detail: "repair latest" }],
  };
  const inputs = cleanInputs();
  inputs.worldImpact = worldImpact;
  const dashboard = applyWorldImpactAuditHealth(buildOpsDashboard(inputs), worldImpact);

  assert.equal(dashboard.healthStatus, "action_required");
  assert.ok(dashboard.allIssues.some(issue => issue.category === "world_impact" && issue.severity === "urgent"));
  assert.ok(dashboard.nextSafeCommands.some(item => item.command === "pnpm audit:world-impact"));
}

{
  const worldImpact: OpsWorldImpactAuditLike = {
    healthStatus: "needs_attention",
    totalReviews: 0,
    pendingReviews: 0,
    overdueReviews: 0,
    missingCounterArguments: 0,
    missingMechanisms: 0,
    dataUnavailable: 0,
    priceDataPending: 0,
    sourceQualityUnknown: 0,
    unknownMatchedAsHit: 0,
    jsonlParseErrors: 0,
    latestMismatch: 0,
    priorityIssues: [],
  };
  const inputs = cleanInputs();
  inputs.worldImpact = worldImpact;
  const dashboard = applyWorldImpactAuditHealth(buildOpsDashboard(inputs), worldImpact);

  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(dashboard.allIssues.some(issue => issue.category === "world_impact" && issue.severity === "attention"));
}

console.log("ops-dashboard-world-impact-health: producer health is preserved");
