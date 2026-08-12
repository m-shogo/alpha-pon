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
  outcomeReviewDate: string;
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
    benchmarkPriceFirstExecutableAt: input.informationCutoff,
    sectorBenchmark: "TOPIX-17-RETAIL",
    sectorBenchmarkPriceRecordHash: "c".repeat(64),
    sectorBenchmarkPriceFirstExecutableAt: input.informationCutoff,
    outcomeReviewDate: input.outcomeReviewDate,
    status: "open",
    ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
    automaticTradingAuthorized: false,
  });
}

const root = recommendation({
  recommendationId: "rec:review-due:root",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  outcomeReviewDate: "2026-08-20",
});
const revision = recommendation({
  recommendationId: "rec:review-due:revision",
  issuedAt: "2026-08-08T09:10:00+09:00",
  informationCutoff: "2026-08-08T09:00:00+09:00",
  outcomeReviewDate: "2026-08-21",
  supersedesId: root.recommendationId,
});

{
  const summary = deriveOutcomeReviewDueSummary({
    recommendations: [root, revision],
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-22T03:00:00.000Z"),
  });

  assert.equal(summary.total, 1);
  assert.equal(summary.states.length, 1);
  assert.equal(summary.states[0]?.recommendationId, revision.recommendationId);
  assert.equal(summary.counts.quantitative_due, 1);
  assert.equal(summary.overdue, 1);
  console.log("outcome-review-due: superseded recommendation revisions do not duplicate the current review queue OK");
}

{
  const futureRevision = recommendation({
    recommendationId: "rec:review-due:future-revision",
    issuedAt: "2026-08-23T09:10:00+09:00",
    informationCutoff: "2026-08-23T09:00:00+09:00",
    outcomeReviewDate: "2026-08-30",
    supersedesId: root.recommendationId,
  });
  const summary = deriveOutcomeReviewDueSummary({
    recommendations: [root, futureRevision],
    quantitativeOutcomes: [],
    semanticReviews: [],
    asOf: new Date("2026-08-22T03:00:00.000Z"),
  });

  assert.equal(summary.total, 1);
  assert.equal(summary.states[0]?.recommendationId, root.recommendationId);
  assert.equal(summary.states[0]?.dueDate, root.outcomeReviewDate);
  console.log("outcome-review-due: future recommendation revision cannot rewrite an earlier PIT review queue OK");
}
