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

/** 実測した TDnet 公開ビューアの保持日数（暦日）。余裕を見て短めに扱う。 */
export const TDNET_RETENTION_DAYS = 28;

/**
 * EDINET 書類一覧API の保持日数（暦日）。
 *
 * 実測（2026-09-11）:
 *   2016-09-12 は取得できた（187件）/ 2016-09-09 は metadata.status=404。
 *   2018-09-10・2020-09-10・2021-09-10・2022-09-09 はいずれも取得できた。
 *   今日の10年前が 2016-09-11 なので、**10年のローリング窓**と分かる。
 *
 * TDnet の 28日とは緊急度が桁違いなので、同じ検査に同じ期限で乗せない。
 * 余裕を見て 9年半で扱う。
 */
export const EDINET_RETENTION_DAYS = 3_470;

/**
 * J-Quants の2年ローリング窓（価格・決算・銘柄マスタ共通）の保持日数（暦日）。
 *
 * 窓は **cap を上端とする2年**。cap は「今日 − 84日」。
 * 実測（2026-09-12）: 決算は 2024-06-19 〜 2026-06-19、
 * マスタは 2024-06-20 〜 2026-06-20。どちらも下限 = cap − 730（ちょうど2年）。
 * したがって、ある日 D が取得できるのは **D + 730 + 84 = D + 814日** まで。
 *
 * **ここを短く見積もってはいけない。** TDnet の28日と逆で、
 * 短くすると「まだ取れる日」を回収不能と判定して諦めることになる
 * （実際に 800 と置いて、5日ぶんを誤って回収不能と報告した）。
 * 期限の警告を早めたいなら、判定ではなく表示側で前倒しする。
 */
export const JQUANTS_ROLLING_WINDOW_DAYS = 814;

/** @deprecated JQUANTS_ROLLING_WINDOW_DAYS を使う。 */
export const JQUANTS_FINS_RETENTION_DAYS = JQUANTS_ROLLING_WINDOW_DAYS;

/** @deprecated JQUANTS_ROLLING_WINDOW_DAYS を使う。 */
export const JQUANTS_MASTER_RETENTION_DAYS = JQUANTS_ROLLING_WINDOW_DAYS;

export interface ArchiveGap {
  date: string;
  /** あと何日で回収できなくなるか。0 以下なら手遅れ。 */
  daysLeftToRecover: number;
  recoverable: boolean;
  /**
   * 追いつき（`--catch-up`）が自動で埋められるか。
   *
   * 追いつきは**保存済みの最終日の翌日から**しか取らない。
   * 途中の穴（最終日より前）は永久に飛ばされるので、人が埋めるしかない。
   * 末尾の穴（最終日より後）は翌朝の追いつきで入る。
   */
  fillableByCatchUp: boolean;
}

export interface ArchiveAuditReport {
  archivedDates: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 平日なのに保存されていない日。 */
  gaps: ArchiveGap[];
  recoverableGaps: ArchiveGap[];
  lostGaps: ArchiveGap[];
  /**
   * 人が埋めるしかない穴（途中の穴、または回収期限を過ぎたもの）。
   * **ここが空でなければ行動が要る。**
   */
  needsManualBackfill: ArchiveGap[];
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
      needsManualBackfill: [],
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
    gaps.push({
      date,
      daysLeftToRecover,
      recoverable: daysLeftToRecover > 0,
      // 追いつきは最終日の翌日からしか取らない。途中の穴は飛ばされる。
      fillableByCatchUp: date > last,
    });
  }

  return {
    archivedDates: archived.length,
    firstDate: first,
    lastDate: last,
    gaps,
    recoverableGaps: gaps.filter((gap) => gap.recoverable),
    lostGaps: gaps.filter((gap) => !gap.recoverable),
    // 途中の穴は追いつきが飛ばす。期限切れは追いつきでも埋まらない。
    needsManualBackfill: gaps.filter((gap) => !gap.fillableByCatchUp || !gap.recoverable),
    daysSinceLastArchive: daysBetween(last, input.today),
  };
}

/**
 * 朝のレポートに出す一言。欠落が無ければ何も出さない。
 *
 * CI の検査だけでは毎朝は見えない。開示は約28日で回収できなくなるので、
 * 気づくのが遅れると永久に埋められない。**期限を数字で見せる。**
 */
export function formatDisclosureArchiveBanner(report: ArchiveAuditReport): string[] {
  if (report.archivedDates === 0) return [];
  if (report.recoverableGaps.length === 0 && report.lostGaps.length === 0) return [];

  const lines: string[] = [];
  if (report.recoverableGaps.length > 0) {
    const soonest = report.recoverableGaps
      .reduce((min, gap) => Math.min(min, gap.daysLeftToRecover), Number.POSITIVE_INFINITY);
    lines.push(
      `> ⚠️ **開示の記録が ${report.recoverableGaps.length} 日ぶん抜けています。`
      + `あと ${soonest} 日で取り戻せなくなります。**`,
    );
    lines.push(">");
    // 範囲は「欠落の最初」から「欠落の最後」。`lastDate`（最後に保存できた日）を
    // 終端にすると、欠落が最終保存日より後のときに from > to の壊れた
    // コマンドを出す（実際に出した）。
    const firstGap = report.recoverableGaps[0]!.date;
    const lastGap = report.recoverableGaps.at(-1)!.date;
    lines.push(
      "> - 埋めるコマンド: `pnpm archive:tdnet"
      + ` -- --from ${firstGap} --to ${lastGap} --execute\``,
    );
  }
  if (report.lostGaps.length > 0) {
    lines.push(`> - 取り戻せなくなった日: ${report.lostGaps.length} 日`);
  }
  lines.push("");
  return lines;
}
