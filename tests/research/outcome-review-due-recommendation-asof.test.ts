import assert from "node:assert/strict";
import { deriveOutcomeReviewDueState } from "../../src/research/outcome-review-due.js";
import { withRecommendationHash } from "../../src/research/recommendation-persistence.js";

const recommendation = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:review-due:future-asof",
  issuedAt: "2026-08-07T09:10:00.000000001+09:00",
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
  sourceEvidence: [{ tier: "A" as const, ref: "synthetic:evidence:future-asof" }],
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

assert.throws(
  () => deriveOutcomeReviewDueState({
    recommendation,
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-07T00:10:00.000Z"),
  }),
  /Recommendation issuedAt is after outcome review due asOf/,
);

const visible = deriveOutcomeReviewDueState({
  recommendation,
  quantitativeOutcomes: [],
  semanticReviews: [],
  asOf: new Date("2026-08-07T00:10:00.001Z"),
});
assert.equal(visible.recommendationId, recommendation.recommendationId);
assert.equal(visible.state, "not_due");

console.log("outcome-review-due-recommendation-asof.test.ts passed");
