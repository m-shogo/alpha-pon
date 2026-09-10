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
] as const;

export type AbnormalReturnRejectReason = (typeof ABNORMAL_RETURN_REJECT_REASONS)[number];

export interface AbnormalReturnMetrics {
  date: string;
  priorCloseDate: string;
  close: number;
  priorClose: number;
  rawReturnPct: number;
  benchmarkReturnPct: number;
  abnormalReturnPct: number;
  averageTurnoverJpy: number;
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

  return {
    ok: true,
    metrics: {
      date: bar.date,
      priorCloseDate: priorBar.date,
      close: bar.close,
      priorClose: priorBar.close,
      rawReturnPct,
      benchmarkReturnPct,
      abnormalReturnPct: rawReturnPct - benchmarkReturnPct,
      averageTurnoverJpy: turnover,
    },
  };
}
