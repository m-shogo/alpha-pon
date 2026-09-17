// Research OS — 適時開示の見出しからイベントの母集団を作る（開示が先、値動きは条件にしない）。
//
// 事前登録（例: docs/research/preregistrations/2026-09-17-misconduct-disclosure.md）の
// 母集団の規則をそのまま実装する。
//
//   1. 公表済みで、開示日が期間内
//   2. 見出しにキーワードのどれかを含む
//   3. 見出しに続報の印（報告書・第２報・経過 …）を含むものは除く
//   4. 5桁コードにできること、公表時刻があること、反応日が決まること
//   5. 同じ会社は最初の1件だけ。そこから暦日 N 日以内の該当開示は数えない
//
// 外部 IO なし。落とした行は理由つきで全件数える（silent drop を作らない）。

import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../iso-instant.js";
import { jstDateOf } from "../pit.js";
import { resolveReactionDate } from "./edinet-reason-events.js";
import { toFiveDigitCode } from "./label-evidence.js";
import { calendarDaysBetween } from "./trading-calendar.js";

export interface DisclosureKeywordPopulation {
  eventFrom: string;
  eventTo: string;
  keywords: readonly string[];
  followUpMarkers: readonly string[];
  dedupeCalendarDays: number;
}

export interface DisclosureRow {
  observationDate: string;
  status: string;
  code: string;
  sourceCode?: string | null;
  title: string;
  publishedAt?: string | null;
  url?: string | null;
}

export interface DisclosureKeywordEvent {
  id: string;
  code: string;
  disclosedAt: string;
  reactionDate: string;
  publishedBeforeClose: boolean;
  title: string;
  url: string | null;
  matchedKeyword: string;
}

export const DISCLOSURE_KEYWORD_REJECT_REASONS = [
  "not_published",
  "outside_window",
  "no_keyword",
  "follow_up",
  "invalid_code",
  "no_published_at",
  "no_trading_day",
  "duplicate_within_window",
] as const;

export type DisclosureKeywordRejectReason = (typeof DISCLOSURE_KEYWORD_REJECT_REASONS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDisclosureKeywordPopulation(population: DisclosureKeywordPopulation): void {
  if (!ISO_DATE.test(population.eventFrom) || !ISO_DATE.test(population.eventTo)) {
    throw new Error("eventFrom / eventTo は YYYY-MM-DD で指定してください");
  }
  if (population.eventFrom > population.eventTo) throw new Error("eventFrom は eventTo 以前にしてください");
  if (population.keywords.length === 0 || population.keywords.some((one) => one.trim() === "")) {
    throw new Error("keywords は空でない語を1つ以上指定してください");
  }
  if (population.followUpMarkers.some((one) => one.trim() === "")) {
    throw new Error("followUpMarkers に空の語は置けません（すべての見出しに当たる）");
  }
  if (!Number.isSafeInteger(population.dedupeCalendarDays) || population.dedupeCalendarDays < 0) {
    throw new Error(`dedupeCalendarDays は 0 以上の整数で指定してください: ${population.dedupeCalendarDays}`);
  }
}

export function buildDisclosureKeywordEvents(
  rows: readonly DisclosureRow[],
  population: DisclosureKeywordPopulation,
  tradingDates: readonly string[],
): {
  events: DisclosureKeywordEvent[];
  rejectedCounts: Record<DisclosureKeywordRejectReason, number>;
  rowCount: number;
} {
  assertDisclosureKeywordPopulation(population);
  const rejectedCounts = Object.fromEntries(
    DISCLOSURE_KEYWORD_REJECT_REASONS.map((reason) => [reason, 0]),
  ) as Record<DisclosureKeywordRejectReason, number>;

  const candidates: Array<Omit<DisclosureKeywordEvent, "id"> & { order: number }> = [];
  rows.forEach((row, order) => {
    if (row.status !== "published") { rejectedCounts.not_published += 1; return; }
    if (row.observationDate < population.eventFrom || row.observationDate > population.eventTo) {
      rejectedCounts.outside_window += 1;
      return;
    }
    const matchedKeyword = population.keywords.find((keyword) => row.title.includes(keyword));
    if (matchedKeyword === undefined) { rejectedCounts.no_keyword += 1; return; }
    if (population.followUpMarkers.some((marker) => row.title.includes(marker))) {
      rejectedCounts.follow_up += 1;
      return;
    }
    const code = toFiveDigitCode(row.sourceCode ?? row.code);
    if (code === null) { rejectedCounts.invalid_code += 1; return; }
    if (!row.publishedAt) { rejectedCounts.no_published_at += 1; return; }
    try {
      parseExplicitIso8601Instant(row.publishedAt, "publishedAt");
    } catch {
      rejectedCounts.no_published_at += 1;
      return;
    }
    // 反応日の判定は時刻の先頭10文字を日付として読む。JST 表記でなければ日付を取り違えるので落とす
    // （保存済みの TDnet 11,509件はすべて +09:00。2026-09-17 に確認）。
    if (jstDateOf(row.publishedAt) !== row.publishedAt.slice(0, 10)) {
      rejectedCounts.no_published_at += 1;
      return;
    }
    const reaction = resolveReactionDate({ publishedAt: row.publishedAt, tradingDates });
    if (reaction === null) { rejectedCounts.no_trading_day += 1; return; }
    candidates.push({
      code,
      disclosedAt: row.publishedAt,
      reactionDate: reaction.reactionDate,
      publishedBeforeClose: reaction.publishedBeforeClose,
      title: row.title,
      url: row.url ?? null,
      matchedKeyword,
      order,
    });
  });

  // 早い開示から。同じ会社の2件目以降は、最初の1件から N 日以内なら数えない。
  candidates.sort((left, right) =>
    compareExplicitIso8601Instants(left.disclosedAt, right.disclosedAt, "left", "right")
    || (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)
    || left.order - right.order);
  const lastKeptByCode = new Map<string, string>();
  const events: DisclosureKeywordEvent[] = [];
  for (const candidate of candidates) {
    const disclosedDate = jstDateOf(candidate.disclosedAt);
    const previous = lastKeptByCode.get(candidate.code);
    if (previous !== undefined && calendarDaysBetween(previous, disclosedDate) <= population.dedupeCalendarDays) {
      rejectedCounts.duplicate_within_window += 1;
      continue;
    }
    lastKeptByCode.set(candidate.code, disclosedDate);
    const { order: _order, ...event } = candidate;
    events.push({ id: `dk-${candidate.code}-${candidate.reactionDate}`, ...event });
  }
  events.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return { events, rejectedCounts, rowCount: rows.length };
}
