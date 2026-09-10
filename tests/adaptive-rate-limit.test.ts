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
  initialRateLimitState,
  onRequestSucceeded,
  onRequestThrottled,
  waitMsBefore,
  type AdaptiveRateLimitConfig,
} from "../src/fetcher/adaptive-rate-limit.js";

const CONFIG: AdaptiveRateLimitConfig = {
  baseIntervalMs: 1_000,
  maxIntervalMs: 60_000,
  throttleCooldownMs: 30_000,
  decayAfterSuccesses: 3,
  backoffMultiplier: 3,
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
  assert.equal(state.currentIntervalMs, 3_000);
  // 3回連続成功で1段階戻る
  state = onRequestSucceeded(state, 0, CONFIG);
  state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, 3_000, "途中では戻さない");
  state = onRequestSucceeded(state, 0, CONFIG);
  assert.equal(state.currentIntervalMs, 1_000, "連続成功で戻る");
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
