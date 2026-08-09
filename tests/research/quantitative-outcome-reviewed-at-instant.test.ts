import assert from "node:assert/strict";
import { buildQuantitativeOutcomeRecord } from "../../src/research/quantitative-outcome.js";
import type { RecommendationRecord } from "../../src/research/recommendation-persistence.js";

const minimalInput = {
  outcomeId: "outcome:strict-reviewed-at",
  recommendation: {
    issuedAt: "2026-08-07T09:10:00+09:00",
  } as RecommendationRecord,
  priceRecordsByHash: new Map(),
  corporateActionClearancesByHash: new Map(),
  issuerCorporateActionClearanceHash: "0".repeat(64),
};

assert.throws(
  () => buildQuantitativeOutcomeRecord({
    ...minimalInput,
    reviewedAt: "2026-08-14T12:00:00",
  }),
  /reviewedAt must be an ISO-8601 timestamp with explicit timezone/,
);

assert.throws(
  () => buildQuantitativeOutcomeRecord({
    ...minimalInput,
    reviewedAt: "2026-02-30T12:00:00+09:00",
  }),
  /reviewedAt must be a valid Gregorian ISO-8601 timestamp/,
);

assert.throws(
  () => buildQuantitativeOutcomeRecord({
    ...minimalInput,
    recommendation: {
      ...minimalInput.recommendation,
      issuedAt: "2026-08-07T09:10:00",
    },
    reviewedAt: "2026-08-14T12:00:00+09:00",
  }),
  /recommendation\.issuedAt must be an ISO-8601 timestamp with explicit timezone/,
);

console.log("quantitative-outcome-reviewed-at-instant.test.ts passed");
