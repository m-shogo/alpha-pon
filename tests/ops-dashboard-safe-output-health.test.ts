import assert from "node:assert/strict";
import { buildOpsDashboard } from "../src/ops-dashboard.js";
import { applySafeOutputAuditHealth } from "../src/ops-dashboard-safe-output-health.js";

function baseDashboard() {
  return buildOpsDashboard({
    today: "2026-08-17",
    pipelineStatus: { date: "2026-08-17", status: "ok" },
    alphaData: { generatedAt: "2026-08-17T00:00:00+09:00" },
    outcomes: [],
    specialOps: { healthStatus: "ok", actionItems: [] },
    integrity: { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
    outcomeQuality: { healthStatus: "ok", checks: {} },
    worldImpact: null,
    safeOutput: { healthStatus: "action_required", scannedFiles: 10, findingsCount: 0 },
    safeWordingScannedFiles: 0,
    safeWordingFindings: [],
  });
}

{
  const before = baseDashboard();
  assert.equal(before.allIssues.some(issue => issue.title.includes("Safe Output 監査の読み込み失敗")), false);
  const after = applySafeOutputAuditHealth(before, {
    healthStatus: "action_required",
    scannedFiles: 10,
    findingsCount: 0,
    scanErrors: [{ file: "broken.md" }],
  });
  assert.equal(after.healthStatus, "needs_attention");
  assert.equal(after.allIssues.some(issue => issue.title === "Safe Output 監査の読み込み失敗: 1件"), true);
  assert.equal(after.nextSafeCommands.some(item => item.command === "pnpm audit:safe-output"), true);
}

{
  const before = baseDashboard();
  const after = applySafeOutputAuditHealth(before, {
    healthStatus: "action_required",
    scannedFiles: 10,
    findingsCount: 1,
    scanErrors: [{ file: "broken.md" }],
  });
  assert.equal(after, before, "findingsがある場合は既存の危険表現issueに任せる");
}

console.log("ops-dashboard safe-output health: scan failure fails closed OK");
