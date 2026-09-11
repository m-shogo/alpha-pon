// Research OS — 1営業日の benchmark 調整後リターン評価。
//
// F1（価格逆引き）と read-across（関連銘柄伝播）で同じガードが必要になるため、
// 実装を1箇所に集約する。二重実装すると片方だけ直して静かに乖離する。
//
// ここで守ること:
//   - benchmark 調整後で測る。素のリターンだと地合いで全銘柄が動いた日を拾う
//   - 売買停止明けを「1日の値動き」として扱わない
//   - コーポレートアクション日の未調整価格で偽の値動きを作らない
//   - benchmark が欠けている日に素のリターンで代用しない（fail closed）
//
// ここで扱わないこと:
//   流動性（最低売買代金）の足切りは**データ健全性ではなく選別方針**なので、
//   呼び出し側が自分の閾値判定の後に適用する。ここで先に落とすと、
//   候補になり得なかった日まで below_min_turnover に計上され、
//   「候補相当だが流動性で落ちた件数」が読めなくなる。

import type { PriceSeries } from "../backtest.js";
import {
  estimateMarketModel,
  marketModelAbnormalReturnPct,
  standardizedAbnormalReturn,
  type MarketModelParams,
} from "./market-model.js";
import { calendarDaysBetween } from "./trading-calendar.js";

export const ABNORMAL_RETURN_REJECT_REASONS = [
  "no_prior_bar",
  "prior_bar_too_far",
  "non_positive_prior_close",
  "benchmark_bar_missing",
  "benchmark_prior_bar_missing",
  "non_positive_benchmark_prior_close",
  "corporate_action_in_window",
  "implausible_single_day_move",
  "market_model_unavailable",
] as const;

export type AbnormalReturnRejectReason = (typeof ABNORMAL_RETURN_REJECT_REASONS)[number];

export interface AbnormalReturnMetrics {
  date: string;
  priorCloseDate: string;
  close: number;
  priorClose: number;
  rawReturnPct: number;
  benchmarkReturnPct: number;
  /**
   * 市場モデルを渡した場合は `r_i − (α̂ + β̂·r_m)`、
   * 渡さない場合は `r_i − r_m`（β=1 の仮定）。
   */
  abnormalReturnPct: number;
  averageTurnoverJpy: number;
  /** 市場モデルを使ったときのみ。推定した β。 */
  beta?: number;
  /** 市場モデルを使ったときのみ。残差σで割った異常収益。σ=0 なら null。 */
  standardizedAbnormalReturn?: number | null;
}

export type AbnormalReturnEvaluation =
  | { ok: true; metrics: AbnormalReturnMetrics }
  | { ok: false; reason: AbnormalReturnRejectReason };

export interface AbnormalReturnGuards {
  benchmarkCloseByDate: ReadonlyMap<string, number>;
  corporateActionDates?: ReadonlySet<string>;
  /** 単日でこの % 以下は分割・併合・異常データとみなす。負の値。 */
  implausibleSingleDayMovePct: number;
  /** 前営業日との暦日差の上限。 */
  maxPriorGapDays: number;
  /** averageTurnoverJpy の参照本数。流動性の判定自体は呼び出し側が行う。 */
  turnoverLookbackBars: number;
  /**
   * 与えると市場モデル（α+β·r_m）で異常収益を測る。
   *
   * 省略すると `r_i − r_m`、つまり**全銘柄 β=1 の仮定**になる。
   * 実測（2026-09-11、44営業日）では、その仮定のせいで
   * 市場が -10.8% 下げた 2024-08-05 だけで全候補の38%を占めた。
   * 高β銘柄が余計に下げただけのものを「異常」と読んでいた。
   */
  marketModel?: MarketModelParams;
}

export function averageTurnoverJpy(series: PriceSeries, endIndex: number, lookback: number): number {
  const start = Math.max(0, endIndex - lookback + 1);
  const window = series.bars.slice(start, endIndex + 1);
  if (window.length === 0) return 0;
  return window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / window.length;
}

/**
 * series.bars[index] の営業日について benchmark 調整後リターンを評価する。
 *
 * 判定に使うのはその日の引けまでの情報だけ。呼び出し側は observedAt を
 * `${date}T15:30:00+09:00` として扱えば PIT を壊さない。
 */
export function evaluateAbnormalReturn(
  series: PriceSeries,
  index: number,
  guards: AbnormalReturnGuards,
): AbnormalReturnEvaluation {
  if (index <= 0) return { ok: false, reason: "no_prior_bar" };

  const bar = series.bars[index];
  const priorBar = series.bars[index - 1];

  if (calendarDaysBetween(priorBar.date, bar.date) > guards.maxPriorGapDays) {
    return { ok: false, reason: "prior_bar_too_far" };
  }
  if (!(priorBar.close > 0)) return { ok: false, reason: "non_positive_prior_close" };

  const actions = guards.corporateActionDates;
  if (actions && (actions.has(bar.date) || actions.has(priorBar.date))) {
    return { ok: false, reason: "corporate_action_in_window" };
  }

  const benchmarkClose = guards.benchmarkCloseByDate.get(bar.date);
  if (benchmarkClose === undefined) return { ok: false, reason: "benchmark_bar_missing" };
  const benchmarkPriorClose = guards.benchmarkCloseByDate.get(priorBar.date);
  if (benchmarkPriorClose === undefined) return { ok: false, reason: "benchmark_prior_bar_missing" };
  if (!(benchmarkPriorClose > 0)) return { ok: false, reason: "non_positive_benchmark_prior_close" };

  const rawReturnPct = ((bar.close - priorBar.close) / priorBar.close) * 100;
  // コーポレートアクション情報が無い場合の保険。値幅制限を超える動きは
  // 業績反応でも事件でもなく、分割・併合・異常データである。
  if (rawReturnPct <= guards.implausibleSingleDayMovePct) {
    return { ok: false, reason: "implausible_single_day_move" };
  }

  const benchmarkReturnPct = ((benchmarkClose - benchmarkPriorClose) / benchmarkPriorClose) * 100;
  const turnover = averageTurnoverJpy(series, index, guards.turnoverLookbackBars);

  const base = {
    date: bar.date,
    priorCloseDate: priorBar.date,
    close: bar.close,
    priorClose: priorBar.close,
    rawReturnPct,
    benchmarkReturnPct,
    averageTurnoverJpy: turnover,
  };

  if (!guards.marketModel) {
    return {
      ok: true,
      metrics: { ...base, abnormalReturnPct: rawReturnPct - benchmarkReturnPct },
    };
  }

  // 権利落ち日はここでも持っているので、推定にも必ず渡す。
  // 渡さないと併合・分割のリターンが β と σ を壊す（実測 β=245.5）。
  const estimate = estimateMarketModel(
    series, guards.benchmarkCloseByDate, index, guards.marketModel, guards.corporateActionDates,
  );
  // 推定できないなら β=1 で代用しない。それをやると
  // 「市場モデルで測った」と「素朴に引いた」が混ざり、結果を後から解釈できない。
  if (!estimate.ok) return { ok: false, reason: "market_model_unavailable" };

  const abnormalReturnPct = marketModelAbnormalReturnPct(
    estimate.fit, rawReturnPct, benchmarkReturnPct,
  );
  return {
    ok: true,
    metrics: {
      ...base,
      abnormalReturnPct,
      beta: estimate.fit.beta,
      standardizedAbnormalReturn: standardizedAbnormalReturn(estimate.fit, abnormalReturnPct),
    },
  };
}
