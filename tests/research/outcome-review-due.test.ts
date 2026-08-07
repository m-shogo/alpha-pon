import assert from "node:assert/strict";
import {
  deriveOutcomeReviewDueState,
  deriveOutcomeReviewDueSummary,
} from "../../src/research/outcome-review-due.js";
import {
  withOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewRecord,
} from "../../src/research/outcome-semantic-review.js";
import {
  withQuantitativeOutcomeHash,
  type QuantitativeOutcomeRecord,
} from "../../src/research/quantitative-outcome.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";

const recommendation: RecommendationRecord = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:review-due:001",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  code: "8136",
  companyName: "株式会社サンリオ",
  currentPrice: 1000,
  currentPriceRecordHash: "a".repeat(64),
  currentPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  decision: "BUY",
  timeHorizon: "2 weeks synthetic",
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

function quantitativeOutcome(input: {
  outcomeId: string;
  reviewedAt: string;
  terminalTradingDate: string;
  supersedesOutcomeId?: string;
}): QuantitativeOutcomeRecord {
  return withQuantitativeOutcomeHash({
    schemaVersion: 1,
    outcomeId: input.outcomeId,
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    reviewedAt: input.reviewedAt,
    measurementCutoff: input.reviewedAt,
    measurementMethod: "pit-close-common-date-v1",
    returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1",
    issuerCorporateActionClearanceHash: "d".repeat(64),
    baselineTradingDate: "2026-08-06",
    terminalTradingDate: input.terminalTradingDate,
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
    ...(input.supersedesOutcomeId ? { supersedesOutcomeId: input.supersedesOutcomeId } : {}),
    automaticTradingAuthorized: false,
  });
}

const quant1 = quantitativeOutcome({
  outcomeId: "outcome:review-due:001",
  reviewedAt: "2026-08-20T10:00:00+09:00",
  terminalTradingDate: "2026-08-19",
});
const quant2 = quantitativeOutcome({
  outcomeId: "outcome:review-due:002",
  reviewedAt: "2026-08-22T10:00:00+09:00",
  terminalTradingDate: "2026-08-21",
  supersedesOutcomeId: quant1.outcomeId,
});

function semanticReview(input: {
  reviewId: string;
  outcome: QuantitativeOutcomeRecord;
  reviewedAt: string;
  authority: "provisional_ai" | "human_confirmed";
  supersedesReviewId?: string;
}): OutcomeSemanticReviewRecord {
  return withOutcomeSemanticReviewHash({
    schemaVersion: 1,
    reviewId: input.reviewId,
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    quantitativeOutcomeId: input.outcome.outcomeId,
    quantitativeOutcomeContentHash: input.outcome.contentHash,
    reviewedAt: input.reviewedAt,
    evidenceCutoff: input.reviewedAt,
    reviewAuthority: input.authority,
    reviewerRef: input.authority === "human_confirmed" ? "reviewer:human" : "reviewer:ai",
    learningUse: input.authority === "human_confirmed" ? "human_confirmed" : "proposal_only",
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
    ...(input.supersedesReviewId ? { supersedesReviewId: input.supersedesReviewId } : {}),
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const provisional1 = semanticReview({
  reviewId: "semantic:review-due:provisional",
  outcome: quant1,
  reviewedAt: "2026-08-20T12:00:00+09:00",
  authority: "provisional_ai",
});
const human1 = semanticReview({
  reviewId: "semantic:review-due:human",
  outcome: quant1,
  reviewedAt: "2026-08-20T13:00:00+09:00",
  authority: "human_confirmed",
  supersedesReviewId: provisional1.reviewId,
});

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-19T14:59:00.000Z"),
  });
  assert.equal(state.asOfJstDate, "2026-08-19");
  assert.equal(state.state, "not_due");
  assert.equal(state.nextAction, "wait_for_review_date");
  console.log("outcome-review-due: before due date stays not_due OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-19T15:01:00.000Z"),
  });
  assert.equal(state.asOfJstDate, "2026-08-20");
  assert.equal(state.dueToday, true);
  assert.equal(state.state, "quantitative_due");
  assert.equal(state.nextAction, "create_quantitative_outcome");
  console.log("outcome-review-due: JST midnight transition makes review due deterministically OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-22T03:00:00.000Z"),
  });
  assert.equal(state.state, "quantitative_due");
  assert.equal(state.overdue, true);
  assert.equal(state.daysPastDue, 2);
  console.log("outcome-review-due: overdue day count is JST date based OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [quant1],
    semanticReviews: [],
    asOf: new Date("2026-08-21T03:00:00.000Z"),
  });
  assert.equal(state.state, "semantic_review_due");
  assert.equal(state.latestQuantitativeOutcomeId, quant1.outcomeId);
  assert.equal(state.nextAction, "create_semantic_review");
  console.log("outcome-review-due: quantitative completion advances to semantic review due OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [quant1],
    semanticReviews: [provisional1],
    asOf: new Date("2026-08-21T03:00:00.000Z"),
  });
  assert.equal(state.state, "human_confirmation_due");
  assert.equal(state.latestReviewAuthority, "provisional_ai");
  assert.equal(state.nextAction, "request_human_confirmation");
  console.log("outcome-review-due: provisional AI review surfaces human confirmation due OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [quant1],
    semanticReviews: [provisional1, human1],
    asOf: new Date("2026-08-21T03:00:00.000Z"),
  });
  assert.equal(state.state, "reviewed_current");
  assert.equal(state.overdue, false);
  assert.equal(state.nextAction, "none");
  console.log("outcome-review-due: human-confirmed review completes current lineage OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [quant1, quant2],
    semanticReviews: [provisional1, human1],
    asOf: new Date("2026-08-23T03:00:00.000Z"),
  });
  assert.equal(state.latestQuantitativeOutcomeId, quant2.outcomeId);
  assert.equal(state.latestSemanticReviewId, null);
  assert.equal(state.state, "semantic_review_due");
  console.log("outcome-review-due: newer quantitative revision makes prior human review stale for current lineage OK");
}

{
  const mutatedQuant: QuantitativeOutcomeRecord = {
    ...quant1,
    terminalReturn: quant1.terminalReturn + 0.5,
  };
  assert.throws(
    () => deriveOutcomeReviewDueState({
      recommendation,
      quantitativeOutcomes: [mutatedQuant],
      semanticReviews: [],
      asOf: new Date("2026-08-21T03:00:00.000Z"),
    }),
    /invalid Quantitative Outcome contentHash/,
  );
  console.log("outcome-review-due: mutated quantitative record is rejected before scheduling OK");
}

{
  const mutatedReview: OutcomeSemanticReviewRecord = {
    ...human1,
    verdict: "correct",
  };
  assert.throws(
    () => deriveOutcomeReviewDueState({
      recommendation,
      quantitativeOutcomes: [quant1],
      semanticReviews: [mutatedReview],
      asOf: new Date("2026-08-21T03:00:00.000Z"),
    }),
    /invalid Semantic Review contentHash/,
  );
  console.log("outcome-review-due: mutated semantic review is rejected before scheduling OK");
}

{
  const summary = deriveOutcomeReviewDueSummary({
    recommendations: [recommendation],
    quantitativeOutcomes: [quant1],
    semanticReviews: [provisional1],
    asOf: new Date("2026-08-22T03:00:00.000Z"),
  });
  assert.equal(summary.total, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.counts.human_confirmation_due, 1);
  assert.equal(summary.states[0]?.state, "human_confirmation_due");
  console.log("outcome-review-due: summary exposes overdue review queue without mutating records OK");
}

console.log("outcome-review-due.test.ts passed");