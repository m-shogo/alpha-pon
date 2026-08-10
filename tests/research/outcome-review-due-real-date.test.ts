import assert from "node:assert/strict";
import { deriveOutcomeReviewDueState } from "../../src/research/outcome-review-due.js";
import { withRecommendationHash } from "../../src/research/recommendation-persistence.js";

function recommendation(outcomeReviewDate: string) {
  return withRecommendationHash({
    schemaVersion: 1,
    recommendationId: `rec:review-date:${outcomeReviewDate}`,
    issuedAt: "2026-02-28T09:10:00+09:00",
    informationCutoff: "2026-02-28T09:00:00+09:00",
    code: "TEST1",
    companyName: "Synthetic Fixture",
    currentPrice: 1000,
    currentPriceRecordHash: "a".repeat(64),
    currentPriceFirstExecutableAt: "2026-02-28T09:00:00+09:00",
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
    sourceEvidence: [{ tier: "A", ref: "synthetic:evidence:review-date" }],
    edgeIds: ["synthetic-edge"],
    benchmark: "TOPIX",
    benchmarkPriceRecordHash: "b".repeat(64),
    benchmarkPriceFirstExecutableAt: "2026-02-28T09:00:00+09:00",
    sectorBenchmark: "TOPIX-17",
    sectorBenchmarkPriceRecordHash: "c".repeat(64),
    sectorBenchmarkPriceFirstExecutableAt: "2026-02-28T09:00:00+09:00",
    outcomeReviewDate,
    status: "open",
    automaticTradingAuthorized: false,
  });
}

{
  assert.throws(
    () => deriveOutcomeReviewDueState({
      recommendation: recommendation("2026-02-30"),
      quantitativeOutcomes: [],
      semanticReviews: [],
      asOf: new Date("2026-03-05T03:00:00Z"),
    }),
    /invalid outcomeReviewDate: non-Gregorian date 2026-02-30/,
  );
  console.log("outcome-review-due: impossible Gregorian review date fails closed OK");
}

{
  const state = deriveOutcomeReviewDueState({
    recommendation: recommendation("2024-02-29"),
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2024-03-01T03:00:00Z"),
  });
  assert.equal(state.overdue, true);
  assert.equal(state.daysPastDue, 1);
  console.log("outcome-review-due: valid leap-day review date remains supported OK");
}

console.log("outcome-review-due-real-date.test.ts: all tests passed");
