// World Impact Intelligence v3 のテスト
// 自動評価 / autoMissReason / manual 保護 / calibration v3 / audit v3 / null 安全

import assert from "node:assert/strict";
import {
  buildWorldImpactAudit,
  buildWorldImpactCalibration,
  countRawViolations,
  deriveReviewStatus,
  evaluateWorldImpactOutcome,
  isEvaluableOutcome,
  normalizeWorldImpactReview,
  WORLD_IMPACT_AUTO_MISS_REASONS,
  type WorldEventImpactReview,
  type WorldEventImpactOutcome,
  type WorldImpactQuote,
} from "../src/world-impact.js";

const ASOF = "2026-06-20";

function review(overrides: Record<string, unknown> = {}): WorldEventImpactReview {
  return normalizeWorldImpactReview({
    reviewKey: "ev__7203",
    eventId: "ev",
    eventDate: "2026-06-01",
    topic: "サプライチェーン正常化の観察",
    affectedCompanyCodes: ["7203"],
    direction: "positive",
    confidence: 0.6,
    falsification: "受注に反映されなければ外れ",
    mechanisms: ["supply"],
    outcomes: [
      { horizon: "1w", dueAt: "2026-06-08", result: null, dataAvailability: "priceDataPending" },
    ],
    ...overrides,
  }, ASOF);
}

function quotes(points: Array<[string, number]>): WorldImpactQuote[] {
  return points.map(([date, close]) => ({ date, close }));
}

const FLAT_BENCH = quotes([["2026-06-01", 100], ["2026-06-08", 100.2]]);

function evaluate(r: WorldEventImpactReview, stock: WorldImpactQuote[], bench: WorldImpactQuote[] = FLAT_BENCH): WorldEventImpactOutcome {
  return evaluateWorldImpactOutcome({
    review: r,
    outcome: r.outcomes[0],
    quotes: stock,
    benchmarkQuotes: bench,
    benchmarkCode: "1306",
    asOf: ASOF,
  });
}

// ── hit 判定と relativeReturnPct の計算 ──────────────────────

{
  const result = evaluate(review(), quotes([["2026-06-01", 100], ["2026-06-04", 102], ["2026-06-08", 105]]));
  assert.equal(result.result, "hit", "positive 想定で +5% は hit");
  assert.equal(result.priceReturnPct, 5);
  assert.equal(result.benchmarkReturnPct! > 0 && result.benchmarkReturnPct! < 0.3, true);
  assert.ok(Math.abs(result.relativeReturnPct! - (5 - result.benchmarkReturnPct!)) < 1e-9, "relative = 銘柄 - ベンチマーク");
  assert.equal(result.directionMatched, true);
  assert.equal(result.actualDirection, "up");
  assert.equal(result.expectedDirection, "up", "review.direction=positive から補完");
  assert.equal(result.evaluatedAt, ASOF);
  assert.equal(result.dataAvailability, "ok");
  assert.equal(result.confidenceAtPrediction, 0.6);
  assert.deepEqual(result.mechanismAtPrediction, ["supply"]);
  assert.ok(result.evidence.length > 0);
  console.log("world-impact-v3: hit 判定と relativeReturnPct");
}

// ── inverse 判定（方向が逆） ─────────────────────────────────

{
  const result = evaluate(review(), quotes([["2026-06-01", 100], ["2026-06-08", 95]]));
  assert.equal(result.result, "inverse", "positive 想定で -5% は inverse");
  assert.equal(result.directionMatched, false);
  assert.equal(result.autoMissReason, "wrong_direction", "ベンチマーク横ばいなら wrong_direction");
  console.log("world-impact-v3: inverse 判定（wrong_direction）");
}

// ── inverse + 地合い連動（macro_overpowered） ────────────────

{
  const bench = quotes([["2026-06-01", 100], ["2026-06-08", 94]]);
  const result = evaluate(review(), quotes([["2026-06-01", 100], ["2026-06-08", 95]]), bench);
  assert.equal(result.result, "inverse");
  assert.equal(result.autoMissReason, "macro_overpowered", "ベンチマークも同方向に下落なら地合い連動と推定");
  console.log("world-impact-v3: inverse 判定（macro_overpowered）");
}

// ── low_magnitude は unclear（miss にしない） ────────────────

{
  const result = evaluate(review(), quotes([["2026-06-01", 100], ["2026-06-08", 100.5]]));
  assert.equal(result.result, "unclear", "閾値未満の値動きは unclear");
  assert.equal(result.autoMissReason, "low_magnitude");
  console.log("world-impact-v3: low_magnitude は unclear に逃がす");
}

// ── 想定方向 unknown は unclear（hit にしない） ──────────────

{
  const r = review({ direction: "unclear" });
  const result = evaluate(r, quotes([["2026-06-01", 100], ["2026-06-08", 110]]));
  assert.equal(result.result, "unclear", "想定方向なしでは hit にしない");
  assert.equal(result.autoMissReason, "unclear");
  console.log("world-impact-v3: 想定方向なしは unclear");
}

// ── データ不足は insufficient_data（miss にしない） ──────────

{
  const result = evaluate(review(), []);
  assert.equal(result.result, "insufficient_data");
  assert.notEqual(result.result, "miss");
  assert.equal(result.autoMissReason, "insufficient_data");
  assert.equal(result.priceReturnPct, null);
  console.log("world-impact-v3: データ不足は insufficient_data");
}

// ── lagMatched 判定 ──────────────────────────────────────────

{
  // 2日目に +2% → actualLagDays=3日（6/1→6/4）、expected 7日以内 → 一致
  const fast = evaluate(review(), quotes([["2026-06-01", 100], ["2026-06-04", 102], ["2026-06-08", 105]]));
  assert.equal(fast.actualLagDays, 3);
  assert.equal(fast.lagMatched, true);
  // 期日ぎりぎりまで動かない → actualLagDays=7（6/8 で初めて閾値超え）
  const slow = evaluate(review(), quotes([["2026-06-01", 100], ["2026-06-04", 100.1], ["2026-06-08", 103]]));
  assert.equal(slow.actualLagDays, 7);
  assert.equal(slow.lagMatched, true, "expectedLagDays=7 ちょうどは一致");
  console.log("world-impact-v3: lagMatched の判定");
}

// ── 二重評価しない / 既存値を上書きしない ────────────────────

{
  const r = review();
  const first = evaluate(r, quotes([["2026-06-01", 100], ["2026-06-08", 105]]));
  assert.equal(first.result, "hit");
  // 評価済み outcome を再評価しても変わらない（横ばいデータを渡しても）
  const second = evaluateWorldImpactOutcome({
    review: r,
    outcome: first,
    quotes: quotes([["2026-06-01", 100], ["2026-06-08", 90]]),
    benchmarkQuotes: FLAT_BENCH,
    benchmarkCode: "1306",
    asOf: ASOF,
  });
  assert.deepEqual(second, first, "評価済みは再評価しない（冪等）");
  assert.equal(isEvaluableOutcome(first, ASOF), false);
  console.log("world-impact-v3: 評価の冪等性（二重評価なし）");
}

// ── manualMissReason を自動評価が上書きしない ────────────────

{
  const r = review();
  r.outcomes[0].manualMissReason = "weak_linkage";
  const result = evaluate(r, quotes([["2026-06-01", 100], ["2026-06-08", 95]]));
  assert.equal(result.manualMissReason, "weak_linkage", "manual は保持");
  assert.equal(result.autoMissReason, "wrong_direction", "auto は別フィールドに記録");
  console.log("world-impact-v3: manualMissReason を上書きしない");
}

// ── 期日未到来は評価しない ───────────────────────────────────

{
  const r = review({ outcomes: [{ horizon: "1m", dueAt: "2026-12-31", result: null, dataAvailability: "ok" }] });
  const result = evaluate(r, quotes([["2026-06-01", 100], ["2026-06-08", 110]]));
  assert.equal(result.result, null, "期日未到来は評価対象外");
  assert.equal(result.evaluatedAt, null);
  console.log("world-impact-v3: 期日未到来は評価しない");
}

// ── normalize: v3 フィールドの既存値を保持・互換 missReason 引き継ぎ ──

{
  const raw = {
    reviewKey: "ev2__1111",
    outcomes: [{
      horizon: "1d", dueAt: "2026-06-02", result: "miss", dataAvailability: "ok",
      missReason: "already_priced_in",
      priceReturnPct: 1.23, evaluatedAt: "2026-06-10",
    }],
  };
  const normalized = normalizeWorldImpactReview(raw, ASOF);
  const outcome = normalized.outcomes[0];
  assert.equal(outcome.manualMissReason, "already_priced_in", "旧 missReason を manualMissReason に引き継ぐ");
  assert.equal(outcome.missReason, "already_priced_in", "互換フィールドは保持");
  assert.equal(outcome.priceReturnPct, 1.23);
  assert.equal(outcome.evaluatedAt, "2026-06-10");
  const twice = normalizeWorldImpactReview(JSON.parse(JSON.stringify(normalized)), ASOF);
  assert.deepEqual(twice, normalized, "v3 フィールド込みでも normalize は冪等");
  console.log("world-impact-v3: normalize の互換と冪等");
}

// ── deriveReviewStatus: insufficient_data 集約 ───────────────

{
  const r = normalizeWorldImpactReview({
    reviewKey: "ev3__1111",
    outcomes: [
      { horizon: "1d", dueAt: "2026-06-02", result: "insufficient_data", dataAvailability: "missing" },
      { horizon: "1w", dueAt: "2026-06-08", result: "insufficient_data", dataAvailability: "missing" },
    ],
  }, ASOF);
  assert.equal(deriveReviewStatus(r.outcomes, ASOF), "insufficient_data", "全件データ不足なら insufficient_data");
  const mixed = normalizeWorldImpactReview({
    reviewKey: "ev4__1111",
    outcomes: [
      { horizon: "1d", dueAt: "2026-06-02", result: "hit", dataAvailability: "ok" },
      { horizon: "1w", dueAt: "2026-06-08", result: "insufficient_data", dataAvailability: "missing" },
    ],
  }, ASOF);
  assert.equal(deriveReviewStatus(mixed.outcomes, ASOF), "reviewed", "一部でも判定があれば reviewed");
  console.log("world-impact-v3: reviewStatus の insufficient_data 集約");
}

// ── audit v3: 期限切れ未評価（outcome なし）/ 不整合 ─────────

{
  const due = normalizeWorldImpactReview({
    reviewKey: "ev5__1111",
    topic: "test",
    reviewDueAt: "2026-06-01",
    confidence: 0.5,
    falsification: "x",
    mechanisms: ["supply"],
    outcomes: [],
  }, ASOF);
  const audit = buildWorldImpactAudit([due], ASOF);
  assert.equal(audit.dueWithoutOutcome, 1, "期限超過なのに outcome なしを検出");
  assert.ok(audit.priorityIssues.some(issue => issue.category === "due_without_outcome"));

  const inconsistent = normalizeWorldImpactReview({
    reviewKey: "ev6__1111",
    topic: "test",
    confidence: 0.5,
    falsification: "x",
    mechanisms: ["supply"],
    outcomes: [
      { horizon: "1d", dueAt: "2026-06-02", result: "insufficient_data", dataAvailability: "missing", priceReturnPct: 3.0 },
      { horizon: "1w", dueAt: "2026-06-08", result: "hit", dataAvailability: "ok", expectedDirection: "up", actualDirection: "up" },
    ],
  }, ASOF);
  const audit2 = buildWorldImpactAudit([inconsistent], ASOF);
  assert.equal(audit2.insufficientDataWithReturn, 1, "insufficient_data なのに return 有を検出");
  assert.equal(audit2.judgedWithoutReturn, 1, "hit なのに return 欠損を検出");
  assert.equal(audit2.evaluatedAtMissing, 1, "判定済みなのに evaluatedAt 欠損を検出");
  console.log("world-impact-v3: audit の期限切れ・不整合検出");
}

// ── audit v3: enum 外・confidence 範囲外（raw 検査） ─────────

{
  const rawRecords = [
    {
      confidence: 1.5,
      direction: "絶対上",
      outcomes: [
        { result: "勝利", expectedDirection: "up", actualDirection: "斜め", autoMissReason: "運が悪い" },
      ],
    },
  ];
  const violations = countRawViolations(rawRecords);
  assert.equal(violations.confidenceOutOfRange, 1);
  assert.equal(violations.resultEnumViolations, 1);
  assert.equal(violations.directionEnumViolations, 2, "direction(review) + actualDirection(outcome)");
  assert.equal(violations.autoMissReasonViolations, 1);
  const audit = buildWorldImpactAudit([], ASOF, { rawRecords });
  assert.ok(audit.priorityIssues.some(issue => issue.category === "enum_violation"));
  assert.ok(audit.priorityIssues.some(issue => issue.category === "confidence_range"));
  console.log("world-impact-v3: enum 外と confidence 範囲外の検出");
}

// ── calibration v3: 帯別成績・ケース一覧・missReason 集計 ────

{
  const hit = review();
  hit.outcomes[0] = evaluate(hit, quotes([["2026-06-01", 100], ["2026-06-08", 105]]));
  const missReview = review({ reviewKey: "ev7__7203", confidence: 0.6 });
  missReview.outcomes[0] = evaluate(missReview, quotes([["2026-06-01", 100], ["2026-06-08", 95]]));
  const lowConfHit = review({ reviewKey: "ev8__7203", confidence: 0.3 });
  lowConfHit.outcomes[0] = evaluate(lowConfHit, quotes([["2026-06-01", 100], ["2026-06-08", 105]]));

  const calibration = buildWorldImpactCalibration([hit, missReview, lowConfHit], ASOF);
  const mid = calibration.rows.find(row => row.groupType === "confidence" && row.groupKey.startsWith("mid"));
  assert.ok(mid && mid.hit === 1 && mid.inverse === 1, "confidence帯別に hit/inverse を集計");
  const supply = calibration.rows.find(row => row.groupType === "mechanism" && row.groupKey === "supply");
  assert.ok(supply && supply.evaluated === 3, "mechanism 別集計");
  assert.ok(calibration.rows.some(row => row.groupType === "direction"));
  assert.ok(calibration.rows.some(row => row.groupType === "source"));
  assert.ok(calibration.rows.some(row => row.groupType === "code" && row.groupKey === "7203"));
  assert.equal(calibration.highConfidenceMisses.length, 1, "高 confidence の外れを一覧化");
  assert.equal(calibration.lowConfidenceHits.length, 1, "低 confidence の整合を一覧化");
  assert.equal(calibration.autoMissReasonCounts["wrong_direction"], 1);
  assert.ok(calibration.suggestions.weaken.length > 0);
  console.log("world-impact-v3: calibration v3 の集計");
}

// ── enum 定数の健全性 ────────────────────────────────────────

{
  assert.ok(WORLD_IMPACT_AUTO_MISS_REASONS.includes("insufficient_data"));
  assert.ok(WORLD_IMPACT_AUTO_MISS_REASONS.includes("low_magnitude"));
  assert.equal(new Set(WORLD_IMPACT_AUTO_MISS_REASONS).size, WORLD_IMPACT_AUTO_MISS_REASONS.length);
  console.log("world-impact-v3: autoMissReason 定数の重複なし");
}

console.log("world-impact-v3: 全テスト成功");
