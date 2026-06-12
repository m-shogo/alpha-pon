// World Impact Intelligence v2 のテスト
// normalize 冪等性 / 欠損フィールド耐性 / reviewStatus 判定 / 監査 v2 項目 / calibration

import assert from "node:assert/strict";
import {
  buildWorldImpactAudit,
  buildWorldImpactCalibration,
  buildWorldImpactReviews,
  inferMechanisms,
  normalizeWorldImpactReview,
  WORLD_IMPACT_MECHANISMS,
  WORLD_IMPACT_MISS_REASONS,
  type WorldEventImpactReview,
} from "../src/world-impact.js";
import type { WorldEventReflection } from "../src/analysis/world-event-reflection.js";

const TODAY = "2026-06-13";

function reflection(overrides: Partial<WorldEventReflection> = {}): WorldEventReflection {
  return {
    schemaVersion: 1,
    createdAt: "2026-06-12",
    eventId: "2026-06-12_ai-datacenter",
    title: "米国AIデータセンター投資拡大",
    source: "Official",
    url: "https://example.com",
    publishedAt: "2026-06-12",
    totalImpactScore: 80,
    sourceReliability: "official",
    verificationStatus: "confirmed",
    misinformationRisk: "low",
    urgencyScore: 90,
    verificationChecks: ["official release"],
    categories: ["technology"],
    impactedTags: ["AI", "半導体", "電力"],
    hypothesisClusters: ["ai-infra"],
    thesis: "AIデータセンター投資の拡大は電力設備・半導体製造装置の需要増につながる可能性を確認する。",
    chainOfImpact: ["investment → energy/semiconductor demand"],
    possibleBeneficiaries: ["電力設備", "半導体製造装置"],
    possibleRisks: ["株価織り込み済み", "受注確認待ち"],
    similarLessonIds: [],
    similarLessonTitles: [],
    evidenceNeeded: ["受注開示", "設備投資計画"],
    invalidationSignals: ["投資計画の縮小", "受注に反映されない"],
    reviewStatus: "open",
    ...overrides,
  };
}

// ── builder が v2 フィールドを生成する ────────────────────────

{
  const [review] = buildWorldImpactReviews({
    reflections: [reflection()],
    candidates: [{ code: "5803", name: "フジクラ", tags: ["AI", "データセンター", "電力"] }],
    universeCandidates: [],
    generatedCompanyRules: [],
    today: TODAY,
  });
  assert.equal(review.schemaVersion, 2);
  assert.ok(review.mechanisms.includes("semiconductor"), "AI/半導体 → semiconductor を推定");
  assert.ok(review.mechanisms.includes("energy"), "電力 → energy を推定");
  assert.equal(review.direction, "unclear", "方向は検証前なので unclear 起点");
  assert.equal(review.confidence, 0.6, "official ソースの初期 confidence は 0.6");
  assert.equal(review.expectedLagDays, 30);
  assert.ok(review.thesis.length > 0);
  assert.ok(review.falsification.includes("投資計画の縮小"));
  assert.deepEqual(review.watchSignals, ["受注開示", "設備投資計画"]);
  assert.ok(review.riskFactors.includes("株価織り込み済み"));
  assert.equal(review.reviewStatus, "pending");
  assert.equal(review.reviewDueAt, review.outcomes.map(o => o.dueAt).sort().at(-1));
  assert.equal(review.impactPath.companies[0], "5803");
  assert.ok(review.outcomes.every(outcome => outcome.missReason === null));
  console.log("world-impact-v2: builder が検証可能仮説フィールドを生成");
}

// ── mechanism 推定 ───────────────────────────────────────────

{
  assert.deepEqual(inferMechanisms(["まったく関係ない話"]), ["unknown"]);
  assert.deepEqual(inferMechanisms([]), ["unknown"]);
  assert.ok(inferMechanisms(["防衛予算の増額"]).includes("defense"));
  assert.ok(inferMechanisms(["円安が進行"]).includes("fx"));
  console.log("world-impact-v2: mechanism 推定（該当なしは unknown）");
}

// ── normalize: 欠損だらけの v1 レコードでも落ちない ──────────

{
  const minimal = normalizeWorldImpactReview({
    reviewKey: "ev1__9999",
    eventId: "ev1",
    topic: "test",
  }, TODAY);
  assert.equal(minimal.schemaVersion, 2);
  assert.deepEqual(minimal.outcomes, []);
  assert.equal(minimal.confidence, null);
  assert.equal(minimal.direction, "unclear");
  assert.equal(minimal.reviewStatus, "pending");
  assert.deepEqual(minimal.watchSignals, []);
  assert.deepEqual(minimal.riskFactors, []);
  assert.equal(minimal.reviewDueAt, null);
  assert.ok(minimal.mechanisms.length > 0, "mechanisms は最低 unknown が入る");

  const fromNull = normalizeWorldImpactReview(null, TODAY);
  assert.equal(fromNull.reviewKey, "");
  console.log("world-impact-v2: 欠損フィールドでも normalize が落ちない");
}

// ── normalize: 冪等（backfill を2回かけても変わらない） ──────

{
  const v1Record = {
    schemaVersion: 1,
    reviewKey: "ev2__5803",
    eventId: "ev2",
    eventDate: "2026-06-01",
    topic: "海底ケーブル障害",
    source: "Tier1",
    sourceQuality: "tier1",
    namedEntities: [],
    affectedSectors: ["logistics", "telecom"],
    affectedCompanyCodes: ["5803"],
    companyLinks: [{ companyCode: "5803", companyName: "フジクラ", matchedTags: [], linkReason: "確認対象" }],
    expectedMechanism: "ケーブル網の復旧需要を確認する",
    secondOrderEffect: "保守船・通信迂回",
    counterArgument: "影響が軽微なら保留",
    timeLag: "1w",
    expectedHorizon: "1w" as const,
    dataAvailability: "missing" as const,
    outcomes: [
      { horizon: "1w" as const, dueAt: "2026-06-08", result: null, expectedDirection: "unknown" as const, actualDirection: "unknown" as const, dataAvailability: "missing" as const, returnPct: null, topixReturnPct: null, relativeToTopixPct: null, missedSignals: [], lesson: null },
    ],
    missedSignals: [],
    lesson: null,
    createdAt: "2026-06-01",
    updatedAt: "2026-06-01",
  };
  const once = normalizeWorldImpactReview(v1Record, TODAY);
  const twice = normalizeWorldImpactReview(JSON.parse(JSON.stringify(once)), TODAY);
  assert.deepEqual(twice, once, "normalize は冪等");
  assert.equal(once.expectedLagDays, 7, "expectedHorizon 1w → 7日");
  assert.equal(once.thesis, v1Record.expectedMechanism, "thesis は expectedMechanism から補完");
  assert.equal(once.falsification, v1Record.counterArgument, "falsification は counterArgument から補完");
  console.log("world-impact-v2: normalize は冪等・v1 値を保持");
}

// ── reviewStatus: 期限未来なら pending / 期限超過+データ不足なら insufficient_data ──

{
  const future = normalizeWorldImpactReview({
    reviewKey: "ev3__1111",
    outcomes: [
      { horizon: "1m", dueAt: "2026-12-31", result: null, dataAvailability: "ok" },
    ],
  }, TODAY);
  assert.equal(future.reviewStatus, "pending", "reviewDueAt が未来なら pending のまま");

  const dueMissing = normalizeWorldImpactReview({
    reviewKey: "ev4__1111",
    outcomes: [
      { horizon: "1d", dueAt: "2026-01-01", result: null, dataAvailability: "missing" },
    ],
  }, TODAY);
  assert.equal(dueMissing.reviewStatus, "insufficient_data", "期限超過かつ価格データ不足なら insufficient_data");

  const stored = normalizeWorldImpactReview({
    reviewKey: "ev5__1111",
    reviewStatus: "skipped",
    outcomes: [],
  }, TODAY);
  assert.equal(stored.reviewStatus, "skipped", "保存済みの reviewStatus は尊重する");
  console.log("world-impact-v2: reviewStatus の判定");
}

// ── outcome.result は定義済みの範囲に収まる ──────────────────

{
  const review = normalizeWorldImpactReview({
    reviewKey: "ev6__1111",
    outcomes: [
      { horizon: "1d", dueAt: "2026-06-01", result: "inverse", dataAvailability: "ok" },
      { horizon: "1w", dueAt: "2026-06-08", result: "insufficient_data", dataAvailability: "missing" },
      { horizon: "1m", dueAt: "2026-07-01", result: "絶対勝てる", dataAvailability: "ok" },
    ],
  }, TODAY);
  assert.equal(review.outcomes[0].result, "inverse");
  assert.equal(review.outcomes[1].result, "insufficient_data");
  assert.equal(review.outcomes[2].result, null, "未定義の result は null に落とす");
  const allowed = new Set(["hit", "miss", "inverse", "too_early", "unclear", "insufficient_data", "unknown"]);
  for (const outcome of review.outcomes) {
    assert.ok(outcome.result === null || allowed.has(outcome.result));
  }
  console.log("world-impact-v2: outcome.result の範囲を強制");
}

// ── missReason は定義済みの範囲のみ ──────────────────────────

{
  const review = normalizeWorldImpactReview({
    reviewKey: "ev7__1111",
    outcomes: [
      { horizon: "1d", dueAt: "2026-06-01", result: "miss", dataAvailability: "ok", missReason: "already_priced_in" },
      { horizon: "1w", dueAt: "2026-06-08", result: "miss", dataAvailability: "ok", missReason: "でたらめ" },
    ],
  }, TODAY);
  assert.equal(review.outcomes[0].missReason, "already_priced_in");
  assert.equal(review.outcomes[1].missReason, null, "未定義の missReason は null");
  assert.ok(WORLD_IMPACT_MISS_REASONS.includes("weak_linkage"));
  console.log("world-impact-v2: missReason の範囲を強制");
}

// ── audit v2: mechanism unknown / falsification 未設定 / confidence 未設定 ──

{
  const review = normalizeWorldImpactReview({
    reviewKey: "ev8__1111",
    eventId: "ev8",
    topic: "未知の話題xyzabc",
    outcomes: [],
  }, TODAY);
  assert.deepEqual(review.mechanisms, ["unknown"]);
  const audit = buildWorldImpactAudit([review], TODAY);
  assert.equal(audit.mechanismUnknown, 1, "mechanism unknown が audit に出る");
  assert.equal(audit.falsificationMissing, 1, "falsification 未設定が audit に出る");
  assert.equal(audit.confidenceMissing, 1);
  assert.ok(audit.priorityIssues.some(issue => issue.category === "mechanism_unknown" && issue.severity === "attention"));
  assert.ok(audit.priorityIssues.some(issue => issue.category === "falsification" && issue.severity === "attention"));
  assert.equal(audit.healthStatus, "needs_attention");
  console.log("world-impact-v2: audit が unknown mechanism / falsification 未設定を検出");
}

// ── audit v2: JSONL 破損・latest 不一致 ──────────────────────

{
  const review = normalizeWorldImpactReview({ reviewKey: "ev9__1111", topic: "為替の話", falsification: "前提が崩れたら外れ", confidence: 0.5 }, TODAY);
  const audit = buildWorldImpactAudit([review], TODAY, {
    jsonlParseErrors: 2,
    jsonlKeys: ["ev9__1111", "lost__2222"],
  });
  assert.equal(audit.jsonlParseErrors, 2);
  assert.equal(audit.latestMismatch, 1, "JSONL にあるのに latest に無いものだけ数える");
  assert.ok(audit.priorityIssues.some(issue => issue.category === "jsonl" && issue.severity === "urgent"));
  assert.equal(audit.healthStatus, "action_required");
  console.log("world-impact-v2: JSONL 破損と latest 不一致を検出");
}

// ── audit: insufficient_data 件数 ────────────────────────────

{
  const review = normalizeWorldImpactReview({
    reviewKey: "ev10__1111",
    topic: "金利の話",
    confidence: 0.4,
    falsification: "前提が崩れたら外れ",
    outcomes: [
      { horizon: "1d", dueAt: "2026-01-02", result: "insufficient_data", dataAvailability: "missing" },
    ],
  }, TODAY);
  const audit = buildWorldImpactAudit([review], TODAY);
  assert.ok(audit.insufficientData >= 1);
  assert.equal(audit.outcomeResultCounts["insufficient_data"], 1);
  console.log("world-impact-v2: insufficient_data を集計");
}

// ── calibration: confidence帯 / mechanism / lag 別 ──────────

{
  const base = normalizeWorldImpactReview({
    reviewKey: "ev11__1111",
    topic: "半導体補助金の規制変更",
    confidence: 0.7,
    falsification: "補助金が出なければ外れ",
    mechanisms: ["semiconductor", "regulation"],
    outcomes: [
      { horizon: "1d", dueAt: "2026-06-01", result: "hit", expectedDirection: "up", actualDirection: "up", dataAvailability: "ok" },
      { horizon: "1w", dueAt: "2026-06-08", result: "miss", expectedDirection: "up", actualDirection: "down", dataAvailability: "ok" },
      { horizon: "1m", dueAt: "2026-07-01", result: "inverse", expectedDirection: "up", actualDirection: "down", dataAvailability: "ok" },
    ],
  }, TODAY);
  const calibration = buildWorldImpactCalibration([base], TODAY);
  assert.equal(calibration.evaluatedOutcomes, 3);
  const high = calibration.rows.find(row => row.groupType === "confidence" && row.groupKey.startsWith("high"));
  assert.ok(high);
  assert.equal(high.hit, 1);
  assert.equal(high.miss, 1);
  assert.equal(high.inverse, 1);
  assert.equal(high.sampleTooSmall, true, "5件未満はサンプル不足");
  const semi = calibration.rows.find(row => row.groupType === "mechanism" && row.groupKey === "semiconductor");
  assert.ok(semi && semi.total === 3);
  const lag1d = calibration.rows.find(row => row.groupType === "lag" && row.groupKey === "1d");
  assert.ok(lag1d && lag1d.hit === 1);
  console.log("world-impact-v2: calibration の集計");
}

// ── mechanisms 定数の整合 ────────────────────────────────────

{
  assert.ok(WORLD_IMPACT_MECHANISMS.includes("unknown"));
  assert.equal(new Set(WORLD_IMPACT_MECHANISMS).size, WORLD_IMPACT_MECHANISMS.length);
  console.log("world-impact-v2: mechanism 定数の重複なし");
}

console.log("world-impact-v2: 全テスト成功");
