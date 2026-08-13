import assert from "node:assert/strict";
import { deriveOutcomeReviewDueSummary } from "../../src/research/outcome-review-due.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";

function recommendation(recommendationId: string): RecommendationRecord {
  return withRecommendationHash({
    schemaVersion: 1,
    recommendationId,
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
    sourceEvidence: [{ tier: "A", ref: "synthetic:evidence:recommendation" }],
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
}

const record = recommendation("rec:duplicate-lineage");

assert.throws(
  () => deriveOutcomeReviewDueSummary({
    recommendations: [record, { ...record }],
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-20T03:00:00.000Z"),
  }),
  /duplicate Recommendation recommendationId in outcome review queue: rec:duplicate-lineage/,
);

console.log("outcome-review-due: duplicate Recommendation lineage fails closed OK");
