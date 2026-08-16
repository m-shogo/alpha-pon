import assert from "node:assert/strict";
import { buildOpsDashboard } from "../src/ops-dashboard.js";
import { applyOutcomeIntegrityAuditHealth } from "../src/ops-dashboard-integrity-health.js";
import { normalizeOpsIntegrityInput } from "../src/ops-dashboard-integrity-input.js";

const valid = normalizeOpsIntegrityInput({
  status: "ok",
  jsonl: { duplicateGroups: [], parseErrors: [] },
  sqlite: { duplicateGroups: [] },
});
assert.deepEqual(valid, {
  status: "ok",
  jsonl: { duplicateGroups: [], parseErrors: [] },
  sqlite: { duplicateGroups: [] },
});

for (const malformed of [
  [],
  "broken",
  {},
  { status: "green" },
  { status: "ok", jsonl: [] },
  { status: "ok", jsonl: { duplicateGroups: {} } },
  { status: "ok", jsonl: { parseErrors: "none" } },
  { status: "ok", sqlite: [] },
  { status: "ok", sqlite: { duplicateGroups: "none" } },
]) {
  assert.deepEqual(
    normalizeOpsIntegrityInput(malformed),
    {
      status: "invalid_input",
      jsonl: { duplicateGroups: [], parseErrors: [{}] },
      sqlite: { duplicateGroups: [] },
    },
    "malformed integrity input must fail closed instead of producing false-green counts",
  );
}

assert.equal(normalizeOpsIntegrityInput(null), null, "missing input remains distinguishable from malformed input");

{
  const base = buildOpsDashboard({
    today: "2026-08-17",
    pipelineStatus: { date: "2026-08-17", status: "ok" },
    alphaData: { generatedAt: "2026-08-17T00:00:00+09:00" },
    outcomes: [],
    specialOps: { healthStatus: "ok", actionItems: [] },
    integrity: null,
    outcomeQuality: { healthStatus: "ok", checks: {} },
    worldImpact: null,
    safeOutput: { healthStatus: "ok", scannedFiles: 10, findingsCount: 0 },
    safeWordingScannedFiles: 1,
    safeWordingFindings: [],
  });
  const withMissingAudit = applyOutcomeIntegrityAuditHealth(base, null);
  assert.equal(withMissingAudit.healthStatus, "needs_attention");
  assert.ok(
    withMissingAudit.allIssues.some(
      issue => issue.category === "integrity" && issue.title === "Outcome Integrity 監査レポートが利用できない",
    ),
    "missing integrity report must not remain false-green",
  );
  assert.ok(withMissingAudit.nextSafeCommands.some(item => item.command === "pnpm outcomes:integrity"));
  assert.equal(applyOutcomeIntegrityAuditHealth(base, valid), base, "available integrity audit keeps existing dashboard handling");
}

console.log("ops-dashboard integrity input: malformed and missing audits fail closed OK");
