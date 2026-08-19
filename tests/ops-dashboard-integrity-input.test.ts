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

for (const status of ["duplicate_found", "db_unavailable", "parse_error"]) {
  const canonical = {
    generatedAt: asOf,
    status,
    jsonl: { duplicateGroups: [], parseErrors: [] },
    sqlite: { duplicateGroups: [] },
  };
  assert.deepEqual(
    normalizeOpsIntegrityInput(canonical, asOf),
    canonical,
    `canonical producer status ${status} must remain available to the dashboard`,
  );
}

for (const malformed of [
  [],
  "broken",
  {},
  { generatedAt: asOf, status: "green" },
  { generatedAt: asOf, status: "warning", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "action_required", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "unknown", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok" },
  { generatedAt: asOf, status: "ok", jsonl: [], sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: {}, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: {} }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: "none" }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: [] },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: {} },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: "none" } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [{ key: "dup" }], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [{ lineNumber: 1 }] }, sqlite: { duplicateGroups: [] } },
  { generatedAt: asOf, status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [{ key: "dup" }] } },
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
    "malformed, truncated, stale, non-canonical, or false-green integrity input must fail closed",
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

console.log("ops-dashboard integrity input: canonical status and finding consistency validated OK");
