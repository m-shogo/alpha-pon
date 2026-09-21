// EDINET のイベントを backtest のシグナルに変換する（純関数）。
//
// イベントスタディ（research:edinet-study）と**同じ絞り方**を使う。
// 別々に書くと「イベントスタディでは出たのに backtest では出ない」の
// 原因が分からなくなる。
//
// 絞り方:
//   - 価格系列があること / 反応日に足があること
//   - 反応日を**含む**直近20本の平均売買代金が下限以上
//     （翌営業日の寄付で建てるので、反応日の出来高は判断の時点で分かっている）
//   - 決算開示日（と翌営業日）に当たるものを落とすかは呼び出し側が決める
//
// observedAt は**反応日の引け**。entry.mode = next_open なら翌営業日の始値で建つ。

import type { BacktestSignal, PriceSeries } from "../backtest.js";
import { jquantsTradingDayCloseJst } from "../providers/jquants-free.js";
import { averageTurnoverJpy } from "./abnormal-return.js";
import type { EdinetReasonEvent } from "./edinet-reason-events.js";

/** 流動性を見る本数（検出器・指数・イベントスタディと同じ）。 */
export const EDINET_TURNOVER_LOOKBACK_BARS = 20;

export interface EdinetEventSignalResult {
  signals: BacktestSignal[];
  rejectedCounts: {
    no_price_series: number;
    no_reaction_bar: number;
    below_min_turnover: number;
    known_earnings: number;
  };
}

export function buildEdinetEventSignals(input: {
  events: readonly EdinetReasonEvent[];
  priceByCode: ReadonlyMap<string, PriceSeries>;
  /** 銘柄ごとの「決算で説明できる日」。除外しないなら空の Map を渡す。 */
  knownEarningsByCode: ReadonlyMap<string, ReadonlySet<string>>;
  minAverageTurnoverJpy: number;
}): EdinetEventSignalResult {
  if (!Number.isFinite(input.minAverageTurnoverJpy) || input.minAverageTurnoverJpy < 0) {
    throw new Error(
      `minAverageTurnoverJpy は0以上の数値で指定してください: ${input.minAverageTurnoverJpy}`,
    );
  }
  const rejectedCounts = {
    no_price_series: 0,
    no_reaction_bar: 0,
    below_min_turnover: 0,
    known_earnings: 0,
  };
  const signals: BacktestSignal[] = [];
  for (const event of input.events) {
    const series = input.priceByCode.get(event.code);
    if (!series) { rejectedCounts.no_price_series += 1; continue; }
    const index = series.bars.findIndex((bar) => bar.date === event.reactionDate);
    if (index < 0) { rejectedCounts.no_reaction_bar += 1; continue; }
    if (averageTurnoverJpy(series, index, EDINET_TURNOVER_LOOKBACK_BARS)
      < input.minAverageTurnoverJpy) {
      rejectedCounts.below_min_turnover += 1;
      continue;
    }
    if (input.knownEarningsByCode.get(event.code)?.has(event.reactionDate)) {
      rejectedCounts.known_earnings += 1;
      continue;
    }
    signals.push({
      id: event.eventId,
      code: event.code,
      observedAt: jquantsTradingDayCloseJst(event.reactionDate),
    });
  }
  return { signals, rejectedCounts };
}
