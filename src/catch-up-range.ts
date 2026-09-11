/**
 * 取り込み済みの記録から「続きの範囲」を決める。
 *
 * ## なぜ要るか
 *
 * 価格も EDINET も、最初は一度きりの遡り取り込みとして作った。
 * daily に配線しないと、**取り込みはその日で止まる。**
 *
 * J-Quants Free は84日遅延なので、毎日1営業日ぶんずつ新しい日が
 * 契約範囲へ入ってくる。誰も取りに行かなければ、価格は取り込んだ日のまま。
 * TDnet の保存開始（2026-08-03）に価格が追いつかなければ、
 * 不祥事 Edge はいつまでも測れない。
 *
 * ## 決め方
 *
 * from = 取り込み済みの最終日の翌日。
 * to   = 今日（契約範囲の上限は取り込み側が判定して弾く）。
 *
 * **一度も取り込んでいなければ範囲を返さない。** 起点が分からないまま
 * 適当な日から始めると、穴の空いた保存庫ができる。
 * 最初の遡り取り込みは `--from` を明示して人が走らせる。
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CatchUpRange {
  from: string;
  to: string;
  /** 追いつく対象の暦日数。0 なら既に最新。 */
  calendarDays: number;
}

export type CatchUpResolution =
  | { ok: true; range: CatchUpRange }
  | { ok: false; reason: "never_ingested" | "already_current" };

function assertIsoDate(value: string, field: string): string {
  if (!ISO_DATE.test(value)) throw new Error(`${field} must be YYYY-MM-DD: ${value}`);
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a real date: ${value}`);
  }
  return value;
}

function nextDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * 続きの範囲を決める。
 *
 * `archivedDates` は取り込み済みの日付（順不同でよい）。
 * `today` は JST の今日（UTC を渡すと日本の早朝に1日ずれる）。
 */
export function resolveCatchUpRange(input: {
  archivedDates: Iterable<string>;
  today: string;
}): CatchUpResolution {
  const today = assertIsoDate(input.today, "today");
  let last: string | null = null;
  for (const value of input.archivedDates) {
    const date = assertIsoDate(value, "archived date");
    if (last === null || date > last) last = date;
  }
  if (last === null) return { ok: false, reason: "never_ingested" };

  const from = nextDate(last);
  // 最終日が今日以降なら追いつく先がない。未来日が混ざっていても同じ扱い。
  if (from > today) return { ok: false, reason: "already_current" };

  return { ok: true, range: { from, to: today, calendarDays: daysBetween(from, today) + 1 } };
}
