import assert from "node:assert/strict";
import { normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

const valid = normalizeSourceHealthScoreRows([{
  code: "8136",
  marketContext: { benchmark: "TOPIX" },
  financialQuality: { status: "partial" },
}]);
assert.equal(valid.valid, true, "object-shaped coverage metadata remains valid");

for (const malformed of [
  { code: "8136", marketContext: "present" },
  { code: "8136", marketContext: ["TOPIX"] },
  { code: "8136", marketContext: {} },
  { code: "8136", financialQuality: "present" },
  { code: "8136", financialQuality: ["ok"] },
  { code: "8136", financialQuality: {} },
] as const) {
  const result = normalizeSourceHealthScoreRows([malformed]);
  assert.equal(
    result.valid,
    false,
    "truthy but unusable coverage metadata must not inflate source-health coverage counts",
  );
  assert.deepEqual(result.rows, [], "malformed coverage rows must fail closed");
}

const confirmedWithEvidence = normalizeSourceHealthScoreRows([{
  code: "8136",
  primaryDisclosureReview: {
    decision: "confirmed",
    warnings: [],
    blockers: [],
    sourceCoverage: {
      tdnetCount: 1,
      edinetCount: 0,
      fetchErrorCount: 0,
      scannedEdinetDates: ["2026-08-16"],
    },
  },
}]);
assert.equal(confirmedWithEvidence.valid, true, "confirmed primary review with official-source evidence remains valid");

const confirmedWithoutEvidence = normalizeSourceHealthScoreRows([{
  code: "8136",
  primaryDisclosureReview: {
    decision: "confirmed",
    warnings: [],
    blockers: [],
    sourceCoverage: {
      tdnetCount: 0,
      edinetCount: 0,
      fetchErrorCount: 0,
      scannedEdinetDates: ["2026-08-16"],
    },
  },
}]);
assert.equal(
  confirmedWithoutEvidence.valid,
  false,
  "confirmed primary review must not count as healthy without TDnet/EDINET evidence",
);
assert.deepEqual(confirmedWithoutEvidence.rows, [], "unsupported confirmed reviews must fail closed");

console.log("source-health-coverage-shape.test.ts passed");
