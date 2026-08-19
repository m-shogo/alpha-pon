import assert from "node:assert/strict";
import { normalizePrimaryDisclosureLearningScoreInput } from "../src/primary-disclosure-learning-input.js";

const normalized = normalizePrimaryDisclosureLearningScoreInput([
  {
    code: "8136",
    name: "サンリオ",
    score: 80,
    alertLevel: "watch",
    createdAt: "2026-08-19",
    primaryDisclosureReview: {
      sourceCoverage: {
        tdnetCount: -1,
        edinetCount: 1.5,
        fetchErrorCount: Number.MAX_SAFE_INTEGER + 1,
      },
    },
  },
  {
    code: "9984",
    name: "ソフトバンクグループ",
    score: 70,
    alertLevel: "watch",
    createdAt: "2026-08-19",
    primaryDisclosureReview: {
      sourceCoverage: {
        tdnetCount: 2,
        edinetCount: 3,
        fetchErrorCount: 0,
      },
    },
  },
], "scores_2026-08-19.json", "2026-08-19");

assert.equal(normalized.rows.length, 2, "invalid provenance counts must not drop an otherwise usable score row");
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.sourceCoverage, {
  tdnetCount: undefined,
  edinetCount: undefined,
  fetchErrorCount: undefined,
  scannedEdinetDates: [],
});
assert.deepEqual(normalized.rows[1].primaryDisclosureReview?.sourceCoverage, {
  tdnetCount: 2,
  edinetCount: 3,
  fetchErrorCount: 0,
  scannedEdinetDates: [],
});
assert.equal(
  normalized.warnings.filter(warning => warning.endsWith("invalid_count")).length,
  3,
  "negative, fractional, and unsafe provenance counts must be surfaced as metadata warnings",
);

console.log("primary disclosure learning source count tests passed");
