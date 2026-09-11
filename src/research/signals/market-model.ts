/**
 * 市場モデル（マーケットモデル）による異常収益の推定。
 *
 * ## なぜ要るか（実測）
 *
 * これまでの異常収益は `r_i - r_m`、つまり **全銘柄 β=1 の仮定**だった。
 * 2024-06-19〜2024-08-21 の44営業日に F1（閾値 -8%）を掛けると:
 *
 * ```
 *   2024-08-05  候補 553件  benchmark -10.82%   ← 全候補の38%
 *   2024-08-06  候補 168件  benchmark  +6.04%
 *   2024-08-07  候補  76件  benchmark  +3.71%
 *   上位3日だけで797件 = 全体の55%
 * ```
 *
 * 市場が -10.8% 動いた日、β=1.5 の銘柄は -16% 下げる。素朴な差し引きでは
 * -5.2% が「異常」として残るが、これは市場βであって個別の事件ではない。
 * 逆に反発日（+6.04%）に付いていけない銘柄も「異常下落」に見える。
 *
 * 探したいのは不祥事・子会社問題といった**個別要因**なので、
 * βの残差を混ぜると対象が汚れる。
 *
 * ## 推定
 *
 * 事件日より前だけを使う（`gapBars` で事件前の助走も除く）。
 * 推定期間に事件当日を含めると、事件そのものがβを押し上げて
 * 異常収益が小さく出る。
 *
 *   r_i = α + β·r_m + e
 *   AR  = r_i − (α̂ + β̂·r_m)
 *   標準化 AR = AR / σ̂(e)
 *
 * 閾値を「-8%」ではなく「-3σ」で置けるようになる。
 * 値動きの粗い銘柄と静かな銘柄を同じ物差しで測らずに済む。
 *
 * ## 権利落ち日を外す
 *
 * 最初の実装は権利落ち台帳を見ていなかった。実測 `13570` は 2024-12-16 に
 * 100:1 の株式併合をして +9,947% になり、それが推定期間に入って
 * **β=245.5 / 残差σ=817%** になった。その結果、異常収益が -262.7% という
 * あり得ない値で出ていた。
 *
 * 呼び出し側が持っている権利落ち日を渡せるようにし、その日をまたぐ
 * リターンを推定から外す。
 *
 * ## ここで決めないこと
 *
 * βの大きさによる足切りは**選別方針**であって推定の責務ではない。
 * 推定した β をそのまま返し、判断は呼び出し側に委ねる。
 */

import type { PriceSeries } from "../backtest.js";
import { calendarDaysBetween } from "./trading-calendar.js";

export const MARKET_MODEL_REJECT_REASONS = [
  "insufficient_observations",
  "benchmark_has_no_variance",
  "estimation_window_before_history",
] as const;

export type MarketModelRejectReason = (typeof MARKET_MODEL_REJECT_REASONS)[number];

export interface MarketModelParams {
  /** 推定に使う営業日数の上限。event study の慣行は120本前後。 */
  estimationBars: number;
  /**
   * 事件日の**さらに手前**に空ける本数。
   *
   * 事件日そのものは常に推定期間から外れる。`gapBars` は「事件前の助走
   * （リークや先行した売り）まで外したい」ぶんの追加分。0 でも事件日は入らない。
   */
  gapBars: number;
  /** これを下回る観測数では推定しない。 */
  minObservations: number;
  /** 連続していないリターン（売買停止明けなど）を除く暦日差の上限。 */
  maxPriorGapDays: number;
}

export const DEFAULT_MARKET_MODEL_PARAMS: MarketModelParams = {
  estimationBars: 120,
  gapBars: 5,
  minObservations: 60,
  maxPriorGapDays: 10,
};

export interface MarketModelFit {
  alpha: number;
  beta: number;
  /** 残差の標準偏差（%）。標準化に使う。 */
  residualStdPct: number;
  observations: number;
  /** 推定に使った期間。再現のために返す。 */
  fromDate: string;
  toDate: string;
}

export type MarketModelEstimate =
  | { ok: true; fit: MarketModelFit }
  | { ok: false; reason: MarketModelRejectReason };

export function assertMarketModelParams(params: MarketModelParams): void {
  for (const [label, value] of [
    ["estimationBars", params.estimationBars],
    ["minObservations", params.minObservations],
    ["maxPriorGapDays", params.maxPriorGapDays],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${label} must be a positive safe integer: ${value}`);
    }
  }
  if (!Number.isSafeInteger(params.gapBars) || params.gapBars < 0) {
    throw new Error(`gapBars must be a non-negative safe integer: ${params.gapBars}`);
  }
  if (params.minObservations > params.estimationBars) {
    throw new Error(
      `minObservations (${params.minObservations}) cannot exceed `
      + `estimationBars (${params.estimationBars})`,
    );
  }
  // 2点では残差の自由度が 0 になり σ が定義できない。
  if (params.minObservations < 3) {
    throw new Error(`minObservations must be at least 3 to estimate a residual standard deviation`);
  }
}

interface ReturnPair { securityPct: number; benchmarkPct: number }

/**
 * 推定期間のリターン対を集める。
 *
 * 銘柄と benchmark は欠測日が違うので、**日付で突き合わせる**。
 * 添字で合わせると片方に休みがあるだけで全期間がずれる。
 */
function collectReturnPairs(
  series: PriceSeries,
  benchmarkCloseByDate: ReadonlyMap<string, number>,
  eventIndex: number,
  params: MarketModelParams,
  corporateActionDates: ReadonlySet<string> | undefined,
): { pairs: ReturnPair[]; fromDate: string; toDate: string } {
  // 事件日そのものは絶対に含めない（-1）。gapBars はそこからの追加分。
  // 含めると事件が β と σ を押し上げ、異常収益が小さく出る。
  const endIndex = eventIndex - 1 - params.gapBars;
  const startIndex = Math.max(1, endIndex - params.estimationBars + 1);
  const pairs: ReturnPair[] = [];
  let fromDate = "";
  let toDate = "";

  for (let index = startIndex; index <= endIndex; index += 1) {
    const bar = series.bars[index];
    const priorBar = series.bars[index - 1];
    if (!bar || !priorBar) continue;
    if (!(priorBar.close > 0)) continue;
    // 売買停止明けの「1日の値動き」を推定に混ぜない。
    if (calendarDaysBetween(priorBar.date, bar.date) > params.maxPriorGapDays) continue;
    // 権利落ち日のリターンは株数基準が変わるので値動きではない。
    // 実測: 100:1 併合の +9,947% が入って β=245.5 / σ=817% になった。
    //
    // **翌日は外さない。** 権利落ち日の終値は既に新基準なので、
    // 翌日のリターンは新基準どうしで正常。検出側
    // （`evaluateAbnormalReturn` の corporate_action_in_window）は
    // 候補そのものを出さない方向へ保守的に前日も見るが、推定では
    // 使える観測を捨てる理由がない。
    if (corporateActionDates !== undefined && corporateActionDates.has(bar.date)) continue;

    const benchmarkClose = benchmarkCloseByDate.get(bar.date);
    const benchmarkPriorClose = benchmarkCloseByDate.get(priorBar.date);
    if (benchmarkClose === undefined || benchmarkPriorClose === undefined) continue;
    if (!(benchmarkPriorClose > 0)) continue;

    if (!fromDate) fromDate = bar.date;
    toDate = bar.date;
    pairs.push({
      securityPct: ((bar.close - priorBar.close) / priorBar.close) * 100,
      benchmarkPct: ((benchmarkClose - benchmarkPriorClose) / benchmarkPriorClose) * 100,
    });
  }

  return { pairs, fromDate, toDate };
}

/**
 * `series.bars[eventIndex]` の日を事件日として、その **手前だけ** で
 * α・β・残差σを推定する。
 */
export function estimateMarketModel(
  series: PriceSeries,
  benchmarkCloseByDate: ReadonlyMap<string, number>,
  eventIndex: number,
  params: MarketModelParams = DEFAULT_MARKET_MODEL_PARAMS,
  /** この銘柄の権利落ち日。渡さないと併合・分割が推定に混ざる。 */
  corporateActionDates?: ReadonlySet<string>,
): MarketModelEstimate {
  assertMarketModelParams(params);
  if (!Number.isSafeInteger(eventIndex) || eventIndex < 0) {
    throw new Error(`eventIndex must be a non-negative safe integer: ${eventIndex}`);
  }
  // gap を空けたら推定期間が履歴の手前に出てしまう。無理に詰めない。
  if (eventIndex - 1 - params.gapBars < 1) {
    return { ok: false, reason: "estimation_window_before_history" };
  }

  const { pairs, fromDate, toDate } = collectReturnPairs(
    series, benchmarkCloseByDate, eventIndex, params, corporateActionDates,
  );
  if (pairs.length < params.minObservations) {
    return { ok: false, reason: "insufficient_observations" };
  }

  const n = pairs.length;
  let sumSecurity = 0;
  let sumBenchmark = 0;
  for (const pair of pairs) { sumSecurity += pair.securityPct; sumBenchmark += pair.benchmarkPct; }
  const meanSecurity = sumSecurity / n;
  const meanBenchmark = sumBenchmark / n;

  let covariance = 0;
  let variance = 0;
  for (const pair of pairs) {
    const benchmarkDeviation = pair.benchmarkPct - meanBenchmark;
    covariance += benchmarkDeviation * (pair.securityPct - meanSecurity);
    variance += benchmarkDeviation * benchmarkDeviation;
  }
  if (!(variance > 0)) return { ok: false, reason: "benchmark_has_no_variance" };

  const beta = covariance / variance;
  const alpha = meanSecurity - beta * meanBenchmark;

  let sumSquaredResiduals = 0;
  for (const pair of pairs) {
    const residual = pair.securityPct - alpha - beta * pair.benchmarkPct;
    sumSquaredResiduals += residual * residual;
  }
  // 自由度は n-2（α と β を推定に使ったぶん）。
  const residualStdPct = Math.sqrt(sumSquaredResiduals / (n - 2));

  return { ok: true, fit: { alpha, beta, residualStdPct, observations: n, fromDate, toDate } };
}

/** 市場モデルによる異常収益（%）。 */
export function marketModelAbnormalReturnPct(
  fit: MarketModelFit,
  securityReturnPct: number,
  benchmarkReturnPct: number,
): number {
  return securityReturnPct - (fit.alpha + fit.beta * benchmarkReturnPct);
}

/**
 * 残差σで割った異常収益。
 *
 * `residualStdPct` が 0 のときは null。値動きの無い銘柄を
 * 「無限に異常」と読ませない。
 */
export function standardizedAbnormalReturn(
  fit: MarketModelFit,
  abnormalReturnPct: number,
): number | null {
  if (!(fit.residualStdPct > 0)) return null;
  return abnormalReturnPct / fit.residualStdPct;
}
