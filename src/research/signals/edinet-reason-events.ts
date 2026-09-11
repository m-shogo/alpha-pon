/**
 * EDINET の臨時報告書から、価格イベントの対象を作る。
 *
 * ## 何を測るためのものか
 *
 * 「特定の事由で臨時報告書が出た銘柄は、そのあとどう動くか」。
 * F1（価格から逆引き）と違い、**値動きの大きさを条件にしない。**
 * 事由が起きた事実だけで母集団を作る。
 *
 * ## 反応日の決め方
 *
 * 提出が引け前なら当日、引け後なら翌営業日。EDINET の `submitDateTime` は
 * 分単位まであるので、そこで分ける。ここを雑にすると、事件の翌日の
 * 値動きを事件当日と数える（または逆）。
 *
 * 翌営業日は**価格ストアの営業日**から引く。カレンダーを別に持つと
 * 祝日がずれる。
 *
 * ## 事由コードの意味は決めない
 *
 * どのコードを対象にするかは呼び出し側が指定する。
 * 実測した対応は `docs/reference/edinet-reason-codes-2026-09-11.md`。
 */

import { jquantsTradingDayCloseJst } from "../providers/jquants-free.js";
import { compareExplicitIso8601Instants } from "../iso-instant.js";
import type { LabelEvidence } from "./label-evidence.js";

export const EDINET_REASON_EVENT_REJECT_REASONS = [
  "not_extraordinary_report",
  "reason_not_requested",
  "no_publish_time",
  "no_trading_day_on_or_after",
  "duplicate_code_and_date",
] as const;

export type EdinetReasonEventRejectReason =
  (typeof EDINET_REASON_EVENT_REJECT_REASONS)[number];

export interface EdinetReasonEvent {
  /** `code|reactionDate` で一意。 */
  eventId: string;
  code: string;
  /** 価格に出る営業日。引け後の提出なら翌営業日。 */
  reactionDate: string;
  /** 提出時刻（明示オフセット付き）。 */
  publishedAt: string;
  /** 当たった事由コード。複数あればすべて。 */
  reasonCodes: string[];
  /** 提出が反応日の引け前だったか。 */
  publishedBeforeClose: boolean;
  evidenceUrl: string | null;
}

export interface EdinetReasonEventResult {
  events: EdinetReasonEvent[];
  rejectedCounts: Record<EdinetReasonEventRejectReason, number>;
  evaluatedCount: number;
}

/** 臨時報告書の書類種別。 */
const EXTRAORDINARY_REPORT_TYPE = "180";

function emptyCounts(): Record<EdinetReasonEventRejectReason, number> {
  const counts = {} as Record<EdinetReasonEventRejectReason, number>;
  for (const reason of EDINET_REASON_EVENT_REJECT_REASONS) counts[reason] = 0;
  return counts;
}

/** `第19条第2項第3号,第19条第2項第12号` を分解する。 */
export function splitReasonCodes(reason: string | null): string[] {
  if (!reason) return [];
  return reason.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * 提出時刻から価格に出る営業日を決める。
 *
 * `tradingDates` は昇順の営業日一覧（価格ストアから渡す）。
 * 引け前なら提出日そのもの（提出日が営業日でなければその後の最初の営業日）、
 * 引け後ならその次の営業日。
 */
export function resolveReactionDate(input: {
  publishedAt: string;
  tradingDates: readonly string[];
}): { reactionDate: string; publishedBeforeClose: boolean } | null {
  const day = input.publishedAt.slice(0, 10);
  // 提出日以降で最初の営業日。
  let index = input.tradingDates.findIndex((date) => date >= day);
  if (index < 0) return null;

  let publishedBeforeClose = false;
  if (input.tradingDates[index] === day) {
    const closeAt = jquantsTradingDayCloseJst(day);
    // **引け「ちょうど」は引け後として扱う。** 終値は引けの板で決まるので、
    // 同時刻の開示はその終値に入らない。実測（2026-09-12・決算開示37,696件）で
    // 引け時刻ちょうどが **44.0%**（15:30 が 39.2%）。日本企業は引けに合わせて
    // 出すので、ここを `<=` にすると最頻値をまるごと1日ずらすことになる。
    publishedBeforeClose =
      compareExplicitIso8601Instants(input.publishedAt, closeAt, "publishedAt", "close") < 0;
    // 引け後なら次の営業日へ送る。
    if (!publishedBeforeClose) index += 1;
  }
  const reactionDate = input.tradingDates[index];
  if (reactionDate === undefined) return null;
  return { reactionDate, publishedBeforeClose };
}

/**
 * 指定した事由コードの臨時報告書を価格イベントへ変換する。
 *
 * 同じ (銘柄, 反応日) に複数の提出があっても1件にまとめる。
 * 分けて数えると、同じ日の同じ値動きを二重に測ることになる。
 */
export function buildEdinetReasonEvents(input: {
  evidence: readonly LabelEvidence[];
  /** 対象の事由コード。完全一致で判定する。 */
  reasonCodes: readonly string[];
  tradingDates: readonly string[];
}): EdinetReasonEventResult {
  if (input.reasonCodes.length === 0) {
    throw new Error("reasonCodes must not be empty（対象を指定せずに母集団は作れない）");
  }
  const wanted = new Set(input.reasonCodes);
  const rejectedCounts = emptyCounts();
  const byKey = new Map<string, EdinetReasonEvent>();
  let evaluatedCount = 0;

  for (const one of input.evidence) {
    if (one.source !== "edinet") continue;
    evaluatedCount += 1;

    if (one.documentTypeCode !== EXTRAORDINARY_REPORT_TYPE) {
      rejectedCounts.not_extraordinary_report += 1;
      continue;
    }
    const codes = splitReasonCodes(one.reasonCode).filter((code) => wanted.has(code));
    if (codes.length === 0) { rejectedCounts.reason_not_requested += 1; continue; }
    if (!one.publishedAt) { rejectedCounts.no_publish_time += 1; continue; }

    const resolved = resolveReactionDate({
      publishedAt: one.publishedAt,
      tradingDates: input.tradingDates,
    });
    if (!resolved) { rejectedCounts.no_trading_day_on_or_after += 1; continue; }

    const key = `${one.code}|${resolved.reactionDate}`;
    const existing = byKey.get(key);
    if (existing) {
      rejectedCounts.duplicate_code_and_date += 1;
      // 事由は足し合わせる。片方を捨てると「何で動いたか」が消える。
      for (const code of codes) {
        if (!existing.reasonCodes.includes(code)) existing.reasonCodes.push(code);
      }
      existing.reasonCodes.sort();
      continue;
    }

    byKey.set(key, {
      eventId: key,
      code: one.code,
      reactionDate: resolved.reactionDate,
      publishedAt: one.publishedAt,
      reasonCodes: [...codes].sort(),
      publishedBeforeClose: resolved.publishedBeforeClose,
      evidenceUrl: one.url,
    });
  }

  const events = [...byKey.values()].sort((left, right) =>
    left.eventId.localeCompare(right.eventId));
  return { events, rejectedCounts, evaluatedCount };
}
