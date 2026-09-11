/**
 * J-Quants の「1日1リクエストで全銘柄」を使った履歴取り込みの計画部。
 *
 * ここは純粋関数だけを置く。ネットワークと書き込みは CLI 側。
 * 取り込みは必ず中断される前提で設計する（バースト枠で1日あたり数秒〜90秒、
 * 2年分で1時間超かかるため）。中断されても壊れず、続きから再開できること。
 */

import type { JQuantsUniverseOutcome } from "./jquants-free.js";

export interface IngestLedgerEntry {
  tradingDate: string;
  outcome: JQuantsUniverseOutcome;
  rowCount: number;
  retrievedAt: string;
  /**
   * 開示遅延（84日）の内側で抑止された行数。
   *
   * **0 より大きければ完了ではない。** API は行を返したが、その時点では
   * まだ使ってよい時刻に達していなかった、という状態。
   */
  withheldForAsOf?: number;
}

/**
 * その結果をもって「この日はもう取りに行かなくてよい」と言えるか。
 *
 * `not_entitled` は完了ではない。84日遅延の内側というだけで、遅延が明ければ
 * 取得できる日だから。ここを完了に含めると、その日は二度と取りに行かれない。
 *
 * **抑止された行があった日も完了ではない。** `observedAt` は
 * 「対象日+84日の 23:59:59 JST」なので、契約上の上限日は**いつ実行しても
 * 抑止される**。これを完了にすると、追いつきを毎日回すたびに
 * 1日ずつ永久の穴ができる。実際に 2026-06-19 で作ってしまった
 * （台帳は rowCount 0 で完了、いま API を叩くと4,443件返る）。
 */
export function isCompletedIngest(input: {
  outcome: JQuantsUniverseOutcome;
  withheldForAsOf?: number;
}): boolean {
  if ((input.withheldForAsOf ?? 0) > 0) return false;
  return input.outcome === "entitled_rows" || input.outcome === "entitled_empty";
}

export function parseIngestLedger(content: string): IngestLedgerEntry[] {
  const entries: IngestLedgerEntry[] = [];
  for (const [index, raw] of content.split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: IngestLedgerEntry;
    try {
      parsed = JSON.parse(line) as IngestLedgerEntry;
    } catch (error) {
      throw new Error(`ingest ledger line ${index + 1} is not JSON: ${(error as Error).message}`);
    }
    assertIsoDate(parsed.tradingDate, `ingest ledger line ${index + 1} tradingDate`);
    entries.push(parsed);
  }
  return entries;
}

const DATE_FILE_NAME = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * 取り込み済みの営業日。
 *
 * 実体ファイルと台帳の和集合。ファイルだけだと非営業日（0件）が永遠に
 * 未完了になり、台帳だけだと rename 後・台帳追記前に落ちた日を二重取得する。
 */
export function completedDatesFrom(input: {
  fileNames: Iterable<string>;
  ledgerContent?: string;
}): Set<string> {
  const completed = new Set<string>();
  for (const name of input.fileNames) {
    const match = DATE_FILE_NAME.exec(name);
    if (match) completed.add(match[1]!);
  }
  for (const entry of parseIngestLedger(input.ledgerContent ?? "")) {
    if (!isCompletedIngest(entry)) continue;
    completed.add(entry.tradingDate);
  }
  return completed;
}

/** 取り込み済みの判定はファイルの存在で行う。台帳は説明用であって権威ではない。 */
export interface IngestPlanInput {
  from: string;
  to: string;
  /** すでに完了している営業日（`YYYY-MM-DD`）。 */
  completed: Iterable<string>;
  /** 週末を要求から外す（東証は土日に立たない）。既定 true。 */
  skipWeekends?: boolean;
}

export interface IngestPlan {
  /** 実際に API へ問い合わせる日付。昇順。 */
  pending: string[];
  /** 完了済みとして飛ばした日数。 */
  skippedCompleted: number;
  /** 週末として飛ばした日数。 */
  skippedWeekends: number;
  totalCalendarDays: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string, field: string): string {
  if (!ISO_DATE.test(value)) throw new Error(`${field} must be YYYY-MM-DD: ${value}`);
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a real date: ${value}`);
  }
  return value;
}

function nextDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/** 0=日曜, 6=土曜。UTC で計算してよい（日付そのものを渡すため時差が入らない）。 */
export function dayOfWeek(value: string): number {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekend(value: string): boolean {
  const weekday = dayOfWeek(value);
  return weekday === 0 || weekday === 6;
}

export function planIngest(input: IngestPlanInput): IngestPlan {
  const from = assertIsoDate(input.from, "from");
  const to = assertIsoDate(input.to, "to");
  if (from > to) throw new Error(`from must be on or before to: ${from} > ${to}`);

  const completed = new Set<string>();
  for (const value of input.completed) completed.add(assertIsoDate(value, "completed entry"));

  const skipWeekends = input.skipWeekends ?? true;
  const pending: string[] = [];
  let skippedCompleted = 0;
  let skippedWeekends = 0;
  let totalCalendarDays = 0;

  for (let date = from; date <= to; date = nextDate(date)) {
    totalCalendarDays += 1;
    // 完了判定を先に見る。すでに取り込んだ土日（祝日判定の記録）を
    // 「週末スキップ」に数え直すと、再開のたびに集計がぶれる。
    if (completed.has(date)) {
      skippedCompleted += 1;
      continue;
    }
    if (skipWeekends && isWeekend(date)) {
      skippedWeekends += 1;
      continue;
    }
    pending.push(date);
  }

  return { pending, skippedCompleted, skippedWeekends, totalCalendarDays };
}

/**
 * 残り所要時間の見積り。
 *
 * バースト枠のため「平均間隔」で割ると必ず短く出る。実測（2026-09-10、10銘柄）は
 * 5回に1回スロットルされ、その1回が90秒台だった。楽観と悲観の両方を返し、
 * 呼び出し側に幅を見せる。
 */
export function estimateIngestSeconds(input: {
  pendingDays: number;
  optimisticIntervalSec: number;
  throttleEveryNRequests: number;
  throttleCostSec: number;
}): { optimisticSec: number; expectedSec: number } {
  const { pendingDays, optimisticIntervalSec, throttleEveryNRequests, throttleCostSec } = input;
  if (!Number.isSafeInteger(pendingDays) || pendingDays < 0) {
    throw new Error(`pendingDays must be a non-negative integer: ${pendingDays}`);
  }
  if (!(optimisticIntervalSec > 0) || !(throttleCostSec >= 0)) {
    throw new Error("interval must be positive and throttle cost non-negative");
  }
  if (!Number.isSafeInteger(throttleEveryNRequests) || throttleEveryNRequests < 1) {
    throw new Error(`throttleEveryNRequests must be a positive integer: ${throttleEveryNRequests}`);
  }
  const optimisticSec = pendingDays * optimisticIntervalSec;
  const throttles = Math.floor(pendingDays / throttleEveryNRequests);
  return { optimisticSec, expectedSec: optimisticSec + throttles * throttleCostSec };
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`invalid duration: ${seconds}`);
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}時間${minutes}分`;
  if (minutes > 0) return `${minutes}分${secs}秒`;
  return `${secs}秒`;
}
