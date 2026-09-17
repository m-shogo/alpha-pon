// Research OS — 業績予想の上方修正イベント。
//
// 事前登録: docs/research/preregistrations/2026-09-17-forecast-revision-up.md
// **条件をここで変えない。** 変えるなら新しい事前登録を書き、別の試行として数える。
//
//   対象   DocType = EarnForecastRevision
//   基準   同じ会計年度末について、開示時刻が厳密に前の最新の営業利益予想
//          （決算ギャップと同じ `forecastBaselinesFor`）
//   条件   基準 > 0 かつ 修正後 ≥ 基準 × minRevisionRatio
//   時刻   反応日の引けで観測（引け前の開示は当日、引け以降は翌営業日が反応日）
//
// 外部 IO なし。落とした開示は理由つきで数える（silent drop を作らない）。

import type { BacktestSignal, PriceSeries } from "../backtest.js";
import { jstDateOf } from "../pit.js";
import {
  compareExplicitIso8601Instants,
} from "../iso-instant.js";
import {
  DEFAULT_EXCLUDED_DOCUMENT_TYPE_PATTERNS,
  FORECAST_REVISION_DOCUMENT_TYPE,
  REACTION_OBSERVED_TIME_JST,
  disclosedAtIso,
  forecastBaselinesFor,
  indexOfReactionBar,
  type EarningsDisclosureInput,
} from "./earnings-gap.js";
import {
  assertAscendingBars,
  calendarDaysBetween,
  positiveDayLimit,
} from "./trading-calendar.js";

export const FORECAST_REVISION_REJECT_REASONS = [
  "invalid_disclosed_timestamp",
  "not_forecast_revision",
  "forecast_missing",
  "baseline_missing",
  "baseline_not_positive",
  "revision_below_threshold",
  "no_price_series",
  "no_reaction_bar",
  "no_prior_bar",
  "reaction_bar_too_far",
  "prior_bar_too_far",
  "corporate_action_in_window",
  "duplicate_reaction_date",
] as const;

export type ForecastRevisionRejectReason = (typeof FORECAST_REVISION_REJECT_REASONS)[number];

export interface ForecastRevisionParams {
  /** 修正後 / 基準 の下限。1 より大きい値のみ（上方修正）。事前登録では 1.10。 */
  minRevisionRatio: number;
  /** code -> 株式分割・併合の効力発生日。空 Map は「情報が無い」。 */
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** 開示日から反応日までの暦日数の上限。既定 10（決算ギャップと同じ）。 */
  maxReactionLagDays?: number;
  /** 前営業日と反応日の暦日数の上限。既定 10（決算ギャップと同じ）。 */
  maxPriorGapDays?: number;
}

export interface ForecastRevisionCandidate {
  signalId: string;
  code: string;
  disclosedAt: string;
  reactionDate: string;
  priorCloseDate: string;
  revisedForecastOperatingProfit: number;
  baselineForecastOperatingProfit: number;
  baselineDisclosedAt: string;
  revisionRatio: number;
  observedAt: string;
}

export interface ForecastRevisionRejection {
  code: string;
  disclosedDate: string;
  disclosedTime: string;
  reason: ForecastRevisionRejectReason;
}

export interface ForecastRevisionResult {
  signals: BacktestSignal[];
  candidates: ForecastRevisionCandidate[];
  rejected: ForecastRevisionRejection[];
  rejectedCounts: Record<ForecastRevisionRejectReason, number>;
  disclosureCount: number;
}

const DEFAULT_MAX_REACTION_LAG_DAYS = 10;
const DEFAULT_MAX_PRIOR_GAP_DAYS = 10;
const CODE_PATTERN = /^[0-9A-Z]{4,5}$/;

function assertParams(params: ForecastRevisionParams): void {
  if (!Number.isFinite(params.minRevisionRatio) || params.minRevisionRatio <= 1) {
    throw new Error(`minRevisionRatio must be a finite number above 1: ${params.minRevisionRatio}`);
  }
  positiveDayLimit(params.maxReactionLagDays, DEFAULT_MAX_REACTION_LAG_DAYS, "maxReactionLagDays");
  positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
}

/**
 * 業績予想の上方修正からシグナルを作る。
 *
 * `disclosures` には決算短信も含めて渡すこと。基準の予想は決算短信から引く。
 * 同じ銘柄・同じ反応日に複数の修正があれば、開示時刻の早いものを1件だけ使う。
 */
export function detectForecastRevisionEvents(
  disclosures: readonly EarningsDisclosureInput[],
  prices: ReadonlyMap<string, PriceSeries>,
  params: ForecastRevisionParams,
): ForecastRevisionResult {
  assertParams(params);
  for (const series of prices.values()) assertAscendingBars(series);
  const maxReactionLagDays = positiveDayLimit(
    params.maxReactionLagDays, DEFAULT_MAX_REACTION_LAG_DAYS, "maxReactionLagDays",
  );
  const maxPriorGapDays = positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");

  const signals: BacktestSignal[] = [];
  const candidates: ForecastRevisionCandidate[] = [];
  const rejected: ForecastRevisionRejection[] = [];
  const rejectedCounts = Object.fromEntries(
    FORECAST_REVISION_REJECT_REASONS.map((reason) => [reason, 0]),
  ) as Record<ForecastRevisionRejectReason, number>;
  const reject = (input: EarningsDisclosureInput, reason: ForecastRevisionRejectReason): void => {
    rejected.push({
      code: input.code,
      disclosedDate: input.disclosedDate,
      disclosedTime: input.disclosedTime,
      reason,
    });
    rejectedCounts[reason] += 1;
  };

  const normalized = disclosures.map((disclosure) => {
    const code = disclosure.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      throw new Error(`forecast revision code must be 4-5 alphanumeric characters: ${disclosure.code}`);
    }
    return { ...disclosure, code };
  });
  const baselines = forecastBaselinesFor(normalized, DEFAULT_EXCLUDED_DOCUMENT_TYPE_PATTERNS);

  // 早い開示から処理する。同じ反応日の重複は先に来た方を残す。
  const order = normalized
    .map((disclosure, index) => ({ disclosure, index, iso: disclosedAtIso(disclosure) }))
    .sort((left, right) => {
      if (left.iso === null || right.iso === null) {
        if (left.iso === right.iso) return left.index - right.index;
        return left.iso === null ? 1 : -1;
      }
      return compareExplicitIso8601Instants(left.iso, right.iso, "left disclosedAt", "right disclosedAt")
        || (left.disclosure.code < right.disclosure.code ? -1 : left.disclosure.code > right.disclosure.code ? 1 : 0)
        || left.index - right.index;
    });

  const claimed = new Set<string>();
  for (const { disclosure, index, iso } of order) {
    if (iso === null) { reject(disclosure, "invalid_disclosed_timestamp"); continue; }
    if (disclosure.typeOfDocument !== FORECAST_REVISION_DOCUMENT_TYPE) {
      reject(disclosure, "not_forecast_revision");
      continue;
    }
    const revised = disclosure.forecastOperatingProfit;
    if (revised === null) { reject(disclosure, "forecast_missing"); continue; }
    const baseline = baselines[index]!;
    if (baseline === null) { reject(disclosure, "baseline_missing"); continue; }
    if (!(baseline.value > 0)) { reject(disclosure, "baseline_not_positive"); continue; }
    // 比で比べる。「revised >= baseline * ratio」と書くと、100 * 1.1 が
    // 110.00000000000001 になって（実測）、ちょうど +10% の修正が落ちる。
    const ratio = revised / baseline.value;
    if (!(ratio >= params.minRevisionRatio)) { reject(disclosure, "revision_below_threshold"); continue; }

    const series = prices.get(disclosure.code);
    if (!series || series.bars.length === 0) { reject(disclosure, "no_price_series"); continue; }
    const disclosedDate = jstDateOf(iso);
    const reactionIndex = indexOfReactionBar(series.bars, disclosedDate, iso);
    if (reactionIndex < 0) { reject(disclosure, "no_reaction_bar"); continue; }
    if (reactionIndex === 0) { reject(disclosure, "no_prior_bar"); continue; }
    const reactionBar = series.bars[reactionIndex]!;
    const priorBar = series.bars[reactionIndex - 1]!;
    if (calendarDaysBetween(disclosedDate, reactionBar.date) > maxReactionLagDays) {
      reject(disclosure, "reaction_bar_too_far");
      continue;
    }
    if (calendarDaysBetween(priorBar.date, reactionBar.date) > maxPriorGapDays) {
      reject(disclosure, "prior_bar_too_far");
      continue;
    }
    const actionDates = params.corporateActionDates.get(disclosure.code);
    if (actionDates && (actionDates.has(reactionBar.date) || actionDates.has(priorBar.date))) {
      reject(disclosure, "corporate_action_in_window");
      continue;
    }
    const claimKey = `${disclosure.code}|${reactionBar.date}`;
    if (claimed.has(claimKey)) { reject(disclosure, "duplicate_reaction_date"); continue; }
    claimed.add(claimKey);

    const signalId = `fr-${disclosure.code}-${reactionBar.date}`;
    const observedAt = `${reactionBar.date}T${REACTION_OBSERVED_TIME_JST}+09:00`;
    signals.push({ id: signalId, code: disclosure.code, observedAt });
    candidates.push({
      signalId,
      code: disclosure.code,
      disclosedAt: iso,
      reactionDate: reactionBar.date,
      priorCloseDate: priorBar.date,
      revisedForecastOperatingProfit: revised,
      baselineForecastOperatingProfit: baseline.value,
      baselineDisclosedAt: baseline.disclosedAt,
      revisionRatio: ratio,
      observedAt,
    });
  }

  signals.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  candidates.sort((left, right) =>
    left.signalId < right.signalId ? -1 : left.signalId > right.signalId ? 1 : 0);
  return { signals, candidates, rejected, rejectedCounts, disclosureCount: disclosures.length };
}
