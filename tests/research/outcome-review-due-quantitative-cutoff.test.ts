import assert from "node:assert/strict";
import { deriveOutcomeReviewDueState } from "../../src/research/outcome-review-due.js";
import { withQuantitativeOutcomeHash } from "../../src/research/quantitative-outcome.js";
import { withRecommendationHash } from "../../src/research/recommendation-persistence.js";

const recommendation = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:review-due:quant-cutoff",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  code: "8136",
  companyName: "株式会社サンリオ",
  currentPrice: 1000,
  currentPriceRecordHash: "a".repeat(64),
  currentPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  decision: "WATCH",
  timeHorizon: "synthetic",
  bullScenario: "synthetic bull",
  baseScenario: "synthetic base",
  bearScenario: "synthetic bear",
  catalysts: ["synthetic catalyst"],
  risks: ["synthetic risk"],
  confirmationConditions: ["synthetic confirmation"],
  invalidationRules: ["synthetic invalidation"],
  exitConditions: ["synthetic exit"],
  evidenceSummary: {
    newFacts: ["synthetic new fact"],
    knownFacts: ["synthetic known fact"],
    assumptions: ["synthetic assumption"],
    forecasts: ["synthetic forecast"],
    opinions: ["synthetic opinion"],
  },
  sourceEvidence: [{ tier: "A", ref: "synthetic:evidence" }],
  edgeIds: ["synthetic-edge"],
  benchmark: "TOPIX",
  benchmarkPriceRecordHash: "b".repeat(64),
  benchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  sectorBenchmark: "TOPIX-17-RETAIL",
  sectorBenchmarkPriceRecordHash: "c".repeat(64),
  sectorBenchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  outcomeReviewDate: "2026-08-20",
  status: "open",
  automaticTradingAuthorized: false,
});

function outcome(measurementCutoff: string) {
  return withQuantitativeOutcomeHash({
    schemaVersion: 1,
    outcomeId: "outcome:review-due:quant-cutoff",
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    reviewedAt: "2026-08-20T10:00:00.000000002+09:00",
    measurementCutoff,
    measurementMethod: "pit-close-common-date-v1",
    returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1",
    issuerCorporateActionClearanceHash: "d".repeat(64),
    baselineTradingDate: "2026-08-06",
    terminalTradingDate: "2026-08-19",
    issuerBaselineRecordHash: "a".repeat(64),
    benchmarkBaselineRecordHash: "b".repeat(64),
    sectorBenchmarkBaselineRecordHash: "c".repeat(64),
    issuerTerminalRecordHash: "e".repeat(64),
    benchmarkTerminalRecordHash: "f".repeat(64),
    sectorBenchmarkTerminalRecordHash: "1".repeat(64),
    issuerMeasurementRecordHashes: ["a".repeat(64), "e".repeat(64)],
    benchmarkMeasurementRecordHashes: ["b".repeat(64), "f".repeat(64)],
    sectorBenchmarkMeasurementRecordHashes: ["c".repeat(64), "1".repeat(64)],
    maxReturn: 0.1,
    maxDrawdown: -0.05,
    terminalReturn: 0.08,
    benchmarkReturn: 0.02,
    sectorBenchmarkReturn: 0.03,
    benchmarkExcessReturn: 0.06,
    sectorBenchmarkExcessReturn: 0.05,
    targetAssessment: "not_applicable",
    reviewStage: "quantitative_measurement",
    invalidationAssessment: "not_assessed",
    verdict: "inconclusive",
    correctAssumptions: [],
    incorrectAssumptions: [],
    missingEvidence: [],
    unexpectedConfounders: [],
    lessons: [],
    nextRuleChanges: [],
    automaticTradingAuthorized: false,
  });
}

assert.throws(
  () => deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [outcome("2026-08-20T10:00:00.000000001+09:00")],
    semanticReviews: [],
    asOf: new Date("2026-08-20T03:00:00.000Z"),
  }),
  /measurementCutoff must equal reviewedAt/,
);

const valid = outcome("2026-08-20T10:00:00.000000002+09:00");
const state = deriveOutcomeReviewDueState({
  recommendation,
  quantitativeOutcomes: [valid],
  semanticReviews: [],
  asOf: new Date("2026-08-20T03:00:00.000Z"),
});
assert.equal(state.state, "semantic_review_due");
assert.equal(state.latestQuantitativeOutcomeId, valid.outcomeId);

console.log("outcome-review-due: quantitative measurementCutoff v1 invariant fails closed OK");
