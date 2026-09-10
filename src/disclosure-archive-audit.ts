/**
 * 開示保存庫の欠落検査。
 *
 * TDnet の公開閲覧サービスは約1ヶ月しか遡れない（実測: 2026-08-03 は取れるが
 * 2026-07-31 は not found）。つまり **欠落は約30日以内なら埋められるが、
 * それを過ぎると永久に埋められない。**
 *
 * daily が数日落ちていたことに1ヶ月後に気づいても手遅れなので、
 * 「あと何日で回収できなくなるか」まで出す。
 */

import { listArchivedDates } from "./disclosure-archive.js";

/** 実測した公開ビューアの保持日数（暦日）。余裕を見て短めに扱う。 */
export const TDNET_RETENTION_DAYS = 28;

export interface ArchiveGap {
  date: string;
  /** あと何日で回収できなくなるか。0 以下なら手遅れ。 */
  daysLeftToRecover: number;
  recoverable: boolean;
}

export interface ArchiveAuditReport {
  archivedDates: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 平日なのに保存されていない日。 */
  gaps: ArchiveGap[];
  recoverableGaps: ArchiveGap[];
  lostGaps: ArchiveGap[];
  /** 最後に保存した日から今日までの日数。daily が止まっていないかの目安。 */
  daysSinceLastArchive: number | null;
}

function toUtcDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekend(value: string): boolean {
  const weekday = toUtcDate(value).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

/**
 * 保存済みの日付から欠落を洗い出す。
 *
 * 走査の起点は「保存済みの最初の日」。それより前は最初から観測していない
 * ので欠落ではない（保存を始めた日より前を穴だと言っても意味が無い）。
 * 祝日は事前に分からないので、平日はすべて対象にして「観測したが0件」の
 * 空ファイルで区別する。
 */
export function auditDisclosureArchive(input: {
  /** JST の今日。UTC 日付を渡すと日本の早朝に1日ずれる。 */
  today: string;
  archivedDates?: readonly string[];
  retentionDays?: number;
}): ArchiveAuditReport {
  const archived = [...(input.archivedDates ?? listArchivedDates())].sort();
  const retentionDays = input.retentionDays ?? TDNET_RETENTION_DAYS;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today)) {
    throw new Error(`today must be YYYY-MM-DD: ${input.today}`);
  }

  if (archived.length === 0) {
    return {
      archivedDates: 0,
      firstDate: null,
      lastDate: null,
      gaps: [],
      recoverableGaps: [],
      lostGaps: [],
      daysSinceLastArchive: null,
    };
  }

  const known = new Set(archived);
  const first = archived[0]!;
  const last = archived.at(-1)!;
  const gaps: ArchiveGap[] = [];

  for (let cursor = toUtcDate(first); isoOf(cursor) <= input.today; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = isoOf(cursor);
    if (known.has(date) || isWeekend(date)) continue;
    // 回収期限は「その日 + 保持日数」。今日がそれを過ぎていたら手遅れ。
    const daysLeftToRecover = retentionDays - daysBetween(date, input.today);
    gaps.push({ date, daysLeftToRecover, recoverable: daysLeftToRecover > 0 });
  }

  return {
    archivedDates: archived.length,
    firstDate: first,
    lastDate: last,
    gaps,
    recoverableGaps: gaps.filter((gap) => gap.recoverable),
    lostGaps: gaps.filter((gap) => !gap.recoverable),
    daysSinceLastArchive: daysBetween(last, input.today),
  };
}
