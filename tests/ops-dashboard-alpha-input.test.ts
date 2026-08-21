import assert from "node:assert/strict";
import {
  normalizeOpsAlphaDataQualityWarningsInput,
  normalizeOpsAlphaWarningsInput,
} from "../src/ops-dashboard-alpha-input.js";
import { buildOpsDashboard, type OpsAlphaDataLike, type OpsDashboardInputs } from "../src/ops-dashboard.js";

const TODAY = "2026-08-17";

function cleanInputs(alphaData: OpsAlphaDataLike): OpsDashboardInputs {
  return {
    today: TODAY,
    pipelineStatus: { date: TODAY, status: "completed", failedSteps: "", steps: [{ name: "daily", status: "ok" }] },
    alphaData,
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

for (const malformedWarnings of ["broken", { length: 1 }]) {
  const raw = {
    generatedAt: TODAY,
    meta: { warnings: malformedWarnings },
    universeScan: { scanStatus: "fresh", fallbackReason: null },
    dataQualityByCode: {},
  } as unknown as OpsAlphaDataLike;
  const normalized = normalizeOpsAlphaWarningsInput(raw);
  assert.ok(normalized);
  assert.deepEqual(normalized.meta?.warnings, ["alpha-pon-data.json meta.warnings の形式が不正です"]);

  const dashboard = buildOpsDashboard(cleanInputs(normalized));
  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(dashboard.allIssues.some(issue => issue.title.includes("データ品質の注意")));
}

{
  const raw = {
    generatedAt: TODAY,
    meta: { warnings: [] },
    universeScan: { scanStatus: "fresh", fallbackReason: null },
    dataQualityByCode: {
      "8136": { quality: { level: "ok" }, warnings: { corrupted: true } },
    },
  } as unknown as OpsAlphaDataLike;
  const normalized = normalizeOpsAlphaDataQualityWarningsInput(raw);
  assert.ok(normalized);
  assert.deepEqual(normalized.dataQualityByCode?.["8136"]?.warnings, []);
  assert.deepEqual(normalized.meta?.warnings, ["alpha-pon-data.json dataQualityByCode warnings の形式が不正です（1件）"]);

  const dashboard = buildOpsDashboard(cleanInputs(normalized));
  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(dashboard.allIssues.some(issue => issue.title.includes("UI 生成データに warning")));
}

for (const invalidUniverseScan of [
  { scanStatus: "failed", fallbackReason: null },
  { scanStatus: "stale_fallback", fallbackReason: null },
  { scanStatus: "fresh", fallbackReason: "jquants_zero_candidates" },
] as const) {
  const raw = {
    generatedAt: TODAY,
    meta: { warnings: [] },
    universeScan: invalidUniverseScan,
    dataQualityByCode: {},
  } as unknown as OpsAlphaDataLike;
  const normalized = normalizeOpsAlphaDataQualityWarningsInput(raw);
  assert.ok(normalized);
  assert.equal(normalized.universeScan, null);
  assert.deepEqual(normalized.meta?.warnings, ["alpha-pon-data.json universeScan の形式が不正です"]);
  const dashboard = buildOpsDashboard(cleanInputs(normalized));
  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(dashboard.allIssues.some(issue => issue.title.includes("UI 生成データに warning")));
}

for (const validUniverseScan of [
  { scanStatus: "fresh", fallbackReason: null },
  { scanStatus: "mock", fallbackReason: null },
  { scanStatus: "stale_fallback", fallbackReason: "jquants_zero_candidates" },
] as const) {
  const raw = {
    generatedAt: TODAY,
    meta: { warnings: [] },
    universeScan: validUniverseScan,
    dataQualityByCode: {},
  } as unknown as OpsAlphaDataLike;
  assert.equal(normalizeOpsAlphaDataQualityWarningsInput(raw), raw);
}

const valid: OpsAlphaDataLike = {
  generatedAt: TODAY,
  meta: { warnings: ["existing warning"] },
  universeScan: { scanStatus: "fresh", fallbackReason: null },
  dataQualityByCode: { "8136": { quality: { level: "ok" }, warnings: ["existing warning"] } },
};
assert.equal(normalizeOpsAlphaWarningsInput(valid), valid);
assert.equal(normalizeOpsAlphaDataQualityWarningsInput(valid), valid);

console.log("ops-dashboard-alpha-input: malformed warnings and universe scan states fail closed");
