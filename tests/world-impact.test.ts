import assert from "node:assert/strict";
import {
  buildWorldImpactAudit,
  buildWorldImpactReviews,
  dedupeReviews,
  mergeExistingReviews,
  type WorldEventImpactReview,
} from "../src/world-impact.js";
import type { WorldEventReflection } from "../src/analysis/world-event-reflection.js";

const TODAY = "2026-06-12";

function reflection(overrides: Partial<WorldEventReflection> = {}): WorldEventReflection {
  return {
    schemaVersion: 1,
    createdAt: "2026-06-11",
    eventId: "2026-06-11_ai-infra",
    title: "AI infrastructure investment expands",
    source: "Official",
    url: "https://example.com",
    publishedAt: "Fri, 12 Jun 2026 00:00:00 GMT",
    totalImpactScore: 80,
    sourceReliability: "official",
    verificationStatus: "confirmed",
    misinformationRisk: "low",
    urgencyScore: 90,
    verificationChecks: ["official release"],
    categories: ["technology"],
    impactedTags: ["AI", "半導体"],
    hypothesisClusters: ["ai-infra"],
    thesis: "AI infrastructure investment expands は半導体関連の確認ポイントとして保存する。",
    chainOfImpact: ["technology: AI / 半導体"],
    possibleBeneficiaries: ["半導体"],
    possibleRisks: ["供給制約"],
    similarLessonIds: [],
    similarLessonTitles: [],
    evidenceNeeded: ["一次情報"],
    invalidationSignals: ["一次情報で裏取りできない"],
    reviewStatus: "open",
    ...overrides,
  };
}

function makeReview(overrides: Partial<WorldEventImpactReview> = {}): WorldEventImpactReview {
  const [base] = buildWorldImpactReviews({
    reflections: [reflection()],
    candidates: [{ code: "5803", name: "フジクラ", tags: ["AI", "データセンター"] }],
    universeCandidates: [],
    generatedCompanyRules: [],
    today: TODAY,
  });
  return { ...base, ...overrides };
}

{
  const reviews = buildWorldImpactReviews({
    reflections: [reflection()],
    candidates: [{ code: "5803", name: "フジクラ", tags: ["AI", "データセンター"] }],
    universeCandidates: [{ code: "7011", name: "三菱重工業", sector: "機械", tags: ["防衛"] }],
    generatedCompanyRules: [],
    today: TODAY,
  });

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].reviewKey, "2026-06-11_ai-infra__5803");
  assert.equal(reviews[0].eventDate, "2026-06-11", "RSS形式 publishedAt でも createdAt を使う");
  assert.equal(reviews[0].dataAvailability, "priceDataPending");
  assert.ok(reviews[0].outcomes.some(outcome => outcome.horizon === "1d" && outcome.dataAvailability === "priceDataPending"));
  console.log("world-impact: タグ一致から銘柄別レビューを作成");
}

{
  const first = makeReview();
  const duplicate = makeReview();
  assert.equal(dedupeReviews([first, duplicate]).length, 1);
  assert.equal(mergeExistingReviews([first], [duplicate]).length, 1);
  console.log("world-impact: reviewKey 重複を抑止");
}

{
  const review = makeReview({
    outcomes: [
      {
        horizon: "1d",
        dueAt: "2026-06-12",
        result: null,
        expectedDirection: "unknown",
        actualDirection: "unknown",
        dataAvailability: "priceDataPending",
        returnPct: null,
        topixReturnPct: null,
        relativeToTopixPct: null,
        missedSignals: [],
        lesson: null,
      },
      {
        horizon: "1d",
        dueAt: "2026-06-12",
        result: null,
        expectedDirection: "unknown",
        actualDirection: "unknown",
        dataAvailability: "priceDataPending",
        returnPct: null,
        topixReturnPct: null,
        relativeToTopixPct: null,
        missedSignals: [],
        lesson: null,
      },
    ],
  });
  const audit = buildWorldImpactAudit([review], TODAY);
  assert.equal(audit.healthStatus, "action_required");
  assert.ok(audit.duplicateKeys.some(item => item.key === "2026-06-11_ai-infra__5803__1d"));
  console.log("world-impact: eventId + companyCode + horizon 重複を検出");
}

{
  const audit = buildWorldImpactAudit([makeReview()], TODAY);
  assert.equal(audit.healthStatus, "ok", "価格データ提供待ちだけなら通常運用");
  assert.equal(audit.pendingReviews, 1);
  assert.equal(audit.priceDataPending, 1);
  assert.equal(audit.overdueReviews, 0);
  assert.ok(audit.priorityIssues.some(issue => issue.severity === "info" && issue.category === "price_data"));
  console.log("world-impact: 価格データ提供待ちは info");
}

{
  const review = makeReview({
    outcomes: [
      {
        horizon: "1d",
        dueAt: "2026-06-10",
        result: "hit",
        expectedDirection: "unknown",
        actualDirection: "unknown",
        dataAvailability: "ok",
        returnPct: null,
        topixReturnPct: null,
        relativeToTopixPct: null,
        missedSignals: [],
        lesson: null,
      },
    ],
  });
  const audit = buildWorldImpactAudit([review], TODAY);
  assert.equal(audit.healthStatus, "action_required");
  assert.equal(audit.unknownMatchedAsHit, 1);
  console.log("world-impact: unknown 同士の hit を緊急検出");
}

{
  const review = makeReview({
    expectedMechanism: "",
    counterArgument: "",
    outcomes: [
      {
        horizon: "1d",
        dueAt: "2026-06-01",
        result: null,
        expectedDirection: "unknown",
        actualDirection: "unknown",
        dataAvailability: "missing",
        returnPct: null,
        topixReturnPct: null,
        relativeToTopixPct: null,
        missedSignals: [],
        lesson: null,
      },
    ],
  });
  const audit = buildWorldImpactAudit([review], TODAY);
  assert.equal(audit.healthStatus, "needs_attention");
  assert.equal(audit.missingMechanisms, 1);
  assert.equal(audit.missingCounterArguments, 1);
  assert.equal(audit.overdueReviews, 1);
  console.log("world-impact: 欠落と期限超過を確認対象にする");
}

console.log("world-impact: 全テスト成功");
