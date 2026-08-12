import assert from "node:assert/strict";
import { deriveOutcomeReviewDueState } from "../../src/research/outcome-review-due.js";
import { withOutcomeSemanticReviewHash } from "../../src/research/outcome-semantic-review.js";
import { withQuantitativeOutcomeHash } from "../../src/research/quantitative-outcome.js";
import { withRecommendationHash } from "../../src/research/recommendation-persistence.js";

const recommendation = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:review-due:semantic-chronology",
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
  sourceEvidence: [{ tier: "A", ref: "synthetic:evidence:issue" }],
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

const outcome = withQuantitativeOutcomeHash({
  schemaVersion: 1,
  outcomeId: "outcome:review-due:semantic-chronology",
  recommendationId: recommendation.recommendationId,
  recommendationContentHash: recommendation.contentHash,
  reviewedAt: "2026-08-20T10:00:00.000000002+09:00",
  measurementCutoff: "2026-08-20T10:00:00.000000002+09:00",
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

function humanReview(evidenceCutoff: string) {
  return withOutcomeSemanticReviewHash({
    schemaVersion: 1,
    reviewId: `semantic:review-due:${evidenceCutoff.endsWith("001+09:00") ? "before" : "boundary"}`,
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    quantitativeOutcomeId: outcome.outcomeId,
    quantitativeOutcomeContentHash: outcome.contentHash,
    reviewedAt: "2026-08-20T10:00:01+09:00",
    evidenceCutoff,
    reviewAuthority: "human_confirmed",
    reviewerRef: "reviewer:human",
    learningUse: "human_confirmed",
    invalidationAssessment: "inconclusive",
    triggeredInvalidationRules: [],
    invalidationEvidenceRefs: [],
    verdict: "inconclusive",
    assumptionAssessments: [],
    missingEvidence: ["synthetic fixture"],
    unexpectedConfounders: [],
    lessons: [],
    proposedRuleChanges: [],
    sourceEvidence: [{ tier: "A", ref: "synthetic:evidence:review" }],
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

{
  const invalidReview = humanReview("2026-08-20T10:00:00.000000001+09:00");
  assert.throws(
    () => deriveOutcomeReviewDueState({
      recommendation,
      quantitativeOutcomes: [outcome],
      semanticReviews: [invalidReview],
      asOf: new Date("2026-08-20T03:00:00.000Z"),
    }),
    /evidenceCutoff is before Quantitative Outcome reviewedAt/,
  );
  console.log("outcome-review-due: semantic evidence cutoff 1ns before quantitative outcome fails closed OK");
}

{
  const boundaryReview = humanReview("2026-08-20T10:00:00.000000002+09:00");
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [outcome],
    semanticReviews: [boundaryReview],
    asOf: new Date("2026-08-20T03:00:00.000Z"),
  });
  assert.equal(state.state, "reviewed_current");
  assert.equal(state.latestSemanticReviewId, boundaryReview.reviewId);
  console.log("outcome-review-due: semantic evidence cutoff equal to quantitative outcome remains valid OK");

  const secondRoot = withOutcomeSemanticReviewHash({
    ...boundaryReview,
    reviewId: "semantic:review-due:second-root",
    reviewedAt: "2026-08-20T10:00:01.000000001+09:00",
    reviewAuthority: "provisional_ai",
    reviewerRef: "reviewer:ai:synthetic",
    learningUse: "proposal_only",
  });
  assert.throws(
    () => deriveOutcomeReviewDueState({
      recommendation,
      quantitativeOutcomes: [outcome],
      semanticReviews: [boundaryReview, secondRoot],
      asOf: new Date("2026-08-20T03:00:02.000Z"),
    }),
    /multiple Semantic Review roots in outcome review queue/,
  );
  console.log("outcome-review-due: second semantic root cannot rewrite a human-confirmed read-only state OK");

  const authorityRegression = withOutcomeSemanticReviewHash({
    ...secondRoot,
    reviewId: "semantic:review-due:authority-regression",
    supersedesReviewId: boundaryReview.reviewId,
  });
  assert.throws(
    () => deriveOutcomeReviewDueState({
      recommendation,
      quantitativeOutcomes: [outcome],
      semanticReviews: [boundaryReview, authorityRegression],
      asOf: new Date("2026-08-20T03:00:02.000Z"),
    }),
    /Semantic Review revision authority regressed/,
  );
  console.log("outcome-review-due: human-confirmed semantic authority cannot regress in read-only projection OK");
}