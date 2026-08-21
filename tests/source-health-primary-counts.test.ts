import assert from "node:assert/strict";
import { hasValidPrimaryDisclosureReview, normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

function scoreWithCoverage(sourceCoverage: Record<string, unknown>) {
  return [{
    code: "8136",
    primaryDisclosureReview: {
      decision: "confirmed",
      sourceCoverage,
    },
  }];
}

for (const malformedCoverage of [
  { tdnetCount: -1, edinetCount: 0, fetchErrorCount: 0 },
  { tdnetCount: 0.5, edinetCount: 0, fetchErrorCount: 0 },
  { tdnetCount: Number.MAX_SAFE_INTEGER + 1, edinetCount: 0, fetchErrorCount: 0 },
  { tdnetCount: 0, edinetCount: -1, fetchErrorCount: 0 },
  { tdnetCount: 0, edinetCount: 0.5, fetchErrorCount: 0 },
  { tdnetCount: 0, edinetCount: Number.MAX_SAFE_INTEGER + 1, fetchErrorCount: 0 },
  { tdnetCount: 0, edinetCount: 0, fetchErrorCount: -1 },
  { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 0.5 },
  { tdnetCount: 0, edinetCount: 0, fetchErrorCount: Number.MAX_SAFE_INTEGER + 1 },
] as const) {
  const normalized = normalizeSourceHealthScoreRows(scoreWithCoverage(malformedCoverage));
  assert.equal(normalized.valid, false, "disclosure counts must be nonnegative safe integers before aggregation");
  assert.deepEqual(normalized.rows, []);
}

const valid = normalizeSourceHealthScoreRows(scoreWithCoverage({
  tdnetCount: 1,
  edinetCount: 2,
  fetchErrorCount: 0,
}));
assert.equal(valid.valid, true, "ordinary nonnegative integer counts remain eligible");

assert.equal(
  hasValidPrimaryDisclosureReview({
    decision: "caution",
    warnings: ["TDnet: caution"],
    blockers: [],
    sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
  }),
  true,
  "canonical caution reviews with warnings but no blockers remain valid",
);

assert.equal(
  hasValidPrimaryDisclosureReview({
    decision: "caution",
    warnings: ["TDnet: caution"],
    blockers: ["TDnet: blocker"],
    sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
  }),
  false,
  "caution must not hide blocker evidence that canonical production would classify as block",
);

assert.equal(
  hasValidPrimaryDisclosureReview({
    decision: "missing",
    warnings: [],
    blockers: [],
    sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 0 },
  }),
  true,
  "canonical missing reviews without source evidence or fetch failures remain valid",
);

for (const contradictoryMissing of [
  {
    decision: "missing",
    warnings: [],
    blockers: [],
    sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
  },
  {
    decision: "missing",
    warnings: ["一次情報取得エラー"],
    blockers: [],
    sourceCoverage: { tdnetCount: 0, edinetCount: 0, fetchErrorCount: 1 },
  },
  {
    decision: "missing",
    warnings: [],
    blockers: ["TDnet: blocker"],
    sourceCoverage: { tdnetCount: 1, edinetCount: 0, fetchErrorCount: 0 },
  },
] as const) {
  assert.equal(
    hasValidPrimaryDisclosureReview(contradictoryMissing),
    false,
    "missing must not hide primary evidence, fetch errors, warnings, or blockers",
  );
}

console.log("source health primary disclosure counts: nonnegative safe-integer and decision/evidence consistency contract OK");
