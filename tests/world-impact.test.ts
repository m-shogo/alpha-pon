import assert from "node:assert/strict";
import {
  buildWorldImpactAudit,
  buildWorldImpactReviews,
  dedupeReviews,
  mergeExistingReviews,
  type WorldEventImpactReview,
} from "../src/world-impact.js";
import {
  applyWorldImpactLatestSnapshotError,
  assertWorldImpactLatestSnapshotHealthy,
  resolveWorldImpactReportInput,
} from "../src/world-impact-report-input.js";
import { normalizeWorldImpactReviewInputs } from "../src/world-impact-review-input.js";
import type { WorldEventReflection } from "../src/analysis/world-event-reflection.js";

const TODAY = "2026-06-12";

const V3_OUTCOME_DEFAULTS = {
  evaluatedAt: null,
  evaluationAsOf: null,
  priceStartDate: null,
  priceEndDate: null,
  priceStart: null,
  priceEnd: null,
  priceReturnPct: null,
  benchmarkCode: null,
  benchmarkReturnPct: null,
  relativeReturnPct: null,
  directionMatched: null,
  expectedLagDays: null,
  actualLagDays: null,
  lagMatched: null,
  movementMagnitude: null,
  evidence: [] as string[],
  evaluationNotes: null,
  autoMissReason: null,
  manualMissReason: null,
  confidenceAtPrediction: null,
  mechanismAtPrediction: [] as import("../src/world-impact.js").WorldImpactMechanism[],
  sourceReliabilityAtPrediction: null,
};

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
  const inputs = normalizeWorldImpactReviewInputs<
    WorldEventReflection,
    { code: string; name: string; tags?: string[] },
    { code: string; name: string; sector?: string | null; tags?: string[] },
    { code?: string; name?: string }
  >(
    [reflection(), null, "bad-row"],
    {
      candidates: [{ code: "5803", name: "フジクラ", tags: ["AI"] }, null],
      universeCandidates: [{ code: "7011", name: "三菱重工業", sector: "機械", tags: ["防衛"] }, 42],
      generatedCompanyRules: [{ code: "5803", name: "フジクラ" }, []],
    },
  );

  assert.equal(inputs.reflections.length, 1, "malformed reflection rowsを隔離する");
  assert.equal(inputs.candidates.length, 1, "malformed candidate rowsを隔離する");
  assert.equal(inputs.universeCandidates.length, 1, "malformed universe rowsを隔離する");
  assert.equal(inputs.generatedCompanyRules.length, 1, "malformed company-rule rowsを隔離する");
  assert.ok(inputs.warnings.some(warning => warning.includes("world_event_reflections_latest.json: invalid_rows") && warning.includes("dropped 2")));
  assert.ok(inputs.warnings.some(warning => warning.includes("alpha-pon-data.json.candidates: invalid_rows") && warning.includes("dropped 1")));
  assert.doesNotThrow(() => buildWorldImpactReviews({ ...inputs, today: TODAY }));
  console.log("world-impact: malformed review input rowsを隔離して正常rowを継続する");
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
        missReason: null,
        missedSignals: [],
        lesson: null,
        ...V3_OUTCOME_DEFAULTS,
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
        missReason: null,
        missedSignals: [],
        lesson: null,
        ...V3_OUTCOME_DEFAULTS,
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
        missReason: null,
        missedSignals: [],
        lesson: null,
        ...V3_OUTCOME_DEFAULTS,
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
        missReason: null,
        missedSignals: [],
        lesson: null,
        ...V3_OUTCOME_DEFAULTS,
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

{
  const jsonlReview = makeReview({ reviewKey: "jsonl__5803" });
  const missingLatest = resolveWorldImpactReportInput({ present: false }, [jsonlReview], TODAY);
  assert.equal(missingLatest.latestSnapshotError, false);
  assert.deepEqual(missingLatest.reviews, [jsonlReview], "latest未生成時だけJSONL fallbackを許可する");

  const malformedRoot = resolveWorldImpactReportInput({ present: true, parsed: { reviews: [] } }, [jsonlReview], TODAY);
  assert.equal(malformedRoot.latestSnapshotError, true);
  assert.deepEqual(malformedRoot.reviews, [], "壊れたlatest rootではJSONLへsilent fallbackしない");

  const malformedJson = resolveWorldImpactReportInput({ present: true, parseError: true }, [jsonlReview], TODAY);
  assert.equal(malformedJson.latestSnapshotError, true);
  assert.deepEqual(malformedJson.reviews, [], "JSON parse失敗でもfail closedにする");

  const malformedRow = resolveWorldImpactReportInput({ present: true, parsed: [jsonlReview, null] }, [jsonlReview], TODAY);
  assert.equal(malformedRow.latestSnapshotError, true);
  assert.deepEqual(malformedRow.reviews, [], "latest配列内のnull/scalar rowを空reviewへ正規化せずfail closedにする");

  const missingIdentity = resolveWorldImpactReportInput({ present: true, parsed: [jsonlReview, {}] }, [jsonlReview], TODAY);
  assert.equal(missingIdentity.latestSnapshotError, true);
  assert.deepEqual(missingIdentity.reviews, [], "object-shaped rowでもreviewKey/eventIdがなければ空reviewへ補完せずfail closedにする");

  const partialIdentity = resolveWorldImpactReportInput(
    { present: true, parsed: [jsonlReview, { reviewKey: "incomplete" }] },
    [jsonlReview],
    TODAY,
  );
  assert.equal(partialIdentity.latestSnapshotError, true);
  assert.deepEqual(partialIdentity.reviews, [], "reviewKeyだけのrowもlatest provenanceとして受理しない");

  const missingProvenance = resolveWorldImpactReportInput(
    {
      present: true,
      parsed: [
        jsonlReview,
        {
          reviewKey: "missing-provenance__5803",
          eventId: "missing-provenance",
          topic: "identityだけ残った壊れたlatest row",
        },
      ],
    },
    [jsonlReview],
    TODAY,
  );
  assert.equal(missingProvenance.latestSnapshotError, true);
  assert.deepEqual(
    missingProvenance.reviews,
    [],
    "eventDate/createdAt/updatedAtが欠けたrowをtoday補完してread-only正本へ昇格させない",
  );

  const audit = buildWorldImpactAudit([], TODAY);
  assert.equal(audit.healthStatus, "ok", "空データだけなら基礎auditはok");
  applyWorldImpactLatestSnapshotError(audit, malformedRoot.latestSnapshotError);
  assert.equal(audit.healthStatus, "action_required", "壊れたlatest snapshotはauditをfail closedにする");
  assert.ok(audit.priorityIssues.some(issue => issue.category === "latest_snapshot" && issue.severity === "urgent"));

  assert.doesNotThrow(() => assertWorldImpactLatestSnapshotHealthy(false, "calibrate:world-impact"));
  assert.throws(
    () => assertWorldImpactLatestSnapshotHealthy(true, "calibrate:world-impact"),
    /calibrate:world-impact: data\/world_event_impacts_latest\.json is malformed/,
    "壊れたlatest snapshotではcalibrationを生成しない",
  );
  console.log("world-impact: malformed latest snapshot/root/row/identity/provenance をreport/audit/calibrationでfail closedにする");
}

console.log("world-impact: 全テスト成功");
