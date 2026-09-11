/**
 * 保存した価格レコードを、API の生の返答と突き合わせる。
 *
 * `verify-price-store-integrity` はストアの中だけを見る（重複・日付混入・
 * hardening 違反）。それだけでは「取り込みの変換が間違っている」形の壊れ方を
 * 見つけられない。`mapJQuantsFreeQuote` を触ったときに、
 * **保存した値が本当に API の値かどうか**を確かめる手段が要る。
 *
 * ここは比較だけ。取得は呼び出し側。
 */

import type { DailyQuote } from "../../fetcher/jquants.js";
import type { PitPriceRecord } from "../price-store.js";

export interface StoreApiDifference {
  code: string;
  field: string;
  stored: string;
  api: string;
}

export interface StoreApiDiffReport {
  tradingDate: string;
  apiRowCount: number;
  storedRowCount: number;
  /** OHLCV まで突き合わせた銘柄数。 */
  comparedCount: number;
  differences: StoreApiDifference[];
}

function text(value: unknown): string {
  return value === undefined || value === null ? "(なし)" : String(value);
}

/**
 * 1営業日ぶんを突き合わせる。
 *
 * API 側が値を持たない行（板が立たなかった）は `status !== "traded"` で
 * 保存されているべき。逆に API に値があるのに traded でない行も差分にする。
 * **どちらの向きも見る。** 片方だけだと「全部 missing にする」変換が通る。
 */
export function diffStoreAgainstApi(input: {
  tradingDate: string;
  apiQuotes: readonly DailyQuote[];
  storedRecords: readonly PitPriceRecord[];
}): StoreApiDiffReport {
  const stored = new Map(input.storedRecords.map((record) => [record.code, record]));
  const differences: StoreApiDifference[] = [];
  const seen = new Set<string>();
  let comparedCount = 0;

  for (const quote of input.apiQuotes) {
    const code = quote.Code.trim().toUpperCase();
    seen.add(code);
    const record = stored.get(code);
    if (!record) {
      differences.push({ code, field: "row", stored: "(なし)", api: "あり" });
      continue;
    }
    if (record.tradingDate !== input.tradingDate) {
      differences.push({
        code, field: "tradingDate", stored: record.tradingDate, api: input.tradingDate,
      });
      continue;
    }

    // `normalizeV2Quote` は欠損を 0 に畳む。全ゼロは「板が立たなかった」。
    const apiHasBar = [quote.Open, quote.High, quote.Low, quote.Close]
      .some((value) => Number.isFinite(value) && value > 0);

    if (!apiHasBar) {
      if (record.status === "traded") {
        differences.push({ code, field: "status", stored: "traded", api: "値なし" });
      }
      continue;
    }
    if (record.status !== "traded" || !record.ohlcv) {
      differences.push({ code, field: "status", stored: record.status, api: "値あり" });
      continue;
    }

    comparedCount += 1;
    const pairs: Array<[string, number, number]> = [
      ["open", record.ohlcv.open, quote.Open],
      ["high", record.ohlcv.high, quote.High],
      ["low", record.ohlcv.low, quote.Low],
      ["close", record.ohlcv.close, quote.Close],
      ["volume", record.ohlcv.volume, quote.Volume],
    ];
    for (const [field, storedValue, apiValue] of pairs) {
      if (Math.abs(storedValue - apiValue) > 1e-9) {
        differences.push({ code, field, stored: text(storedValue), api: text(apiValue) });
      }
    }
  }

  // 逆向き。API に無い行がストアにあるのは、別の日の行が混ざっている可能性。
  for (const record of input.storedRecords) {
    if (!seen.has(record.code)) {
      differences.push({ code: record.code, field: "row", stored: "あり", api: "(なし)" });
    }
  }

  differences.sort((left, right) =>
    left.code === right.code ? left.field.localeCompare(right.field) : left.code.localeCompare(right.code));

  return {
    tradingDate: input.tradingDate,
    apiRowCount: input.apiQuotes.length,
    storedRowCount: input.storedRecords.length,
    comparedCount,
    differences,
  };
}
