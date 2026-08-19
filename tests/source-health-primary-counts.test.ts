import assert from "node:assert/strict";
import { normalizeSourceHealthScoreRows } from "../src/source-health-input.js";

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

console.log("source health primary disclosure counts: nonnegative safe-integer contract OK");
