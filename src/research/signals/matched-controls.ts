// Research OS — matched drawdown control の構築 v1。
//
// 目的:
//   「事件で下げた銘柄は回復するのか」を測るには、
//   「同じくらい下げたが事件ではない銘柄」と比べる必要がある。
//   これが無いと、観測しているのが事件の効果なのか
//   単なる短期リバーサル（generic reversal）なのか区別できない。
//
// 既存 Edge の promotionGate が要求しているもの:
//   misconduct-overreaction-recovery.yml
//     counterfactualExplained: "matched drawdown、generic reversal、
//     外部事件venue control、同業不祥事control、正式イベントなしcaseとの比較が未実施"
//   本モジュールはこのうち matched drawdown / generic reversal を担う。
//
// 設計方針:
//   - 外部 IO を行わない。決定論的に同じ対照を選ぶ。
//   - 対照も treatment と同じガード（benchmark 調整・売買停止・
//     コーポレートアクション）を通す。基準が違うものを比べない。
//   - 対照が見つからなかった treatment を必ず報告する。
//     見つかった分だけで結論を出すと生存バイアスになる。
//   - 落とした理由を件数で返す。silent drop を作らない。
//
// 既知の限界:
//   対照の中に「まだ特定されていない事件」が混ざる可能性は排除できない。
//   その場合、事件群と対照群の差は**過小評価**される（保守的な方向）。
//   既知イベント日と treatment 自身は除外するが、それ以上は価格からは判定できない。

import type { PriceSeries } from "../backtest.js";
import {
  evaluateAbnormalReturn,
  type AbnormalReturnRejectReason,
} from "./abnormal-return.js";
import { calendarDaysBetween, assertAscendingBars, positiveDayLimit } from "./trading-calendar.js";

const DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT = -35;
const DEFAULT_MAX_PRIOR_GAP_DAYS = 10;
const DEFAULT_TURNOVER_LOOKBACK_BARS = 20;

export const MATCHED_CONTROL_REJECT_REASONS = [
  "same_code",
  "excluded_code",
  "excluded_sample",
  "is_treatment",
  "date_out_of_window",
  "explained_by_known_event",
  "guard_failed",
  "abnormal_return_out_of_band",
  "turnover_ratio_out_of_band",
  "sector_mismatch",
  "scale_mismatch",
  "attributes_unknown",
  "already_used",
] as const;

export type MatchedControlRejectReason = (typeof MATCHED_CONTROL_REJECT_REASONS)[number];

export interface TreatmentEvent {
  id: string;
  code: string;
  date: string;
  abnormalReturnPct: number;
  /** 対照の売買代金比を測る基準。未指定なら流動性で絞らない。 */
  averageTurnoverJpy?: number;
}

export interface MatchedControlParams {
  /** 対照の異常リターンが treatment の ±この % 以内であること。 */
  abnormalReturnTolerancePct: number;
  /** 対照日を treatment 日から ±この暦日以内で探す。0 なら同日のみ。 */
  maxDateOffsetDays: number;
  /** treatment 1件あたりに求める対照数。 */
  controlsPerTreatment: number;
  /** 同じ (code, date) を複数の treatment の対照に使ってよいか。 */
  allowReuse: boolean;
  knownEventDates: ReadonlyMap<string, ReadonlySet<string>>;
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** 対照から除外する銘柄。 */
  excludedCodes?: ReadonlySet<string>;
  /**
   * 対照から除外する (code, date) の集合。キー形式は `code|date`。
   * 原因が特定できていない下落を対照に混ぜると、
   * それが実は研究対象の事件だった場合に差が過小評価される。
   * 銘柄ごとではなく日付単位で外したいときに使う。
   */
  excludedSampleKeys?: ReadonlySet<string>;
  /** 対照の売買代金が treatment の何倍までを許すか [min, max]。 */
  turnoverRatioBand?: readonly [number, number];
  /**
   * code -> 業種・規模区分。銘柄マスタ（`/equities/master`）から渡す。
   *
   * ロードマップ §7 が「規模・業種でそろえた対照が要る段階になったら、
   * その machinery を別に作ること」と書いていた部分。マスタを取り込んで
   * 作れるようになった。
   */
  attributes?: ReadonlyMap<string, { sector33: string; scaleCategory: string }>;
  /** 対照を同じ33業種に限る。`attributes` が要る。 */
  requireSameSector33?: boolean;
  /** 対照を同じ規模区分に限る。`attributes` が要る。 */
  requireSameScaleCategory?: boolean;
  implausibleSingleDayMovePct?: number;
  maxPriorGapDays?: number;
  turnoverLookbackBars?: number;
}

export interface MatchedControl {
  treatmentId: string;
  treatmentCode: string;
  treatmentDate: string;
  treatmentAbnormalReturnPct: number;
  controlCode: string;
  controlDate: string;
  controlAbnormalReturnPct: number;
  /** treatment との異常リターン差の絶対値。小さいほど良い対照。 */
  abnormalReturnGapPct: number;
  dateOffsetDays: number;
  controlAverageTurnoverJpy: number;
  turnoverRatio: number | null;
}

export interface MatchedControlResult {
  matches: MatchedControl[];
  /** 対照が1件も見つからなかった treatment。生存バイアスを避けるため必ず出す。 */
  unmatchedTreatmentIds: string[];
  /** 要求数に届かなかった treatment。 */
  partiallyMatched: Array<{ treatmentId: string; found: number; requested: number }>;
  treatmentCount: number;
  candidateEvaluations: number;
  rejectedCounts: Record<MatchedControlRejectReason, number>;
}

function emptyRejectedCounts(): Record<MatchedControlRejectReason, number> {
  const counts = {} as Record<MatchedControlRejectReason, number>;
  for (const reason of MATCHED_CONTROL_REJECT_REASONS) counts[reason] = 0;
  return counts;
}

function assertParams(params: MatchedControlParams): void {
  if (!Number.isFinite(params.abnormalReturnTolerancePct) || params.abnormalReturnTolerancePct <= 0) {
    throw new Error(
      `abnormalReturnTolerancePct must be a positive finite number: ${params.abnormalReturnTolerancePct}`,
    );
  }
  if (!Number.isSafeInteger(params.maxDateOffsetDays) || params.maxDateOffsetDays < 0) {
    throw new Error(`maxDateOffsetDays must be a non-negative safe integer: ${params.maxDateOffsetDays}`);
  }
  if (!Number.isSafeInteger(params.controlsPerTreatment) || params.controlsPerTreatment < 1) {
    throw new Error(`controlsPerTreatment must be a positive safe integer: ${params.controlsPerTreatment}`);
  }
  if ((params.requireSameSector33 || params.requireSameScaleCategory) && !params.attributes) {
    throw new Error(
      "requireSameSector33 / requireSameScaleCategory には attributes が必要です"
      + "（銘柄マスタを取り込んで渡してください）",
    );
  }
  if (params.turnoverRatioBand) {
    const [min, max] = params.turnoverRatioBand;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
      throw new Error(`turnoverRatioBand must be [min, max] with 0 < min <= max`);
    }
  }
  positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
  positiveDayLimit(params.turnoverLookbackBars, DEFAULT_TURNOVER_LOOKBACK_BARS, "turnoverLookbackBars");
}

/**
 * 各 treatment に対して、同程度の異常下落を示したが事件ではない (code, date) を選ぶ。
 *
 * 選定は決定論的。異常リターン差 → 日付差 → コードの順で昇順に並べ、上位を採る。
 */
export function buildMatchedControls(
  treatments: readonly TreatmentEvent[],
  securities: ReadonlyMap<string, PriceSeries>,
  benchmark: PriceSeries,
  params: MatchedControlParams,
): MatchedControlResult {
  assertParams(params);
  assertAscendingBars(benchmark);
  for (const series of securities.values()) assertAscendingBars(series);

  const maxPriorGapDays = positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
  const lookback = positiveDayLimit(params.turnoverLookbackBars, DEFAULT_TURNOVER_LOOKBACK_BARS, "turnoverLookbackBars");
  const implausiblePct = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;
  const benchmarkCloseByDate = new Map(benchmark.bars.map((bar) => [bar.date, bar.close]));

  // treatment として使われた (code, date) は対照にしない。
  const treatmentKeys = new Set(treatments.map((one) => `${one.code}|${one.date}`));

  const matches: MatchedControl[] = [];
  const unmatchedTreatmentIds: string[] = [];
  const partiallyMatched: MatchedControlResult["partiallyMatched"] = [];
  const rejectedCounts = emptyRejectedCounts();
  const usedControlKeys = new Set<string>();
  let candidateEvaluations = 0;

  const orderedTreatments = [...treatments].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const orderedCodes = [...securities.keys()].sort();

  for (const treatment of orderedTreatments) {
    const pool: MatchedControl[] = [];

    for (const code of orderedCodes) {
      if (code === treatment.code) { rejectedCounts.same_code += 1; continue; }
      if (params.excludedCodes?.has(code)) { rejectedCounts.excluded_code += 1; continue; }
      const series = securities.get(code)!;

      for (let index = 0; index < series.bars.length; index += 1) {
        const bar = series.bars[index];
        const offset = Math.abs(calendarDaysBetween(treatment.date, bar.date));
        if (offset > params.maxDateOffsetDays) { rejectedCounts.date_out_of_window += 1; continue; }

        candidateEvaluations += 1;
        const key = `${code}|${bar.date}`;

        if (treatmentKeys.has(key)) { rejectedCounts.is_treatment += 1; continue; }
        if (params.excludedSampleKeys?.has(key)) {
          rejectedCounts.excluded_sample += 1;
          continue;
        }
        if (params.knownEventDates.get(code)?.has(bar.date)) {
          rejectedCounts.explained_by_known_event += 1;
          continue;
        }
        if (!params.allowReuse && usedControlKeys.has(key)) {
          rejectedCounts.already_used += 1;
          continue;
        }

        const evaluation = evaluateAbnormalReturn(series, index, {
          benchmarkCloseByDate,
          corporateActionDates: params.corporateActionDates.get(code),
          implausibleSingleDayMovePct: implausiblePct,
          maxPriorGapDays,
          turnoverLookbackBars: lookback,
        });
        if (!evaluation.ok) { rejectedCounts.guard_failed += 1; continue; }
        const metrics = evaluation.metrics;

        const gap = Math.abs(metrics.abnormalReturnPct - treatment.abnormalReturnPct);
        if (gap > params.abnormalReturnTolerancePct) {
          rejectedCounts.abnormal_return_out_of_band += 1;
          continue;
        }

        // 業種・規模でそろえる。**属性が分からない銘柄は対照にしない。**
        // 「分からない」を「一致する」として通すと、そろえたつもりで
        // そろっていない対照が混ざる。
        if (params.requireSameSector33 || params.requireSameScaleCategory) {
          const treatmentAttributes = params.attributes?.get(treatment.code);
          const controlAttributes = params.attributes?.get(code);
          if (!treatmentAttributes || !controlAttributes) {
            rejectedCounts.attributes_unknown += 1;
            continue;
          }
          if (params.requireSameSector33
            && treatmentAttributes.sector33 !== controlAttributes.sector33) {
            rejectedCounts.sector_mismatch += 1;
            continue;
          }
          if (params.requireSameScaleCategory
            && treatmentAttributes.scaleCategory !== controlAttributes.scaleCategory) {
            rejectedCounts.scale_mismatch += 1;
            continue;
          }
        }

        let turnoverRatio: number | null = null;
        if (treatment.averageTurnoverJpy !== undefined && treatment.averageTurnoverJpy > 0) {
          turnoverRatio = metrics.averageTurnoverJpy / treatment.averageTurnoverJpy;
          if (params.turnoverRatioBand) {
            const [min, max] = params.turnoverRatioBand;
            if (turnoverRatio < min || turnoverRatio > max) {
              rejectedCounts.turnover_ratio_out_of_band += 1;
              continue;
            }
          }
        }

        pool.push({
          treatmentId: treatment.id,
          treatmentCode: treatment.code,
          treatmentDate: treatment.date,
          treatmentAbnormalReturnPct: treatment.abnormalReturnPct,
          controlCode: code,
          controlDate: bar.date,
          controlAbnormalReturnPct: metrics.abnormalReturnPct,
          abnormalReturnGapPct: gap,
          dateOffsetDays: offset,
          controlAverageTurnoverJpy: metrics.averageTurnoverJpy,
          turnoverRatio,
        });
      }
    }

    // 決定論的に選ぶ: 異常リターン差 → 日付差 → コード → 日付
    pool.sort((left, right) => {
      if (left.abnormalReturnGapPct !== right.abnormalReturnGapPct) {
        return left.abnormalReturnGapPct - right.abnormalReturnGapPct;
      }
      if (left.dateOffsetDays !== right.dateOffsetDays) return left.dateOffsetDays - right.dateOffsetDays;
      if (left.controlCode !== right.controlCode) return left.controlCode < right.controlCode ? -1 : 1;
      return left.controlDate < right.controlDate ? -1 : left.controlDate > right.controlDate ? 1 : 0;
    });

    const selected = pool.slice(0, params.controlsPerTreatment);
    for (const control of selected) {
      matches.push(control);
      if (!params.allowReuse) usedControlKeys.add(`${control.controlCode}|${control.controlDate}`);
    }
    if (selected.length === 0) {
      unmatchedTreatmentIds.push(treatment.id);
    } else if (selected.length < params.controlsPerTreatment) {
      partiallyMatched.push({
        treatmentId: treatment.id,
        found: selected.length,
        requested: params.controlsPerTreatment,
      });
    }
  }

  return {
    matches,
    unmatchedTreatmentIds,
    partiallyMatched,
    treatmentCount: treatments.length,
    candidateEvaluations,
    rejectedCounts,
  };
}

export type { AbnormalReturnRejectReason };
