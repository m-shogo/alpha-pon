// Research OS — read-across（関連銘柄伝播）イベント検出 v1（C1 / C2）。
//
// 目的:
//   A 社の事件で同業・親子・取引先の B 社も下げたとき、
//   B 社に実害が無ければ下落は過剰反応の可能性が高い。
//   1つの事件から N 件のサンプルが取れるため、
//   供給の細い不祥事 Edge を実用的な標本数へ引き上げる唯一の経路になる。
//
// 設計方針:
//   - 外部 IO を行わない。関係グラフも価格も注入する。
//   - 発生元が実際に異常下落したことを先に確認する。
//     動いていない「事件」から伝播を語らない。
//   - 関連銘柄側は自分の決算など**自前の説明がある日を除外**する。
//     それは伝播ではなく B 社自身の材料。
//   - 同方向（下落）のみ拾う。逆方向はローテーションであって伝播ではない。
//   - 出力は候補であって Signal ではない。実害の有無は別途ラベリングする。
//   - 落とした理由を必ず件数で返す。silent drop を作らない。
//
// 既知の限界:
//   「B に実害があるか」は価格からは分からない。この検出器が言えるのは
//   「A の事件と同じ日に B も理由不明で下げた」までであり、
//   実害の切り分け（separability）は人間または一次情報の仕事。

import type { PriceSeries } from "../backtest.js";
import type { MarketModelParams } from "./market-model.js";
import {
  evaluateAbnormalReturn,
  type AbnormalReturnRejectReason,
} from "./abnormal-return.js";
import type { CompanyRelationGraph, CompanyRelationType } from "./company-relations.js";
import { assertAscendingBars, positiveDayLimit } from "./trading-calendar.js";

const OBSERVED_TIME_JST = "15:30:00";
const DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT = -35;
const DEFAULT_MAX_PRIOR_GAP_DAYS = 10;
const DEFAULT_TURNOVER_LOOKBACK_BARS = 20;

export const READ_ACROSS_REJECT_REASONS = [
  "source_price_unavailable",
  "source_bar_missing",
  "source_guard_failed",
  "source_not_moved",
  "no_relations",
  "related_price_unavailable",
  "related_bar_missing",
  "related_guard_failed",
  "related_not_moved",
  "explained_by_own_event",
  "below_min_turnover",
  "duplicate_related_event",
] as const;

export type ReadAcrossRejectReason = (typeof READ_ACROSS_REJECT_REASONS)[number];

export const READ_ACROSS_BLOCKERS = ["actual_damage_not_assessed"] as const;

export interface ReadAcrossSourceEvent {
  code: string;
  /** 事件が価格に出た営業日 */
  date: string;
  /** 任意のラベル（事件種別など）。同一性には使わない。 */
  label?: string;
}

export interface ReadAcrossParams {
  /** 発生元がこの % 以下の異常下落を示していること。負の値。 */
  sourceAbnormalReturnThresholdPct: number;
  /** 関連銘柄がこの % 以下の異常下落を示したら伝播候補。負の値。 */
  relatedAbnormalReturnThresholdPct: number;
  /** code -> その銘柄自身の説明のつくイベント日（決算開示日など）。 */
  knownEventDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** code -> コーポレートアクション日。 */
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** 対象にする関係種別。未指定なら全種別。 */
  relationTypes?: readonly CompanyRelationType[];
  implausibleSingleDayMovePct?: number;
  maxPriorGapDays?: number;
  minAverageTurnoverJpy?: number;
  turnoverLookbackBars?: number;
  /**
   * 市場モデル。**渡さないと「素のリターン − ベンチマーク」で測る。**
   *
   * 2026-09-12 の手検算で、発生元は市場モデル（呼び出し側が
   * detectAbnormalMoveEvents で -10% を判定）、伝播側はここで素の差、
   * という**定義の食い違い**が見つかった。同じ日・同じ銘柄で
   * -4.573%（市場モデル）と -4.330%（素）になる。
   *
   * 比（伝播側 ÷ 発生元）は分子と分母の定義が揃っていないと意味が無い。
   * さらに素の差で閾値を切ると、β の高い銘柄が下げ日に過剰に選ばれる。
   */
  marketModel?: MarketModelParams;
}

export interface ReadAcrossCandidate {
  candidateId: string;
  sourceCode: string;
  sourceLabel?: string;
  relatedCode: string;
  relationType: CompanyRelationType;
  relationNote?: string;
  /** 逆向きに補完した関係から辿ったか */
  relationDerived: boolean;
  date: string;
  sourceAbnormalReturnPct: number;
  relatedAbnormalReturnPct: number;
  /** 関連銘柄の下げ幅 / 発生元の下げ幅。1 未満なら発生元より小さい反応。 */
  propagationRatio: number;
  relatedAverageTurnoverJpy: number;
  observedAt: string;
  /** 実害の有無は価格からは判定できない。ラベリング前に昇格させない。 */
  actualDamageAssessed: false;
  blockers: readonly ["actual_damage_not_assessed"];
}

export interface ReadAcrossRejection {
  sourceCode: string;
  relatedCode: string | null;
  date: string;
  reason: ReadAcrossRejectReason;
  /** *_guard_failed のときの内訳。情報を捨てない。 */
  guardReason?: AbnormalReturnRejectReason;
}

export interface ReadAcrossResult {
  candidates: ReadAcrossCandidate[];
  rejected: ReadAcrossRejection[];
  rejectedCounts: Record<ReadAcrossRejectReason, number>;
  sourceEventCount: number;
  /** 発生元として成立し、関連銘柄の評価まで進んだ事件の数 */
  propagatedSourceCount: number;
}

function emptyRejectedCounts(): Record<ReadAcrossRejectReason, number> {
  const counts = {} as Record<ReadAcrossRejectReason, number>;
  for (const reason of READ_ACROSS_REJECT_REASONS) counts[reason] = 0;
  return counts;
}

function assertNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value >= 0) {
    throw new Error(`${field} must be a negative finite number: ${value}`);
  }
}

function assertParams(params: ReadAcrossParams): void {
  assertNegative(params.sourceAbnormalReturnThresholdPct, "sourceAbnormalReturnThresholdPct");
  assertNegative(params.relatedAbnormalReturnThresholdPct, "relatedAbnormalReturnThresholdPct");
  const implausible = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;
  assertNegative(implausible, "implausibleSingleDayMovePct");
  for (const [label, threshold] of [
    ["sourceAbnormalReturnThresholdPct", params.sourceAbnormalReturnThresholdPct],
    ["relatedAbnormalReturnThresholdPct", params.relatedAbnormalReturnThresholdPct],
  ] as const) {
    if (implausible >= threshold) {
      throw new Error(`implausibleSingleDayMovePct (${implausible}) must be below ${label} (${threshold})`);
    }
  }
  positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
  positiveDayLimit(params.turnoverLookbackBars, DEFAULT_TURNOVER_LOOKBACK_BARS, "turnoverLookbackBars");
}

/**
 * 発生元の事件から、関連銘柄への伝播候補を作る。
 *
 * observedAt は当日の引け。判定に使うのはその日の引けまでの情報だけなので、
 * Backtest 側の next_open は翌営業日になる。
 */
export function detectReadAcrossEvents(
  sourceEvents: readonly ReadAcrossSourceEvent[],
  relations: CompanyRelationGraph,
  securities: ReadonlyMap<string, PriceSeries>,
  benchmark: PriceSeries,
  params: ReadAcrossParams,
): ReadAcrossResult {
  assertParams(params);
  assertAscendingBars(benchmark);
  for (const series of securities.values()) assertAscendingBars(series);

  const maxPriorGapDays = positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
  const lookback = positiveDayLimit(params.turnoverLookbackBars, DEFAULT_TURNOVER_LOOKBACK_BARS, "turnoverLookbackBars");
  const implausiblePct = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;
  const allowedTypes = params.relationTypes === undefined ? null : new Set(params.relationTypes);
  const benchmarkCloseByDate = new Map(benchmark.bars.map((bar) => [bar.date, bar.close]));

  const candidates: ReadAcrossCandidate[] = [];
  const rejected: ReadAcrossRejection[] = [];
  const rejectedCounts = emptyRejectedCounts();
  const claimed = new Set<string>();
  let propagatedSourceCount = 0;

  const reject = (
    sourceCode: string,
    relatedCode: string | null,
    date: string,
    reason: ReadAcrossRejectReason,
    guardReason?: AbnormalReturnRejectReason,
  ): void => {
    rejected.push({ sourceCode, relatedCode, date, reason, ...(guardReason ? { guardReason } : {}) });
    rejectedCounts[reason] += 1;
  };

  const barIndexOf = (series: PriceSeries, date: string): number =>
    series.bars.findIndex((bar) => bar.date === date);

  const ordered = [...sourceEvents].sort((left, right) =>
    left.date !== right.date
      ? (left.date < right.date ? -1 : 1)
      : (left.code < right.code ? -1 : left.code > right.code ? 1 : 0),
  );

  for (const event of ordered) {
    const sourceSeries = securities.get(event.code);
    if (!sourceSeries) {
      reject(event.code, null, event.date, "source_price_unavailable");
      continue;
    }
    const sourceIndex = barIndexOf(sourceSeries, event.date);
    if (sourceIndex < 0) {
      reject(event.code, null, event.date, "source_bar_missing");
      continue;
    }
    const sourceEval = evaluateAbnormalReturn(sourceSeries, sourceIndex, {
      benchmarkCloseByDate,
      corporateActionDates: params.corporateActionDates.get(event.code),
      ...(params.marketModel ? { marketModel: params.marketModel } : {}),
      implausibleSingleDayMovePct: implausiblePct,
      maxPriorGapDays,
      turnoverLookbackBars: lookback,
    });
    if (!sourceEval.ok) {
      reject(event.code, null, event.date, "source_guard_failed", sourceEval.reason);
      continue;
    }
    const sourceAbnormal = sourceEval.metrics.abnormalReturnPct;
    if (!(sourceAbnormal <= params.sourceAbnormalReturnThresholdPct)) {
      // 動いていない「事件」からは伝播を語れない。
      reject(event.code, null, event.date, "source_not_moved");
      continue;
    }

    const edges = (relations.get(event.code) ?? []).filter(
      (edge) => allowedTypes === null || allowedTypes.has(edge.relationType),
    );
    if (edges.length === 0) {
      reject(event.code, null, event.date, "no_relations");
      continue;
    }
    propagatedSourceCount += 1;

    for (const edge of edges) {
      const relatedSeries = securities.get(edge.code);
      if (!relatedSeries) {
        reject(event.code, edge.code, event.date, "related_price_unavailable");
        continue;
      }
      const relatedIndex = barIndexOf(relatedSeries, event.date);
      if (relatedIndex < 0) {
        reject(event.code, edge.code, event.date, "related_bar_missing");
        continue;
      }
      // B 社自身に説明のつく材料がある日は、伝播ではなく B 社の材料。
      if (params.knownEventDates.get(edge.code)?.has(event.date)) {
        reject(event.code, edge.code, event.date, "explained_by_own_event");
        continue;
      }

      const relatedEval = evaluateAbnormalReturn(relatedSeries, relatedIndex, {
        benchmarkCloseByDate,
        corporateActionDates: params.corporateActionDates.get(edge.code),
        ...(params.marketModel ? { marketModel: params.marketModel } : {}),
        implausibleSingleDayMovePct: implausiblePct,
        maxPriorGapDays,
        turnoverLookbackBars: lookback,
      });
      if (!relatedEval.ok) {
        reject(event.code, edge.code, event.date, "related_guard_failed", relatedEval.reason);
        continue;
      }
      const relatedMetrics = relatedEval.metrics;
      // 同方向（下落）のみ。逆方向はローテーションであって伝播ではない。
      if (!(relatedMetrics.abnormalReturnPct <= params.relatedAbnormalReturnThresholdPct)) {
        reject(event.code, edge.code, event.date, "related_not_moved");
        continue;
      }
      if (
        params.minAverageTurnoverJpy !== undefined
        && relatedMetrics.averageTurnoverJpy < params.minAverageTurnoverJpy
      ) {
        reject(event.code, edge.code, event.date, "below_min_turnover");
        continue;
      }

      const claimKey = `${edge.code}|${event.date}`;
      if (claimed.has(claimKey)) {
        // 同じ日に複数の事件から同じ銘柄へ辿り着いた場合、標本を二重計上しない。
        reject(event.code, edge.code, event.date, "duplicate_related_event");
        continue;
      }
      claimed.add(claimKey);

      candidates.push({
        candidateId: `ra-${event.code}-${edge.code}-${event.date}`,
        sourceCode: event.code,
        ...(event.label === undefined ? {} : { sourceLabel: event.label }),
        relatedCode: edge.code,
        relationType: edge.relationType,
        ...(edge.note === undefined ? {} : { relationNote: edge.note }),
        relationDerived: edge.derived,
        date: event.date,
        sourceAbnormalReturnPct: sourceAbnormal,
        relatedAbnormalReturnPct: relatedMetrics.abnormalReturnPct,
        propagationRatio: relatedMetrics.abnormalReturnPct / sourceAbnormal,
        relatedAverageTurnoverJpy: relatedMetrics.averageTurnoverJpy,
        observedAt: `${event.date}T${OBSERVED_TIME_JST}+09:00`,
        actualDamageAssessed: false,
        blockers: READ_ACROSS_BLOCKERS,
      });
    }
  }

  candidates.sort((left, right) =>
    left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0,
  );

  return {
    candidates,
    rejected,
    rejectedCounts,
    sourceEventCount: sourceEvents.length,
    propagatedSourceCount,
  };
}
