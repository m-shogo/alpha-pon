// Research OS — 決算ギャップ Signal Generator v1。
//
// 目的:
//   決算開示のあと大きく下落したが、会社予想（営業利益）が減額されていない銘柄を
//   BacktestSignal として抽出する。過剰反応の平均回帰を検証するための入力を作る。
//
// 設計方針:
//   - 外部 IO を一切行わない。価格も開示も注入する（deterministic / テスト可能）。
//   - PIT を守る。判断に使える情報が確定した時刻を observedAt にする。
//     反応日 R の終値を条件に使うので observedAt は R の引け(15:30 JST)。
//     Backtest 側の next_open は R の翌営業日の寄付でエントリーする。
//   - 判定できない開示は「通す」のではなく理由付きで落とす（fail closed）。
//   - 落とした理由を必ず件数で返す。silent drop を作らない。
//
// コーポレートアクションに関する重要な前提:
//   PIT Price Store は現在 **未調整(raw)** の bar を保存する
//   (`jquants-free-unadjusted-v1` / `adjusted: false`)。
//   未調整のまま終値比を取ると、株式分割が偽のギャップになる（1:2 分割 = -50%）。
//   そのため本モジュールは 2 段構えで防ぐ。
//     1. `corporateActionDates` に該当日があれば落とす（正攻法）
//     2. 単日で物理的にありえない下落幅を落とす（保険。値幅制限を超える動きは
//        コーポレートアクションか異常データであり、業績反応ではない）
//   1 は呼び出し側がコーポレートアクション情報を渡せて初めて機能する。
//   provider が `adjustmentFactor` を捨てている間は 2 だけが効く点に注意する。

import type { BacktestSignal, PriceBar, PriceSeries } from "../backtest.js";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "../iso-instant.js";
import { jstDateOf } from "../pit.js";
import { jquantsTradingDayCloseJst } from "../providers/jquants-free.js";
import {
  assertAscendingBars,
  calendarDaysBetween,
  positiveDayLimit,
} from "./trading-calendar.js";

/** 反応日の引け。この時刻の情報で当日引けエントリはできない（pit.ts の TSE_CLOSE_JST_MINUTES と一致）。 */
const REACTION_OBSERVED_TIME_JST = "15:30:00";

/** 決算短信以外（訂正・予想修正）を既定で除外する。実値は J-Quants 接続後に要確認。 */
export const DEFAULT_EXCLUDED_DOCUMENT_TYPE_PATTERNS = [
  "訂正",
  "Revision",
  "Revised",
  "Correction",
] as const;

export const EARNINGS_GAP_REJECT_REASONS = [
  "document_type_excluded",
  "invalid_disclosed_timestamp",
  "duplicate_disclosure",
  "duplicate_reaction_date",
  "no_price_series",
  "no_reaction_bar",
  "no_prior_bar",
  "non_positive_prior_close",
  "gap_not_deep_enough",
  "reaction_bar_too_far",
  "prior_bar_too_far",
  "implausible_single_day_move",
  "corporate_action_in_window",
  "forecast_missing",
  "forecast_cut",
] as const;

export type EarningsGapRejectReason = (typeof EARNINGS_GAP_REJECT_REASONS)[number];

export interface EarningsDisclosureInput {
  code: string;
  /** JST の開示日 YYYY-MM-DD */
  disclosedDate: string;
  /** JST の開示時刻 HH:MM または HH:MM:SS */
  disclosedTime: string;
  /** 会社予想の営業利益。null は「取得できなかった」であり 0 ではない。 */
  forecastOperatingProfit: number | null;
  typeOfDocument: string;
}

export interface EarningsGapParams {
  /** 反応日終値が前営業日終値比でこの % 以下なら候補にする。負の値のみ。例: -7 */
  gapThresholdPct: number;
  /** 直前開示より会社予想営業利益が減額されていたら除外する */
  requireForecastNotCut: boolean;
  /** 除外する typeOfDocument の部分一致パターン */
  excludedDocumentTypePatterns?: readonly string[];
  /**
   * code -> コーポレートアクションが発生した取引日の集合。
   * 空 Map は「発生していない」ではなく「情報が無い」を意味する。
   * 呼び出し側に明示的な判断を強制するため必須にしている。
   */
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * 単日でこの % 以下の下落は業績反応ではないとみなして落とす。既定 -35。
   * 東証の値幅制限を超える下落は分割・併合・異常データのいずれかである。
   */
  implausibleSingleDayMovePct?: number;
  /**
   * 開示日から反応日までの暦日数の上限。既定 10。
   * 売買停止明けの初値は「決算への反応」ではなく停止期間中の全材料の反映なので落とす。
   * 年末年始・GW の連休(最長でも約9日)は通す。
   */
  maxReactionLagDays?: number;
  /**
   * 前営業日終値と反応日の暦日数の上限。既定 10。
   * 基準となる終値が古いと、ギャップが停止期間の累積変化になってしまう。
   */
  maxPriorGapDays?: number;
}

export interface EarningsGapCandidate {
  signalId: string;
  code: string;
  disclosedAt: string;
  reactionDate: string;
  priorCloseDate: string;
  priorClose: number;
  reactionClose: number;
  gapPct: number;
  forecastOperatingProfit: number | null;
  previousForecastOperatingProfit: number | null;
  observedAt: string;
}

export interface EarningsGapRejection {
  code: string;
  disclosedDate: string;
  disclosedTime: string;
  reason: EarningsGapRejectReason;
}

export interface EarningsGapResult {
  signals: BacktestSignal[];
  candidates: EarningsGapCandidate[];
  rejected: EarningsGapRejection[];
  rejectedCounts: Record<EarningsGapRejectReason, number>;
  disclosureCount: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const CODE_PATTERN = /^[0-9A-Z]{4,5}$/;

function emptyRejectedCounts(): Record<EarningsGapRejectReason, number> {
  const counts = {} as Record<EarningsGapRejectReason, number>;
  for (const reason of EARNINGS_GAP_REJECT_REASONS) counts[reason] = 0;
  return counts;
}

function normalizedDisclosedTime(value: string): string | null {
  const matched = TIME_PATTERN.exec(value.trim());
  if (!matched) return null;
  const [, hour, minute, second = "00"] = matched;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  return `${hour}:${minute}:${second}`;
}

/** 開示日時を明示タイムゾーン付き ISO へ変換する。解釈できない値は null を返して落とす。 */
function disclosedAtIso(input: EarningsDisclosureInput): string | null {
  if (!ISO_DATE_PATTERN.test(input.disclosedDate.trim())) return null;
  const time = normalizedDisclosedTime(input.disclosedTime);
  if (!time) return null;
  const iso = `${input.disclosedDate.trim()}T${time}+09:00`;
  try {
    parseExplicitIso8601Instant(iso, "earnings disclosure disclosedAt");
  } catch {
    return null;
  }
  // 暦上ありえない日付は Date が別日へ丸めるため、往復で一致を確認する。
  return jstDateOf(iso) === input.disclosedDate.trim() ? iso : null;
}

/**
 * 反応日のバーを選ぶ。
 *
 * **引け前の開示は当日、引け以降は翌営業日。**
 *
 * かつては常に翌営業日にしていた（「場中開示でも当日の値動きは使わない」）。
 * だが10時の開示なら当日の終値がまさに反応であり、しかも開示は終値より前なので
 * look-ahead にはならない。常に翌日にすると、**反応でない日を反応として測る。**
 * 実測（2026-09-12・決算開示37,696件）で引け前の開示は **26.1%**。
 *
 * 逆に引け「ちょうど」は引け後として扱う。終値は引けの板で決まるので
 * 同時刻の開示はその終値に入らない。実測で引け時刻ちょうどが **44.0%**。
 */
function indexOfReactionBar(
  bars: PriceBar[],
  disclosedDate: string,
  disclosedAt: string,
): number {
  const closeAt = jquantsTradingDayCloseJst(disclosedDate);
  const beforeClose =
    compareExplicitIso8601Instants(disclosedAt, closeAt, "disclosedAt", "close") < 0;
  return beforeClose
    ? bars.findIndex((bar) => bar.date >= disclosedDate)
    : bars.findIndex((bar) => bar.date > disclosedDate);
}

const DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT = -35;
const DEFAULT_MAX_REACTION_LAG_DAYS = 10;
const DEFAULT_MAX_PRIOR_GAP_DAYS = 10;



function assertParams(params: EarningsGapParams): void {
  if (!Number.isFinite(params.gapThresholdPct) || params.gapThresholdPct >= 0) {
    throw new Error(`gapThresholdPct must be a negative finite number: ${params.gapThresholdPct}`);
  }
  const implausible = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;
  if (!Number.isFinite(implausible) || implausible >= 0) {
    throw new Error(`implausibleSingleDayMovePct must be a negative finite number: ${implausible}`);
  }
  if (implausible >= params.gapThresholdPct) {
    throw new Error(
      `implausibleSingleDayMovePct (${implausible}) must be below gapThresholdPct (${params.gapThresholdPct})`,
    );
  }
  positiveDayLimit(params.maxReactionLagDays, DEFAULT_MAX_REACTION_LAG_DAYS, "maxReactionLagDays");
  positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays");
}

/**
 * PIT record からコーポレートアクション発生日を取り出す。
 *
 * 注意: 現行の jquants-free provider は `adjustmentFactor` を常に 1 で保存するため、
 * この関数は分割を検出できない。provider が実値を保存するまでは
 * `implausibleSingleDayMovePct` の保険側だけが効く。
 */
export function corporateActionDatesFromPriceRecords(
  records: Iterable<{
    code: string;
    tradingDate: string;
    adjustmentFactor: number;
    corporateActions: readonly unknown[];
  }>,
): Map<string, Set<string>> {
  const byCode = new Map<string, Set<string>>();
  for (const record of records) {
    const hasAction = record.corporateActions.length > 0 || record.adjustmentFactor !== 1;
    if (!hasAction) continue;
    const dates = byCode.get(record.code) ?? new Set<string>();
    dates.add(record.tradingDate);
    byCode.set(record.code, dates);
  }
  return byCode;
}

function isExcludedDocumentType(typeOfDocument: string, patterns: readonly string[]): boolean {
  const value = typeOfDocument.toLowerCase();
  return patterns.some((pattern) => value.includes(pattern.toLowerCase()));
}

/**
 * 決算開示から決算ギャップ Signal を生成する。
 *
 * 同一 code の開示は開示時刻昇順で処理し、直前開示の会社予想を baseline にする。
 * 除外した開示は baseline を更新しない（訂正で baseline が動くと減額判定がぶれるため）。
 */
export function generateEarningsGapSignals(
  disclosures: readonly EarningsDisclosureInput[],
  prices: ReadonlyMap<string, PriceSeries>,
  params: EarningsGapParams,
): EarningsGapResult {
  assertParams(params);
  const excludedPatterns = params.excludedDocumentTypePatterns ?? DEFAULT_EXCLUDED_DOCUMENT_TYPE_PATTERNS;

  for (const series of prices.values()) assertAscendingBars(series);

  const signals: BacktestSignal[] = [];
  const candidates: EarningsGapCandidate[] = [];
  const rejected: EarningsGapRejection[] = [];
  const rejectedCounts = emptyRejectedCounts();

  const reject = (input: EarningsDisclosureInput, reason: EarningsGapRejectReason): void => {
    rejected.push({
      code: input.code,
      disclosedDate: input.disclosedDate,
      disclosedTime: input.disclosedTime,
      reason,
    });
    rejectedCounts[reason] += 1;
  };

  const byCode = new Map<string, EarningsDisclosureInput[]>();
  for (const disclosure of disclosures) {
    const code = disclosure.code.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      throw new Error(`earnings disclosure code must be 4-5 alphanumeric characters: ${disclosure.code}`);
    }
    const bucket = byCode.get(code);
    if (bucket) bucket.push({ ...disclosure, code });
    else byCode.set(code, [{ ...disclosure, code }]);
  }

  const claimedReactionKeys = new Set<string>();

  for (const code of [...byCode.keys()].sort()) {
    const codeDisclosures = byCode.get(code)!;
    const resolved = codeDisclosures.map((disclosure) => ({
      disclosure,
      iso: disclosedAtIso(disclosure),
    }));

    // 開示時刻昇順。解釈できない行は末尾へ寄せて、baseline 計算から確実に外す。
    resolved.sort((left, right) => {
      if (left.iso === null && right.iso === null) return 0;
      if (left.iso === null) return 1;
      if (right.iso === null) return -1;
      if (left.iso !== right.iso) return left.iso < right.iso ? -1 : 1;
      return left.disclosure.typeOfDocument < right.disclosure.typeOfDocument ? -1 : 1;
    });

    const seenDisclosureKeys = new Set<string>();
    let previousForecast: number | null = null;
    let hasPreviousDisclosure = false;

    for (const { disclosure, iso } of resolved) {
      if (iso === null) {
        reject(disclosure, "invalid_disclosed_timestamp");
        continue;
      }
      if (isExcludedDocumentType(disclosure.typeOfDocument, excludedPatterns)) {
        reject(disclosure, "document_type_excluded");
        continue;
      }

      const disclosureKey = `${iso}|${disclosure.typeOfDocument}`;
      if (seenDisclosureKeys.has(disclosureKey)) {
        reject(disclosure, "duplicate_disclosure");
        continue;
      }
      seenDisclosureKeys.add(disclosureKey);

      const baselineForecast = previousForecast;
      const baselineExists = hasPreviousDisclosure;
      previousForecast = disclosure.forecastOperatingProfit;
      hasPreviousDisclosure = true;

      const series = prices.get(code);
      if (!series || series.bars.length === 0) {
        reject(disclosure, "no_price_series");
        continue;
      }

      const disclosedDate = jstDateOf(iso);
      const reactionIndex = indexOfReactionBar(series.bars, disclosedDate, iso);
      if (reactionIndex < 0) {
        reject(disclosure, "no_reaction_bar");
        continue;
      }
      if (reactionIndex === 0) {
        reject(disclosure, "no_prior_bar");
        continue;
      }

      const reactionBar = series.bars[reactionIndex];
      const priorBar = series.bars[reactionIndex - 1];
      if (!(priorBar.close > 0)) {
        reject(disclosure, "non_positive_prior_close");
        continue;
      }

      // 売買停止・上場後の空白などで反応日や基準終値が離れている場合、
      // 観測しているのは決算への反応ではないので落とす。
      const reactionLagDays = calendarDaysBetween(disclosedDate, reactionBar.date);
      if (reactionLagDays > positiveDayLimit(params.maxReactionLagDays, DEFAULT_MAX_REACTION_LAG_DAYS, "maxReactionLagDays")) {
        reject(disclosure, "reaction_bar_too_far");
        continue;
      }
      const priorGapDays = calendarDaysBetween(priorBar.date, reactionBar.date);
      if (priorGapDays > positiveDayLimit(params.maxPriorGapDays, DEFAULT_MAX_PRIOR_GAP_DAYS, "maxPriorGapDays")) {
        reject(disclosure, "prior_bar_too_far");
        continue;
      }

      const gapPct = ((reactionBar.close - priorBar.close) / priorBar.close) * 100;
      if (!(gapPct <= params.gapThresholdPct)) {
        reject(disclosure, "gap_not_deep_enough");
        continue;
      }

      const actionDates = params.corporateActionDates.get(code);
      if (actionDates && (actionDates.has(reactionBar.date) || actionDates.has(priorBar.date))) {
        reject(disclosure, "corporate_action_in_window");
        continue;
      }

      const implausiblePct = params.implausibleSingleDayMovePct ?? DEFAULT_IMPLAUSIBLE_SINGLE_DAY_MOVE_PCT;
      if (gapPct <= implausiblePct) {
        reject(disclosure, "implausible_single_day_move");
        continue;
      }

      if (params.requireForecastNotCut) {
        if (!baselineExists || baselineForecast === null || disclosure.forecastOperatingProfit === null) {
          reject(disclosure, "forecast_missing");
          continue;
        }
        if (disclosure.forecastOperatingProfit < baselineForecast) {
          reject(disclosure, "forecast_cut");
          continue;
        }
      }

      const reactionKey = `${code}|${reactionBar.date}`;
      if (claimedReactionKeys.has(reactionKey)) {
        reject(disclosure, "duplicate_reaction_date");
        continue;
      }
      claimedReactionKeys.add(reactionKey);

      const signalId = `eg-${code}-${reactionBar.date}`;
      const observedAt = `${reactionBar.date}T${REACTION_OBSERVED_TIME_JST}+09:00`;

      signals.push({ id: signalId, code, observedAt });
      candidates.push({
        signalId,
        code,
        disclosedAt: iso,
        reactionDate: reactionBar.date,
        priorCloseDate: priorBar.date,
        priorClose: priorBar.close,
        reactionClose: reactionBar.close,
        gapPct,
        forecastOperatingProfit: disclosure.forecastOperatingProfit,
        previousForecastOperatingProfit: baselineExists ? baselineForecast : null,
        observedAt,
      });
    }
  }

  signals.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  candidates.sort((left, right) => (left.signalId < right.signalId ? -1 : left.signalId > right.signalId ? 1 : 0));

  return {
    signals,
    candidates,
    rejected,
    rejectedCounts,
    disclosureCount: disclosures.length,
  };
}
