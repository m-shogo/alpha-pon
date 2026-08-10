import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateOutcomeSemanticReviewRecord,
  withOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewContext,
} from "../../src/research/outcome-semantic-review.js";
import { withQuantitativeOutcomeHash } from "../../src/research/quantitative-outcome.js";
import { withRecommendationHash } from "../../src/research/recommendation-persistence.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-semantic-review.schema.json", "utf-8"),
) as JsonSchema;

const recommendation = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:semantic-evidence-instant:001",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  code: "8136",
  companyName: "株式会社サンリオ",
  currentPrice: 1000,
  currentPriceRecordHash: "a".repeat(64),
  currentPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  decision: "WATCH",
  timeHorizon: "synthetic fixture",
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
  sourceEvidence: [{ tier: "A", ref: "evidence:issue:instant" }],
  edgeIds: ["synthetic-edge"],
  benchmark: "TOPIX",
  benchmarkPriceRecordHash: "b".repeat(64),
  benchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  sectorBenchmark: "TOPIX-17-RETAIL",
  sectorBenchmarkPriceRecordHash: "c".repeat(64),
  sectorBenchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  outcomeReviewDate: "2026-11-07",
  status: "open",
  automaticTradingAuthorized: false,
});

const outcome = withQuantitativeOutcomeHash({
  schemaVersion: 1,
  outcomeId: "outcome:semantic-evidence-instant:001",
  recommendationId: recommendation.recommendationId,
  recommendationContentHash: recommendation.contentHash,
  reviewedAt: "2026-08-19T12:00:00+09:00",
  measurementCutoff: "2026-08-19T12:00:00+09:00",
  measurementMethod: "pit-close-common-date-v1",
  returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1",
  issuerCorporateActionClearanceHash: "d".repeat(64),
  baselineTradingDate: "2026-08-06",
  terminalTradingDate: "2026-08-18",
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

function reviewFor(ref: string) {
  return withOutcomeSemanticReviewHash({
    schemaVersion: 1,
    reviewId: `semantic-review:evidence-instant:${ref.split(":").at(-1)}`,
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    quantitativeOutcomeId: outcome.outcomeId,
    quantitativeOutcomeContentHash: outcome.contentHash,
    reviewedAt: "2026-08-20T12:00:00+09:00",
    evidenceCutoff: "2026-08-20T11:00:00+09:00",
    reviewAuthority: "provisional_ai",
    reviewerRef: "reviewer:ai:alpha-pon",
    learningUse: "proposal_only",
    invalidationAssessment: "inconclusive",
    triggeredInvalidationRules: [],
    invalidationEvidenceRefs: [],
    verdict: "inconclusive",
    assumptionAssessments: [],
    missingEvidence: ["synthetic fixture"],
    unexpectedConfounders: [],
    lessons: [],
    proposedRuleChanges: [],
    sourceEvidence: [{ tier: "A", ref }],
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function context(observedAt: string): OutcomeSemanticReviewContext {
  return {
    recommendationsById: new Map([[recommendation.recommendationId, recommendation]]),
    quantitativeOutcomesById: new Map([[outcome.outcomeId, outcome]]),
    evidenceByRef: new Map([["evidence:review:instant", { tier: "A", observedAt }]]),
    reviewersByRef: new Map([["reviewer:ai:alpha-pon", { kind: "ai" }]]),
  };
}

function codes(observedAt: string): string[] {
  return validateOutcomeSemanticReviewRecord(
    reviewFor("evidence:review:instant"),
    schema,
    context(observedAt),
  ).map((item) => item.code);
}

assert.deepEqual(codes("2026-08-20T10:00:00+09:00"), []);
assert.ok(codes("2026-08-20T10:00:00").includes("invalid_review_evidence_observed_at"));
assert.ok(codes("2026-02-29T10:00:00+09:00").includes("invalid_review_evidence_observed_at"));
assert.ok(codes("2026-08-20T11:30:00+09:00").includes("future_review_evidence"));
assert.ok(
  codes("2026-08-20T11:00:00.000000001+09:00").includes("future_review_evidence"),
  "Evidence one nanosecond after evidenceCutoff must remain future instead of collapsing to the same millisecond",
);

{
  const original = reviewFor("evidence:review:instant");
  const { contentHash: _contentHash, ...input } = original;
  const record = withOutcomeSemanticReviewHash({
    ...input,
    reviewedAt: "2026-08-20T12:00:00.000000000+09:00",
    evidenceCutoff: "2026-08-20T12:00:00.000000001+09:00",
  });
  const reviewCodes = validateOutcomeSemanticReviewRecord(
    record,
    schema,
    context("2026-08-20T11:00:00+09:00"),
  ).map((item) => item.code);
  assert.ok(
    reviewCodes.includes("evidence_cutoff_after_review"),
    "evidenceCutoff one nanosecond after reviewedAt must fail closed",
  );
}

console.log("outcome-semantic-review-evidence-instant.test.ts passed");
