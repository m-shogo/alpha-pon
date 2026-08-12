import assert from "node:assert/strict";
import { deriveOutcomeReviewDueState } from "../../src/research/outcome-review-due.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";
import {
  withQuantitativeOutcomeHash,
  type QuantitativeOutcomeRecord,
} from "../../src/research/quantitative-outcome.js";
import {
  withOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewRecord,
} from "../../src/research/outcome-semantic-review.js";

const recommendation: RecommendationRecord = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:future-poisoning:001",
  issuedAt: "2026-08-20T09:00:00+09:00",
  informationCutoff: "2026-08-20T08:59:00+09:00",
  code: "8136",
  companyName: "株式会社サンリオ",
  currentPrice: 1000,
  currentPriceRecordHash: "a".repeat(64),
  currentPriceFirstExecutableAt: "2026-08-20T08:59:00+09:00",
  decision: "BUY",
  timeHorizon: "synthetic",
  bullScenario: "synthetic bull",
  baseScenario: "synthetic base",
  bearScenario: "synthetic bear",
  catalysts: [],
  risks: [],
  confirmationConditions: [],
  invalidationRules: [],
  exitConditions: [],
  evidenceSummary: {
    newFacts: [],
    knownFacts: [],
    assumptions: [],
    forecasts: [],
    opinions: [],
  },
  sourceEvidence: [],
  edgeIds: [],
  benchmark: "TOPIX",
  benchmarkPriceRecordHash: "b".repeat(64),
  benchmarkPriceFirstExecutableAt: "2026-08-20T08:59:00+09:00",
  sectorBenchmark: "TOPIX-17-RETAIL",
  sectorBenchmarkPriceRecordHash: "c".repeat(64),
  sectorBenchmarkPriceFirstExecutableAt: "2026-08-20T08:59:00+09:00",
  outcomeReviewDate: "2026-08-20",
  status: "open",
  automaticTradingAuthorized: false,
});

const currentOutcome: QuantitativeOutcomeRecord = withQuantitativeOutcomeHash({
  schemaVersion: 1,
  outcomeId: "outcome:future-poisoning:current",
  recommendationId: recommendation.recommendationId,
  recommendationContentHash: recommendation.contentHash,
  reviewedAt: "2026-08-20T10:00:00+09:00",
  measurementCutoff: "2026-08-20T10:00:00+09:00",
  measurementMethod: "pit-close-common-date-v1",
  returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1",
  issuerCorporateActionClearanceHash: "d".repeat(64),
  baselineTradingDate: "2026-08-19",
  terminalTradingDate: "2026-08-20",
  issuerBaselineRecordHash: "a".repeat(64),
  benchmarkBaselineRecordHash: "b".repeat(64),
  sectorBenchmarkBaselineRecordHash: "c".repeat(64),
  issuerTerminalRecordHash: "e".repeat(64),
  benchmarkTerminalRecordHash: "f".repeat(64),
  sectorBenchmarkTerminalRecordHash: "1".repeat(64),
  issuerMeasurementRecordHashes: ["a".repeat(64), "e".repeat(64)],
  benchmarkMeasurementRecordHashes: ["b".repeat(64), "f".repeat(64)],
  sectorBenchmarkMeasurementRecordHashes: ["c".repeat(64), "1".repeat(64)],
  maxReturn: 0,
  maxDrawdown: 0,
  terminalReturn: 0,
  benchmarkReturn: 0,
  sectorBenchmarkReturn: 0,
  benchmarkExcessReturn: 0,
  sectorBenchmarkExcessReturn: 0,
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

{
  const futureOutcome = withQuantitativeOutcomeHash({
    ...currentOutcome,
    outcomeId: "outcome:future-poisoning:future",
    reviewedAt: "2026-08-20T10:00:00.000000001+09:00",
    measurementCutoff: "2026-08-20T10:00:00.000000001+09:00",
    supersedesOutcomeId: currentOutcome.outcomeId,
  });
  const corruptedFutureOutcome: QuantitativeOutcomeRecord = {
    ...futureOutcome,
    terminalReturn: 0.5,
  };
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [currentOutcome, corruptedFutureOutcome],
    semanticReviews: [],
    asOf: new Date("2026-08-20T01:00:00.000Z"),
  });
  assert.equal(state.latestQuantitativeOutcomeId, currentOutcome.outcomeId);
  assert.equal(state.state, "semantic_review_due");
  console.log("outcome-review-due: future corrupted quantitative revision cannot poison historical as-of state OK");
}

{
  const futureReview = withOutcomeSemanticReviewHash({
    schemaVersion: 1,
    reviewId: "semantic:future-poisoning:future",
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    quantitativeOutcomeId: currentOutcome.outcomeId,
    quantitativeOutcomeContentHash: currentOutcome.contentHash,
    reviewedAt: "2026-08-20T10:00:00.000000001+09:00",
    evidenceCutoff: "2026-08-20T10:00:00.000000001+09:00",
    reviewAuthority: "provisional_ai",
    reviewerRef: "reviewer:synthetic",
    learningUse: "proposal_only",
    invalidationAssessment: "inconclusive",
    triggeredInvalidationRules: [],
    invalidationEvidenceRefs: [],
    verdict: "inconclusive",
    assumptionAssessments: [],
    missingEvidence: [],
    unexpectedConfounders: [],
    lessons: [],
    proposedRuleChanges: [],
    sourceEvidence: [],
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
  const corruptedFutureReview: OutcomeSemanticReviewRecord = {
    ...futureReview,
    verdict: "correct",
  };
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [currentOutcome],
    semanticReviews: [corruptedFutureReview],
    asOf: new Date("2026-08-20T01:00:00.000Z"),
  });
  assert.equal(state.latestSemanticReviewId, null);
  assert.equal(state.state, "semantic_review_due");
  console.log("outcome-review-due: future corrupted semantic review cannot poison historical as-of state OK");
}
