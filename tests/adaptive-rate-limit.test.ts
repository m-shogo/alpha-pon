// 適応型レート制限のテスト。
//
// 相手（J-Quants Free）の実測:
//   間隔を空けても4〜5回で 429。レートではなくバースト枠。
//   一度 429 になると 60秒台まで回復しない。Retry-After ヘッダは返らない。
//
// 守りたい性質:
//   1. 429 を観測したら短い間隔で叩き直さない（枠を削るだけ）
//   2. 連続 429 でクールダウンを伸ばす
//   3. 成功が続いたら間隔を戻す（永久に遅くしない）
//   4. 所要時間を事前に見積もれる

import assert from "node:assert/strict";
import {
  DEFAULT_ADAPTIVE_RATE_LIMIT,
  estimateDurationMs,
  MEASURED_DATE_QUERY_INTERVAL_MS,
  initialRateLimitState,
  onRequestSucceeded,
  onRequestThrottled,
  waitMsBefore,
  type AdaptiveRateLimitConfig,
  type AdaptiveRateLimitState,
} from "../src/fetcher/adaptive-rate-limit.js";

const CONFIG: AdaptiveRateLimitConfig = {
  baseIntervalMs: 1_000,
  maxIntervalMs: 60_000,
  throttleCooldownMs: 30_000,
  decayAfterSuccesses: 3,
  backoffMultiplier: 3,
  decayDivisor: 2,
};

function testFirstRequestIsImmediate() {
  const state = initialRateLimitState(CONFIG);
  assert.equal(waitMsBefore(state, 1_000_000), 0, "初回は待たない");
}

function testSuccessSpacesByBaseInterval() {
  const after = onRequestSucceeded(initialRateLimitState(CONFIG), 1_000_000, CONFIG);
  assert.equal(waitMsBefore(after, 1_000_000), 1_000);
  assert.equal(waitMsBefore(after, 1_000_500), 500, "時間が経った分だけ減る");
  assert.equal(waitMsBefore(after, 1_002_000), 0);
}

function testThrottleTriggersLongCooldown() {
  const throttled = onRequestThrottled(initialRateLimitState(CONFIG), 1_000_000, CONFIG);
  assert.equal(
    waitMsBefore(throttled, 1_000_000),
    30_000,
    "枠が尽きているので短い間隔で叩き直さない",
  );
  assert.equal(throttled.currentIntervalMs, 3_000, "通常間隔も広げる");
  assert.equal(throttled.totalThrottles, 1);
}

function testConsecutiveThrottlesExtendCooldown() {
  let state = initialRateLimitState(CONFIG);
  state = onRequestThrottled(state, 0, CONFIG);
  assert.equal(waitMsBefore(state, 0), 30_000);
  state = onRequestThrottled(state, 0, CONFIG);
  assert.equal(waitMsBefore(state, 0), 60_000, "2回目はさらに待つ");
  state = onRequestThrottled(state, 0, CONFIG);
  assert.equal(waitMsBefore(state, 0), 90_000);
  assert.equal(state.consecutiveThrottles, 3);
}

function testIntervalIsCappedAtMax() {
  let state = initialRateLimitState(CONFIG);
  for (let i = 0; i < 20; i += 1) state = onRequestThrottled(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, CONFIG.maxIntervalMs, "無限に広げない");
}

function testRetryAfterIsHonouredWhenLonger() {
  const state = onRequestThrottled(initialRateLimitState(CONFIG), 0, CONFIG, 120_000);
  assert.equal(waitMsBefore(state, 0), 120_000, "相手が指定した待ち時間を尊重する");
}

function testRetryAfterShorterThanCooldownDoesNotShortenIt() {
  const state = onRequestThrottled(initialRateLimitState(CONFIG), 0, CONFIG, 1_000);
  assert.equal(
    waitMsBefore(state, 0),
    30_000,
    "相手が短く言ってきても、実測の回復時間より短くしない",
  );
}

function testSuccessesDecayTheInterval() {
  let state = onRequestThrottled(initialRateLimitState(CONFIG), 0, CONFIG);
  assert.equal(state.currentIntervalMs, 3_000, "429 で ×3（backoffMultiplier）");

  state = onRequestSucceeded(state, 0, CONFIG);
  state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, 3_000, "閾値に達するまでは戻さない");

  // 閾値（3回）に達したので ÷2（decayDivisor）。上げより小刻みに戻す。
  state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, 1_500);

  // 閾値到達後は成功のたびに戻す。ここでカウンタを戻すと、スロットルの
  // 周期が閾値より短い相手に対して二度と減衰しなくなる（実際に踏んだ欠陥）。
  state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, 1_000, "base で止まる");
  assert.equal(state.consecutiveSuccesses, 4, "閾値到達後もカウンタは進み続ける");
}

function testDecayNeverGoesBelowBase() {
  let state = initialRateLimitState(CONFIG);
  for (let i = 0; i < 20; i += 1) state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, CONFIG.baseIntervalMs, "基準より速くしない");
}

function testSuccessResetsThrottleStreak() {
  let state = onRequestThrottled(initialRateLimitState(CONFIG), 0, CONFIG);
  assert.equal(state.consecutiveThrottles, 1);
  state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.consecutiveThrottles, 0);
  assert.equal(state.totalThrottles, 1, "累計は残す");
}

function testDurationEstimate() {
  const state = initialRateLimitState(DEFAULT_ADAPTIVE_RATE_LIMIT);
  // 500銘柄 / 3秒間隔 / 5件ごとに90秒のクールダウン
  const ms = estimateDurationMs(500, state, DEFAULT_ADAPTIVE_RATE_LIMIT, 5);
  const minutes = ms / 60_000;
  assert.ok(minutes > 100 && minutes < 200, `見積もりが妥当な範囲でない: ${minutes.toFixed(0)}分`);
  assert.equal(estimateDurationMs(0, state, DEFAULT_ADAPTIVE_RATE_LIMIT), 0);
}

function testInvalidConfigFailsClosed() {
  for (const [over, pattern] of [
    [{ baseIntervalMs: 0 }, /baseIntervalMs/],
    [{ maxIntervalMs: 100 }, /maxIntervalMs must be at least/],
    [{ throttleCooldownMs: -1 }, /throttleCooldownMs/],
    [{ decayAfterSuccesses: 0 }, /decayAfterSuccesses/],
    [{ backoffMultiplier: 1 }, /backoffMultiplier/],
  ] as const) {
    assert.throws(
      () => initialRateLimitState({ ...CONFIG, ...over } as AdaptiveRateLimitConfig),
      pattern,
    );
  }
  assert.throws(
    () => estimateDurationMs(-1, initialRateLimitState(CONFIG), CONFIG),
    /requestCount/,
  );
}

testFirstRequestIsImmediate();
testSuccessSpacesByBaseInterval();
testThrottleTriggersLongCooldown();
testConsecutiveThrottlesExtendCooldown();
testIntervalIsCappedAtMax();
testRetryAfterIsHonouredWhenLonger();
testRetryAfterShorterThanCooldownDoesNotShortenIt();
testSuccessesDecayTheInterval();
testDecayNeverGoesBelowBase();
testSuccessResetsThrottleStreak();
testDurationEstimate();
testInvalidConfigFailsClosed();

console.log("adaptive-rate-limit: 全テスト成功");

// ── 実運用で踏んだ欠陥（2026-09-11）─────────────────────────
// 全銘柄日足の取り込みで、間隔が 11秒 → 80〜120秒 へ単調に広がり、
// 上限に張り付いた。523営業日で16時間コースになる。
//
// 原因: 「5回連続成功」でしか減衰しない。4回に1回スロットルされる相手だと
// 連続成功が4で頭打ちになり、減衰条件を一度も満たさない。
// 上げは ×3、下げは発生しない → 単調増加。
//
// 実測した相手の性質（date クエリ、1リクエスト4,400銘柄）:
//   間隔 20s : 10/10 成功
//   間隔 12s : 11回目で429
//   間隔  8s : 7回目で429
//   → 容量4〜5・補充およそ1件/20秒 のトークンバケットと整合する。

function simulate(input: {
  config: AdaptiveRateLimitConfig;
  requests: number;
  /** この回数に1回スロットルされる相手。 */
  throttleEvery: number;
}): AdaptiveRateLimitState {
  let state = initialRateLimitState(input.config);
  let now = 0;
  for (let i = 0; i < input.requests; i += 1) {
    now += waitMsBefore(state, now);
    state = (i + 1) % input.throttleEvery === 0
      ? onRequestThrottled(state, now, input.config)
      : onRequestSucceeded(state, now, input.config);
  }
  return state;
}

// **出荷する既定値そのもの**で検証する。テスト専用の config で通しても、
// 本番が使う値が壊れていたら意味がない（実際それで見落とした）。
const SHIPPED = DEFAULT_ADAPTIVE_RATE_LIMIT;

function testIntervalDoesNotDriftToTheCap(): void {
  // 5回に1回スロットルされ続けても、間隔が上限に張り付かないこと。
  // 4回に1回でも同じ（連続成功が decayAfterSuccesses に届かない領域）。
  for (const throttleEvery of [4, 5, 6]) {
    const state = simulate({ config: SHIPPED, requests: 300, throttleEvery });
    assert.ok(
      state.currentIntervalMs < SHIPPED.maxIntervalMs,
      `throttleEvery=${throttleEvery} で上限に張り付いた: ${state.currentIntervalMs}ms`,
    );
  }
}

function testIntervalConvergesNearTheBase(): void {
  // 収束先が base の数倍に収まること。3倍ずつ上げて滅多に下げない設計だと
  // 平均が実際の限界より遥かに遅くなる（実測 11秒 → 80〜120秒）。
  const state = simulate({ config: SHIPPED, requests: 300, throttleEvery: 5 });
  assert.ok(
    state.currentIntervalMs <= SHIPPED.baseIntervalMs * 4,
    `収束先が base から離れすぎ: ${state.currentIntervalMs}ms（base ${SHIPPED.baseIntervalMs}ms）`,
  );
}

function testIntervalStillRisesWhenTheLimitIsReallyLower(): void {
  // 逆方向。毎回スロットルされる（base が短すぎる）なら、ちゃんと広げること。
  const state = simulate({ config: SHIPPED, requests: 20, throttleEvery: 1 });
  assert.ok(
    state.currentIntervalMs > SHIPPED.baseIntervalMs,
    "全部弾かれているのに間隔を広げないのは適応していない",
  );
}

function testDecayDivisorMustStayBelowBackoff(): void {
  // 下げ幅が上げ幅以上だと、相手の限界が base より遅いときに間隔を
  // 広げきれず、永久に 429 を食い続ける。設定として拒否する。
  assert.throws(
    () => initialRateLimitState({ ...SHIPPED, decayDivisor: SHIPPED.backoffMultiplier }),
    /must be below backoffMultiplier/,
  );
  assert.throws(
    () => initialRateLimitState({ ...SHIPPED, decayDivisor: 5 }),
    /must be below backoffMultiplier/,
  );
  assert.throws(
    () => initialRateLimitState({ ...SHIPPED, decayDivisor: 1 }),
    /decayDivisor must be greater than 1/,
  );
}

function testMeasuredDateQueryIntervalMatchesTheMeasurement(): void {
  // 実測値。推測で書き換えないための固定。
  //   20s : 10/10 成功 / 12s : 11回目で429 / 8s : 7回目で429
  // 12秒側が落ちている以上、既定の3秒はこの用途には短すぎる。
  assert.equal(MEASURED_DATE_QUERY_INTERVAL_MS, 20_000);
  assert.ok(
    MEASURED_DATE_QUERY_INTERVAL_MS > DEFAULT_ADAPTIVE_RATE_LIMIT.baseIntervalMs,
    "全銘柄クエリは銘柄指定より重い。既定値をそのまま使ってはいけない",
  );
}

testDecayDivisorMustStayBelowBackoff();
testMeasuredDateQueryIntervalMatchesTheMeasurement();
testIntervalDoesNotDriftToTheCap();
testIntervalConvergesNearTheBase();
testIntervalStillRisesWhenTheLimitIsReallyLower();

console.log("adaptive-rate-limit: 収束テストも成功");
