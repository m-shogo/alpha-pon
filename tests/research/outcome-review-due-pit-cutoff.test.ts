import assert from "node:assert/strict";
import { deriveOutcomeReviewDueState } from "../../src/research/outcome-review-due.js";
import { withOutcomeSemanticReviewHash } from "../../src/research/outcome-semantic-review.js";
import { withQuantitativeOutcomeHash } from "../../src/research/quantitative-outcome.js";
import { withRecommendationHash } from "../../src/research/recommendation-persistence.js";

const recommendation = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:review-due:pit-cutoff",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  code: "8136",
  companyName: "Synthetic株式会社",
  currentPrice: 1000,
  currentPriceRecordHash: "a".repeat(64),
  currentPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  decision: "BUY",
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
  sourceEvidence: [{ tier: "A" as const, ref: "synthetic:evidence:issue" }],
  edgeIds: ["synthetic-edge"],
  benchmark: "TOPIX",
  benchmarkPriceRecordHash: "b".repeat(64),
  benchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  sectorBenchmark: "TOPIX-17-RETAIL",
  sectorBenchmarkPriceRecordHash: "c".repeat(64),
  sectorBenchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  outcomeReviewDate: "2026-08-20",
  status: "open" as const,
  automaticTradingAuthorized: false as const,
});

const quantitativeOutcome = withQuantitativeOutcomeHash({
  schemaVersion: 1,
  outcomeId: "outcome:review-due:pit-cutoff",
  recommendationId: recommendation.recommendationId,
  recommendationContentHash: recommendation.contentHash,
  reviewedAt: "2026-08-20T10:00:00+09:00",
  measurementCutoff: "2026-08-20T10:00:00+09:00",
  measurementMethod: "pit-close-common-date-v1" as const,
  returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1" as const,
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
  targetAssessment: "not_applicable" as const,
  reviewStage: "quantitative_measurement" as const,
  invalidationAssessment: "not_assessed" as const,
  verdict: "inconclusive" as const,
  correctAssumptions: [],
  incorrectAssumptions: [],
  missingEvidence: [],
  unexpectedConfounders: [],
  lessons: [],
  nextRuleChanges: [],
  automaticTradingAuthorized: false as const,
});

const provisionalReview = withOutcomeSemanticReviewHash({
  schemaVersion: 1,
  reviewId: "semantic:review-due:pit-cutoff:provisional",
  recommendationId: recommendation.recommendationId,
  recommendationContentHash: recommendation.contentHash,
  quantitativeOutcomeId: quantitativeOutcome.outcomeId,
  quantitativeOutcomeContentHash: quantitativeOutcome.contentHash,
  reviewedAt: "2026-08-20T12:00:00+09:00",
  evidenceCutoff: "2026-08-20T12:00:00+09:00",
  reviewAuthority: "provisional_ai" as const,
  reviewerRef: "reviewer:ai",
  learningUse: "proposal_only" as const,
  invalidationAssessment: "inconclusive" as const,
  triggeredInvalidationRules: [],
  invalidationEvidenceRefs: [],
  verdict: "inconclusive" as const,
  assumptionAssessments: [],
  missingEvidence: ["synthetic fixture"],
  unexpectedConfounders: [],
  lessons: [],
  proposedRuleChanges: [],
  sourceEvidence: [{ tier: "A" as const, ref: "synthetic:evidence:review" }],
  ruleMutationAuthorized: false as const,
  edgeGateMutationAuthorized: false as const,
  automaticTradingAuthorized: false as const,
});

const humanReview = withOutcomeSemanticReviewHash({
  ...provisionalReview,
  reviewId: "semantic:review-due:pit-cutoff:human",
  reviewedAt: "2026-08-20T13:00:00+09:00",
  evidenceCutoff: "2026-08-20T13:00:00+09:00",
  reviewAuthority: "human_confirmed" as const,
  reviewerRef: "reviewer:human",
  learningUse: "human_confirmed" as const,
  supersedesReviewId: provisionalReview.reviewId,
});

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [quantitativeOutcome],
    semanticReviews: [provisionalReview, humanReview],
    asOf: new Date("2026-08-20T00:00:00.000Z"), // 09:00 JST, before the quantitative outcome.
  });
  assert.equal(state.asOfJstDate, "2026-08-20");
  assert.equal(state.latestQuantitativeOutcomeId, null);
  assert.equal(state.latestSemanticReviewId, null);
  assert.equal(state.state, "quantitative_due");
  console.log("outcome-review-due: future quantitative/review records cannot leak into an earlier asOf OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [quantitativeOutcome],
    semanticReviews: [provisionalReview, humanReview],
    asOf: new Date("2026-08-20T03:30:00.000Z"), // 12:30 JST, after provisional but before human confirmation.
  });
  assert.equal(state.latestQuantitativeOutcomeId, quantitativeOutcome.outcomeId);
  assert.equal(state.latestSemanticReviewId, provisionalReview.reviewId);
  assert.equal(state.latestReviewAuthority, "provisional_ai");
  assert.equal(state.state, "human_confirmation_due");
  console.log("outcome-review-due: future human confirmation cannot complete historical review state OK");
}

console.log("outcome-review-due-pit-cutoff.test.ts passed");
