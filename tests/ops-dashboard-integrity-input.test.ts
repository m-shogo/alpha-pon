import assert from "node:assert/strict";
import { buildOpsDashboard } from "../src/ops-dashboard.js";
import { applyOutcomeIntegrityAuditHealth } from "../src/ops-dashboard-integrity-health.js";
import { normalizeOpsIntegrityInput } from "../src/ops-dashboard-integrity-input.js";

const asOf = "2026-08-19";
const valid = normalizeOpsIntegrityInput({
  generatedAt: asOf,
  status: "ok",
  jsonl: { duplicateGroups: [], parseErrors: [] },
  sqlite: { duplicateGroups: [] },
}, asOf);
assert.deepEqual(valid, {
  generatedAt: asOf,
  status: "ok",
  jsonl: { duplicateGroups: [], parseErrors: [] },
  sqlite: { duplicateGroups: [] },
});

for (const malformed of [
  [],
  "broken",
  {},
  { generatedAt: asOf, status: "green" },
  { generatedAt: asOf, status: "ok" },
  { generatedAt: asOf, status: "ok", jsonl: [], sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: {}, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: {} }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: "none" }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: [] },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: {} },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: "none" } },
  { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: "2026-08-18", status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: "2026-02-31", status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: "0000-01-01", status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
]) {
  assert.deepEqual(
    normalizeOpsIntegrityInput(malformed, asOf),
    {
      status: "invalid_input",
      jsonl: { duplicateGroups: [], parseErrors: [{}] },
      sqlite: { duplicateGroups: [] },
    },
    "malformed, truncated, or stale integrity input must fail closed instead of producing false-green counts",
  );
}

assert.equal(normalizeOpsIntegrityInput(null, asOf), null, "missing input remains distinguishable from malformed input");

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

console.log("ops-dashboard integrity input: malformed, truncated, stale, and missing audits fail closed OK");
