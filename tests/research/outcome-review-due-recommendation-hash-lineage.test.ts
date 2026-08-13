import assert from "node:assert/strict";
import { deriveOutcomeReviewDueSummary } from "../../src/research/outcome-review-due.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";

function recommendation(input: {
  recommendationId: string;
  issuedAt: string;
  informationCutoff: string;
  supersedesId?: string;
}): RecommendationRecord {
  return withRecommendationHash({
    schemaVersion: 1,
    recommendationId: input.recommendationId,
    issuedAt: input.issuedAt,
    informationCutoff: input.informationCutoff,
    code: "8136",
    companyName: "株式会社サンリオ",
    currentPrice: 1000,
    currentPriceRecordHash: "a".repeat(64),
    currentPriceFirstExecutableAt: input.informationCutoff,
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
    benchmarkPriceFirstExecutableAt: input.informationCutoff,
    sectorBenchmark: "TOPIX-17-RETAIL",
    sectorBenchmarkPriceRecordHash: "c".repeat(64),
    sectorBenchmarkPriceFirstExecutableAt: input.informationCutoff,
    outcomeReviewDate: "2026-08-20",
    status: "open",
    ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
    automaticTradingAuthorized: false,
  });
}

const root = recommendation({
  recommendationId: "rec:hash-lineage:root",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
});
const revision = recommendation({
  recommendationId: "rec:hash-lineage:revision",
  issuedAt: "2026-08-07T09:10:00.000000001+09:00",
  informationCutoff: "2026-08-07T09:00:00.000000001+09:00",
  supersedesId: root.recommendationId,
});

{
  const summary = deriveOutcomeReviewDueSummary({
    recommendations: [root, revision],
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-20T03:00:00.000Z"),
  });
  assert.equal(summary.total, 1);
  assert.equal(summary.states[0]?.recommendationId, revision.recommendationId);
  console.log("outcome-review-due: valid Recommendation ancestor hash lineage stays readable OK");
}

{
  const corruptedRoot: RecommendationRecord = {
    ...root,
    baseScenario: "tampered after hashing",
  };
  assert.throws(
    () => deriveOutcomeReviewDueSummary({
      recommendations: [corruptedRoot, revision],
      quantitativeOutcomes: [],
      semanticReviews: [],
      asOf: new Date("2026-08-20T03:00:00.000Z"),
    }),
    /invalid Recommendation contentHash: rec:hash-lineage:root/,
  );
  console.log("outcome-review-due: corrupted superseded Recommendation ancestor fails closed OK");
}
