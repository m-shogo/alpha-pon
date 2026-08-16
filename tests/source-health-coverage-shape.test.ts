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

for (const invalidDate of ["2026-02-31", "0000-01-01", "2026-8-16", "2026-08-16T00:00:00+09:00"]) {
  const result = normalizeSourceHealthScoreRows([{
    code: "8136",
    primaryDisclosureReview: {
      decision: "confirmed",
      warnings: [],
      blockers: [],
      sourceCoverage: {
        tdnetCount: 1,
        edinetCount: 0,
        fetchErrorCount: 0,
        scannedEdinetDates: [invalidDate],
      },
    },
  }]);
  assert.equal(result.valid, false, `invalid scannedEdinetDates must fail closed: ${invalidDate}`);
  assert.deepEqual(result.rows, [], "invalid EDINET coverage provenance must not count as healthy source coverage");
}

for (const unsupportedConfirmed of [
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "confirmed",
      warnings: [],
      blockers: [],
      sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "confirmed",
      warnings: ["一次情報取得エラー: timeout"],
      blockers: [],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "confirmed",
      warnings: [],
      blockers: ["TDnet: blocker disclosure"],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "confirmed",
      warnings: [],
      blockers: [],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 1 },
    },
  },
] as const) {
  const result = normalizeSourceHealthScoreRows([unsupportedConfirmed]);
  assert.equal(result.valid, false, "confirmed review must not hide missing evidence, warnings, blockers, or fetch errors");
  assert.deepEqual(result.rows, [], "inconsistent confirmed reviews must fail closed");
}

for (const supportedCaution of [
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "caution",
      warnings: ["TDnet: caution disclosure"],
      blockers: [],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "caution",
      warnings: ["一次情報取得エラー: timeout"],
      blockers: [],
      sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 1 },
    },
  },
] as const) {
  assert.equal(
    normalizeSourceHealthScoreRows([supportedCaution]).valid,
    true,
    "caution with disclosure evidence or fetch-error evidence remains valid",
  );
}

for (const unsupportedCaution of [
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "caution",
      warnings: [],
      blockers: [],
      sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "caution",
      blockers: [],
      sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "caution",
      warnings: ["   "],
      blockers: [],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
] as const) {
  const result = normalizeSourceHealthScoreRows([unsupportedCaution]);
  assert.equal(result.valid, false, "unsupported caution must not suppress missing-primary warnings");
  assert.deepEqual(result.rows, [], "unsupported caution rows must fail closed");
}

const supportedBlock = normalizeSourceHealthScoreRows([{
  code: "8136",
  primaryDisclosureReview: {
    decision: "block",
    warnings: [],
    blockers: ["TDnet: blocker disclosure"],
    sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
  },
}]);
assert.equal(supportedBlock.valid, true, "block with blocker disclosure evidence remains valid");

for (const unsupportedBlock of [
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "block",
      warnings: [],
      blockers: ["synthetic blocker"],
      sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "block",
      warnings: [],
      blockers: [],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
  {
    code: "8136",
    primaryDisclosureReview: {
      decision: "block",
      warnings: [],
      blockers: [""],
      sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
    },
  },
] as const) {
  const result = normalizeSourceHealthScoreRows([unsupportedBlock]);
  assert.equal(result.valid, false, "unsupported block must not count as reviewed primary evidence");
  assert.deepEqual(result.rows, [], "unsupported block rows must fail closed");
}

console.log("source-health-coverage-shape.test.ts passed");
