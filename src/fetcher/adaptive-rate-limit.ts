// 適応型レート制限。
//
// 目的:
//   相手の制限が「1秒あたり何回」ではなく **バースト枠** のとき、
//   固定間隔では必ず溢れる。実際に弾かれた事実から間隔を学習する。
//
// 実測（2026-09-11 / J-Quants Free）:
//   間隔 10s : [200,200,200,200,200,429]
//   間隔  5s : [200,200,200,200,429,429]
//   間隔  3s : [200,200,200,200,429,429]
//   → 間隔を空けても4〜5回で枯渇する。レートではなくバースト枠。
//   → 一度 429 になると 10/20/30 秒待っても解除されず、60秒台で回復。
//   → **Retry-After ヘッダは返らない。** 自分で保守的に決めるしかない。
//
// 従来実装の問題:
//   3秒固定間隔 + 429 時に attempt × 10 秒の線形バックオフ（最大5回）。
//   枠が尽きた状態で叩き続けるため、1リクエストあたり最悪100秒かかり、
//   31銘柄の daily が実質完走できなかった。
//
// 方針:
//   - 429 を観測したら **長いクールダウン** を置き、通常間隔も広げる
//   - 成功が続いたら間隔を戻す（永久に遅くしない）
//   - 状態は呼び出し側が持つ。時刻も注入する（テスト可能にするため）

export interface AdaptiveRateLimitConfig {
  /** 通常時の最小間隔。 */
  baseIntervalMs: number;
  /** 広げるときの上限。 */
  maxIntervalMs: number;
  /** 429 を観測した直後に待つ時間。実測の回復時間より長めに取る。 */
  throttleCooldownMs: number;
  /** 連続成功がこの回数に達したら間隔を戻し始める。 */
  decayAfterSuccesses: number;
  /** 429 を観測したとき間隔を広げる倍率。 */
  backoffMultiplier: number;
  /**
   * 成功1回ごとに間隔を割る値。`backoffMultiplier` より小さくする。
   *
   * 上げと下げを同じ倍率にすると、スロットル頻度が
   * 1/(decayAfterSuccesses+1) を超えた瞬間に単調増加へ転じる。
   * 下げを小刻みにして「成功が続くほど戻る」形にすると、
   * 相手の本当の限界の近くで釣り合う。
   */
  decayDivisor: number;
}

export const DEFAULT_ADAPTIVE_RATE_LIMIT: AdaptiveRateLimitConfig = {
  baseIntervalMs: 3_000,
  maxIntervalMs: 120_000,
  // 実測で60秒台の回復だったので、余裕を見て90秒。
  throttleCooldownMs: 90_000,
  // 2026-09-11 の実運用で、5 と ×3 の組合せが上限へ張り付く欠陥を踏んだ。
  // スロットルが5回に1回入ると連続成功が4で頭打ちになり、減衰条件を
  // 一度も満たさないまま ×3 だけが効いていた（11秒 → 80〜120秒）。
  decayAfterSuccesses: 2,
  backoffMultiplier: 1.5,
  decayDivisor: 1.2,
};

/**
 * 全銘柄日足（`?date=`、1リクエスト約4,400銘柄）で実測した持続可能な間隔。
 *
 *   20s : 10/10 成功
 *   12s : 11回目で429
 *    8s : 7回目で429
 *
 * 容量4〜5・補充およそ1件/20秒 のトークンバケットと整合する。
 * 銘柄指定（1リクエスト数十行）はこれより短くて済むので、既定値とは分ける。
 */
export const MEASURED_DATE_QUERY_INTERVAL_MS = 20_000;

export interface AdaptiveRateLimitState {
  /** 次に許可される最短時刻（epoch ms）。 */
  nextAllowedAtMs: number;
  /** 現在の通常間隔。 */
  currentIntervalMs: number;
  /** 連続成功数。 */
  consecutiveSuccesses: number;
  /** 連続 429 数。 */
  consecutiveThrottles: number;
  /** 累計 429 数。可視化用。 */
  totalThrottles: number;
}

export function initialRateLimitState(
  config: AdaptiveRateLimitConfig = DEFAULT_ADAPTIVE_RATE_LIMIT,
): AdaptiveRateLimitState {
  assertConfig(config);
  return {
    nextAllowedAtMs: 0,
    currentIntervalMs: config.baseIntervalMs,
    consecutiveSuccesses: 0,
    consecutiveThrottles: 0,
    totalThrottles: 0,
  };
}

function assertConfig(config: AdaptiveRateLimitConfig): void {
  for (const [label, value] of [
    ["baseIntervalMs", config.baseIntervalMs],
    ["maxIntervalMs", config.maxIntervalMs],
    ["throttleCooldownMs", config.throttleCooldownMs],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be a positive finite number: ${value}`);
    }
  }
  if (config.maxIntervalMs < config.baseIntervalMs) {
    throw new Error("maxIntervalMs must be at least baseIntervalMs");
  }
  if (!Number.isSafeInteger(config.decayAfterSuccesses) || config.decayAfterSuccesses < 1) {
    throw new Error(`decayAfterSuccesses must be a positive safe integer`);
  }
  if (!Number.isFinite(config.backoffMultiplier) || config.backoffMultiplier <= 1) {
    throw new Error(`backoffMultiplier must be greater than 1: ${config.backoffMultiplier}`);
  }
  if (!Number.isFinite(config.decayDivisor) || config.decayDivisor <= 1) {
    throw new Error(`decayDivisor must be greater than 1: ${config.decayDivisor}`);
  }
  if (config.decayDivisor >= config.backoffMultiplier) {
    throw new Error(
      `decayDivisor (${config.decayDivisor}) must be below backoffMultiplier `
      + `(${config.backoffMultiplier}); otherwise the interval can never widen`,
    );
  }
}

/** 次のリクエストまで待つべきミリ秒。0 なら即時。 */
export function waitMsBefore(state: AdaptiveRateLimitState, nowMs: number): number {
  return Math.max(0, state.nextAllowedAtMs - nowMs);
}

/** 成功を観測した。連続成功が続けば間隔を戻す。 */
export function onRequestSucceeded(
  state: AdaptiveRateLimitState,
  nowMs: number,
  config: AdaptiveRateLimitConfig = DEFAULT_ADAPTIVE_RATE_LIMIT,
): AdaptiveRateLimitState {
  assertConfig(config);
  const consecutiveSuccesses = state.consecutiveSuccesses + 1;
  let currentIntervalMs = state.currentIntervalMs;
  if (
    consecutiveSuccesses >= config.decayAfterSuccesses
    && currentIntervalMs > config.baseIntervalMs
  ) {
    // 一気に戻すとまた溢れるので小刻みに。閾値に達したあとは成功のたびに
    // 戻す（カウンタを戻さない）。戻してしまうと、スロットルの周期が
    // 閾値より短い相手に対して二度と減衰しなくなる。
    currentIntervalMs = Math.max(
      config.baseIntervalMs,
      currentIntervalMs / config.decayDivisor,
    );
  }
  return {
    nextAllowedAtMs: nowMs + currentIntervalMs,
    currentIntervalMs,
    consecutiveSuccesses,
    consecutiveThrottles: 0,
    totalThrottles: state.totalThrottles,
  };
}

/**
 * 429 を観測した。
 *
 * 相手はバースト枠なので、短い間隔で再試行しても無駄に枠を削るだけ。
 * 長いクールダウンを置き、通常間隔も広げる。
 */
export function onRequestThrottled(
  state: AdaptiveRateLimitState,
  nowMs: number,
  config: AdaptiveRateLimitConfig = DEFAULT_ADAPTIVE_RATE_LIMIT,
  retryAfterMs?: number,
): AdaptiveRateLimitState {
  assertConfig(config);
  const consecutiveThrottles = state.consecutiveThrottles + 1;
  const currentIntervalMs = Math.min(
    config.maxIntervalMs,
    state.currentIntervalMs * config.backoffMultiplier,
  );
  // Retry-After が来たらそれを尊重する。来ない相手のために既定値も持つ。
  const cooldown = retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.max(retryAfterMs, config.throttleCooldownMs)
    : config.throttleCooldownMs * consecutiveThrottles;
  return {
    nextAllowedAtMs: nowMs + cooldown,
    currentIntervalMs,
    consecutiveSuccesses: 0,
    consecutiveThrottles,
    totalThrottles: state.totalThrottles + 1,
  };
}

/**
 * 与えられた件数を処理するのに必要な概算時間（ms）。
 * 事前に「これは何時間かかるのか」を人へ示すために使う。
 */
export function estimateDurationMs(
  requestCount: number,
  state: AdaptiveRateLimitState,
  config: AdaptiveRateLimitConfig = DEFAULT_ADAPTIVE_RATE_LIMIT,
  /** 何リクエストごとに 429 に当たると見込むか。実測は5前後。 */
  requestsPerThrottle = 5,
): number {
  assertConfig(config);
  if (!Number.isSafeInteger(requestCount) || requestCount < 0) {
    throw new Error(`requestCount must be a non-negative safe integer: ${requestCount}`);
  }
  if (!Number.isSafeInteger(requestsPerThrottle) || requestsPerThrottle < 1) {
    throw new Error("requestsPerThrottle must be a positive safe integer");
  }
  const throttles = Math.floor(requestCount / requestsPerThrottle);
  return requestCount * state.currentIntervalMs + throttles * config.throttleCooldownMs;
}
