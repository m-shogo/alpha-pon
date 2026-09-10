// Research OS — 価格逆引きイベント検出 v1 (F1)。
//
// 目的:
//   過去の不祥事・事故・訴訟などのイベントを、開示から遡って集めることができないため、
//   株価の異常な動きから逆引きしてイベント候補を作る。
//
// なぜ必要か:
//   TDnet 適時開示閲覧サービスは約1ヶ月しか遡れない（2026-09-10 実測: 2026-06-10 も
//   2025-09-10 も first page not found）。一方 J-Quants の日足は取得できる。
//   「過去の事例から学ぶ」の過去を手に入れる唯一の経路がこれになる。
//
// 設計方針:
//   - 外部 IO を行わない。価格も既知イベント日も注入する。
//   - benchmark 調整後の異常リターンで判定する。素のリターンだと
//     地合いが悪かった日に全銘柄が引っかかるだけになる。
//   - 決算日・コーポレートアクション日など **説明のつく日は除外**する。
//     残ったものが「業績で説明できないショック」候補になる。
//   - 出力は候補であって Signal ではない。原因ラベルが付くまで
//     Edge のサンプルへ昇格させない（TDnet collector と同じ思想）。
//   - 落とした理由は必ず件数で返す。silent drop を作らない。
//
// 既知の限界（利用側が必ず認識すべきこと）:
//   下落した事例だけを集めるため、母集団は「大きく下げた」で条件づけられている。
//   エントリー条件自体が「大きく下げたら」なので条件付き母集団としては整合するが、
//   「不祥事があったが下がらなかった」ケースは別途 control として持つ必要がある。

import type { PriceSeries } from "../backtest.js";
import { assertAscendingBars, calendarDaysBetween, positiveDayLimit } from "./trading-calendar.js";

const OBSERVED_TIME_JST = "15:30:00";
const DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT = -35;
const DEFAULT_MAX_PRIOR_GAP_DAYS = 10;
const DEFAULT_TURNOVER_LOOKBACK_BARS = 20;

export const ABNORMAL_MOVE_REJECT_REASONS = [
  "no_prior_bar",
  "prior_bar_too_far",
  "non_positive_prior_close",
  "benchmark_bar_missing",
  "benchmark_prior_bar_missing",
  "non_positive_benchmark_prior_close",
  "move_not_extreme_enough",
  "implausible_single_day_move",
  "corporate_action_in_window",
  "explained_by_known_event",
  "below_min_turnover",
] as const;

export type AbnormalMoveRejectReason = (typeof ABNORMAL_MOVE_REJECT_REASONS)[number];

/** 原因が特定されるまで Edge サンプルにしない理由。 */
export const ABNORMAL_MOVE_BLOCKERS = ["cause_not_labelled"] as const;

export interface AbnormalMoveParams {
  /** benchmark 調整後リターンがこの % 以下なら候補。負の値のみ。例: -8 */
  abnormalReturnThresholdPct: number;
  /**
   * code -> 説明のつくイベント日（決算開示日など）の集合。
   * この日の異常値は F1 の対象外にする。空 Map は「既知イベントが無い」ではなく
   * 「情報が無い」を意味するため、呼び出し側に明示させる。
   */
  knownEventDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** code -> コーポレートアクション日。未調整価格の偽ギャップを除く。 */
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** 単日でこの % 以下は業績反応ではないとみなす。既定 -35（値幅制限を超える動き）。 */
  implausibleSingleDayMovePct?: number;
  /** 前営業日との暦日差の上限。既定 10（売買停止明けを除外する）。 */
  maxPriorGapDays?: number;
  /** 直近平均売買代金がこの額未満なら除外する。未指定なら流動性で絞らない。 */
  minAverageTurnoverJpy?: number;
  /** 売買代金平均の参照本数。既定 20。 */
  turnoverLookbackBars?: number;
}

export interface AbnormalMoveCandidate {
  candidateId: string;
  code: string;
  date: string;
  priorCloseDate: string;
  close: number;
  priorClose: number;
  rawReturnPct: number;
  benchmarkReturnPct: number;
  abnormalReturnPct: number;
  averageTurnoverJpy: number;
  /** この候補を使った判断が可能になる時刻。反応日の引け。 */
  observedAt: string;
  /** 原因未特定。true になることはない（ラベリングは別工程）。 */
  causeLabelled: false;
  blockers: readonly ["cause_not_labelled"];
}

export interface AbnormalMoveRejection {
  code: string;
  date: string;
  reason: AbnormalMoveRejectReason;
}

export interface AbnormalMoveResult {
  candidates: AbnormalMoveCandidate[];
  rejected: AbnormalMoveRejection[];
  rejectedCounts: Record<AbnormalMoveRejectReason, number>;
  /** 判定を試みた (code, date) の総数。candidates + rejected と一致する。 */
  evaluatedCount: number;
}

function emptyRejectedCounts(): Record<AbnormalMoveRejectReason, number> {
  const counts = {} as Record<AbnormalMoveRejectReason, number>;
  for (const reason of ABNORMAL_MOVE_REJECT_REASONS) counts[reason] = 0;
  return counts;
}

function assertParams(params: AbnormalMoveParams): void {
  if (!Number.isFinite(params.abnormalReturnThresholdPct) || params.abnormalReturnThresholdPct >= 0) {
    throw new Error(
      `abnormalReturnThresholdPct must be a negative finite number: ${params.abnormalReturnThresholdPct}`,
    );
  }
  const implausible = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;
  if (!Number.isFinite(implausible) || implausible >= 0) {
    throw new Error(`implausibleSingleDayMovePct must be a negative finite number: ${implausible}`);
  }
  if (implausible >= params.abnormalReturnThresholdPct) {
    throw new Error(
      `implausibleSingleDayMovePct (${implausible}) must be below `
      + `abnormalReturnThresholdPct (${params.abnormalReturnThresholdPct})`,
    );
  }
  positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
  positiveDayLimit(params.turnoverLookbackBars, DEFAULT_TURNOVER_LOOKBACK_BARS, "turnoverLookbackBars");
  if (params.minAverageTurnoverJpy !== undefined) {
    if (!Number.isFinite(params.minAverageTurnoverJpy) || params.minAverageTurnoverJpy < 0) {
      throw new Error(`minAverageTurnoverJpy must be a non-negative finite number`);
    }
  }
}

function averageTurnoverJpy(series: PriceSeries, endIndex: number, lookback: number): number {
  const start = Math.max(0, endIndex - lookback + 1);
  const window = series.bars.slice(start, endIndex + 1);
  if (window.length === 0) return 0;
  return window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / window.length;
}

/**
 * benchmark 調整後の異常下落からイベント候補を作る。
 *
 * 判定に使うのは date 当日の引けまでの情報だけなので、
 * observedAt は date の引け（15:30 JST）。Backtest 側の next_open は翌営業日になる。
 */
export function detectAbnormalMoveEvents(
  securities: readonly PriceSeries[],
  benchmark: PriceSeries,
  params: AbnormalMoveParams,
): AbnormalMoveResult {
  assertParams(params);
  assertAscendingBars(benchmark);
  for (const series of securities) assertAscendingBars(series);

  const maxPriorGapDays = positiveDayLimit(
    params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays",
  );
  const lookback = positiveDayLimit(
    params.turnoverLookbackBars, DEFAULT_TURNOVER_LOOKBACK_BARS, "turnoverLookbackBars",
  );
  const implausiblePct = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;

  const benchmarkCloseByDate = new Map(benchmark.bars.map((bar) => [bar.date, bar.close]));

  const candidates: AbnormalMoveCandidate[] = [];
  const rejected: AbnormalMoveRejection[] = [];
  const rejectedCounts = emptyRejectedCounts();
  let evaluatedCount = 0;

  const reject = (code: string, date: string, reason: AbnormalMoveRejectReason): void => {
    rejected.push({ code, date, reason });
    rejectedCounts[reason] += 1;
  };

  const orderedSecurities = [...securities].sort((left, right) =>
    left.code < right.code ? -1 : left.code > right.code ? 1 : 0,
  );

  for (const series of orderedSecurities) {
    const knownEvents = params.knownEventDates.get(series.code);
    const actionDates = params.corporateActionDates.get(series.code);

    for (let index = 0; index < series.bars.length; index += 1) {
      const bar = series.bars[index];
      evaluatedCount += 1;

      if (index === 0) {
        reject(series.code, bar.date, "no_prior_bar");
        continue;
      }
      const priorBar = series.bars[index - 1];

      if (calendarDaysBetween(priorBar.date, bar.date) > maxPriorGapDays) {
        reject(series.code, bar.date, "prior_bar_too_far");
        continue;
      }
      if (!(priorBar.close > 0)) {
        reject(series.code, bar.date, "non_positive_prior_close");
        continue;
      }

      // 説明のつく日はここで抜く。残りが「業績で説明できないショック」候補になる。
      if (knownEvents?.has(bar.date)) {
        reject(series.code, bar.date, "explained_by_known_event");
        continue;
      }
      if (actionDates && (actionDates.has(bar.date) || actionDates.has(priorBar.date))) {
        reject(series.code, bar.date, "corporate_action_in_window");
        continue;
      }

      const benchmarkClose = benchmarkCloseByDate.get(bar.date);
      if (benchmarkClose === undefined) {
        reject(series.code, bar.date, "benchmark_bar_missing");
        continue;
      }
      const benchmarkPriorClose = benchmarkCloseByDate.get(priorBar.date);
      if (benchmarkPriorClose === undefined) {
        reject(series.code, bar.date, "benchmark_prior_bar_missing");
        continue;
      }
      if (!(benchmarkPriorClose > 0)) {
        reject(series.code, bar.date, "non_positive_benchmark_prior_close");
        continue;
      }

      const rawReturnPct = ((bar.close - priorBar.close) / priorBar.close) * 100;
      const benchmarkReturnPct = ((benchmarkClose - benchmarkPriorClose) / benchmarkPriorClose) * 100;
      const abnormalReturnPct = rawReturnPct - benchmarkReturnPct;

      if (!(abnormalReturnPct <= params.abnormalReturnThresholdPct)) {
        reject(series.code, bar.date, "move_not_extreme_enough");
        continue;
      }
      // コーポレートアクション情報が無い場合の保険。値幅制限を超える下落は
      // 業績反応でも事件でもなく、分割・併合・異常データである。
      if (rawReturnPct <= implausiblePct) {
        reject(series.code, bar.date, "implausible_single_day_move");
        continue;
      }

      const turnover = averageTurnoverJpy(series, index, lookback);
      if (params.minAverageTurnoverJpy !== undefined && turnover < params.minAverageTurnoverJpy) {
        reject(series.code, bar.date, "below_min_turnover");
        continue;
      }

      candidates.push({
        candidateId: `am-${series.code}-${bar.date}`,
        code: series.code,
        date: bar.date,
        priorCloseDate: priorBar.date,
        close: bar.close,
        priorClose: priorBar.close,
        rawReturnPct,
        benchmarkReturnPct,
        abnormalReturnPct,
        averageTurnoverJpy: turnover,
        observedAt: `${bar.date}T${OBSERVED_TIME_JST}+09:00`,
        causeLabelled: false,
        blockers: ABNORMAL_MOVE_BLOCKERS,
      });
    }
  }

  candidates.sort((left, right) =>
    left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0,
  );

  return { candidates, rejected, rejectedCounts, evaluatedCount };
}
