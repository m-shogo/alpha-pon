// Research OS — 会社予想の「直前の値」を会計年度ごとに引く。
//
// なぜ要るか:
//   決算短信の予想欄は開示の種類で意味が変わる。
//     四半期短信      FOP   = 今期（CurFYEn）の通期予想
//     本決算短信      FOP   は空。NxFOP = 来期（NxFYEn）の通期予想
//     業績予想の修正  FOP   = 修正後の今期（CurFYEn）の通期予想
//   「直前の開示の FOP」を基準にすると、1Q は本決算（FOP 空）と比べることになり
//   常に「基準なし」で落ちる。期をまたぐと別の年度どうしを比べてしまう。
//   実測（2026-09-17）で本決算 8,641件に FOP は1件も無く、NxFOP は 7,657件。
//
// 規則:
//   - 基準は「同じ会計年度末について、開示時刻が**厳密に前**の最新の予想」
//   - 同時刻の開示どうしは互いの基準にならない（決算短信と同時に出た予想修正は
//     同じニュースであって「前の予想」ではない）
//   - updatesBaseline=false の開示（訂正など）は基準を動かさない
//   - 時刻を解釈できない開示は基準にも使わず、自分の基準も null
//
// 外部 IO なし。入力と同じ順序・同じ長さで結果を返す。

import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "../iso-instant.js";

export interface ForecastTimelineEntry {
  code: string;
  /** 明示タイムゾーン付き ISO。null は時刻を解釈できなかった開示。 */
  disclosedAt: string | null;
  /** forecast が指す会計年度末（YYYY-MM-DD）。 */
  fiscalYearEnd: string | null;
  forecast: number | null;
  /** nextForecast が指す会計年度末。本決算短信の来期予想。 */
  nextFiscalYearEnd: string | null;
  nextForecast: number | null;
  /** false なら基準を更新しない。 */
  updatesBaseline: boolean;
}

export interface ForecastBaseline {
  value: number;
  /** 基準にした予想が開示された時刻。 */
  disclosedAt: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertEntry(entry: ForecastTimelineEntry, index: number): void {
  if (entry.disclosedAt !== null) {
    // 比較が起きない（1件だけの銘柄）ときも、解釈できない時刻は通さない。
    parseExplicitIso8601Instant(entry.disclosedAt, `forecast timeline entry ${index} disclosedAt`);
  }
  for (const [field, value] of [
    ["fiscalYearEnd", entry.fiscalYearEnd],
    ["nextFiscalYearEnd", entry.nextFiscalYearEnd],
  ] as const) {
    if (value !== null && !ISO_DATE.test(value)) {
      throw new Error(`forecast timeline entry ${index}: ${field} must be YYYY-MM-DD or null: ${value}`);
    }
  }
  for (const [field, value] of [
    ["forecast", entry.forecast],
    ["nextForecast", entry.nextForecast],
  ] as const) {
    if (value !== null && !Number.isFinite(value)) {
      throw new Error(`forecast timeline entry ${index}: ${field} must be finite or null: ${value}`);
    }
  }
}

/**
 * 各開示について、同じ会計年度末の直前の予想を返す。無ければ null。
 */
export function previousForecasts(
  entries: readonly ForecastTimelineEntry[],
): Array<ForecastBaseline | null> {
  const result: Array<ForecastBaseline | null> = entries.map(() => null);
  const byCode = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    assertEntry(entry, index);
    if (entry.disclosedAt === null) return;
    const bucket = byCode.get(entry.code);
    if (bucket) bucket.push(index);
    else byCode.set(entry.code, [index]);
  });

  const compare = (left: number, right: number): number =>
    compareExplicitIso8601Instants(
      entries[left]!.disclosedAt!,
      entries[right]!.disclosedAt!,
      `entry ${left} disclosedAt`,
      `entry ${right} disclosedAt`,
    );

  for (const indices of byCode.values()) {
    // 同時刻は入力順。結果が入力の並べ方に依存しないよう、更新は同時刻の束ごとに行う。
    indices.sort((left, right) => compare(left, right) || left - right);
    const latest = new Map<string, ForecastBaseline>();
    let start = 0;
    while (start < indices.length) {
      let end = start + 1;
      while (end < indices.length && compare(indices[end]!, indices[start]!) === 0) end += 1;
      const group = indices.slice(start, end);

      for (const index of group) {
        const fiscalYearEnd = entries[index]!.fiscalYearEnd;
        result[index] = fiscalYearEnd === null ? null : latest.get(fiscalYearEnd) ?? null;
      }
      for (const index of group) {
        const entry = entries[index]!;
        if (!entry.updatesBaseline) continue;
        const at = entry.disclosedAt!;
        if (entry.fiscalYearEnd !== null && entry.forecast !== null) {
          latest.set(entry.fiscalYearEnd, { value: entry.forecast, disclosedAt: at });
        }
        if (entry.nextFiscalYearEnd !== null && entry.nextForecast !== null) {
          latest.set(entry.nextFiscalYearEnd, { value: entry.nextForecast, disclosedAt: at });
        }
      }
      start = end;
    }
  }
  return result;
}
