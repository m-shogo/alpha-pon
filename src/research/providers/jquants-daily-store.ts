/**
 * 日付別に取り込んだ全銘柄日足の読み出し層。
 *
 * 保存は日付メジャー（`<YYYY-MM-DD>.jsonl` に全銘柄）。
 * これは「その日の市場全体を走査する」用途（異常変動の検出、対照群の母集団）
 * には最適だが、「1銘柄の時系列」には向かない。ここはその橋渡し。
 *
 * 銘柄別の複製インデックスは作らない。1.4GB の二重化と、取り込みとの
 * 同期ずれを抱えるより、必要な銘柄だけを1パスで抜くほうが安全。
 * 全行を JSON.parse すると遅いので、行の文字列マッチで先に篩う。
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { assertIsoDate } from "./jquants-daily-ingest.js";
import { compareExplicitIso8601Instants } from "../iso-instant.js";
import type { PriceBar, PriceSeries } from "../backtest.js";
import type { PitPriceRecord } from "../price-store.js";

export const JQUANTS_DAILY_STORE_ROOT = "research/prices/jquants-free-daily";

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export function resolveStoreRoot(root = JQUANTS_DAILY_STORE_ROOT): string {
  return resolve(process.cwd(), root);
}

/** 取り込み済みの日付（昇順）。書きかけ（.partial）は含めない。 */
export function listIngestedDates(root = resolveStoreRoot()): string[] {
  if (!existsSync(root)) return [];
  const dates: string[] = [];
  for (const name of readdirSync(root)) {
    const match = DATE_FILE.exec(name);
    if (match) dates.push(match[1]!);
  }
  return dates.sort();
}

export function readDateRecords(tradingDate: string, root = resolveStoreRoot()): PitPriceRecord[] {
  assertIsoDate(tradingDate, "tradingDate");
  const path = resolve(root, `${tradingDate}.jsonl`);
  if (!existsSync(path)) return [];
  const records: PitPriceRecord[] = [];
  for (const [index, raw] of readFileSync(path, "utf-8").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as PitPriceRecord);
    } catch (error) {
      throw new Error(`${path}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
  }
  return records;
}

/**
 * 行を JSON.parse する前の篩。
 *
 * 保存形式は `JSON.stringify(record)` なので `"code":"7203"` が必ず現れる。
 * 閉じ引用符まで含めるため `"7203"` が `"72030"` に誤爆しない。
 *
 * これは最適化であって正しさの根拠ではない。保存形式が変わればすり抜けるので、
 * 呼び出し側には「1件も取れなかった銘柄」を必ず返して黙って空にしない。
 */
export function codeNeedle(code: string): string {
  return `"code":"${code}"`;
}

export interface LoadSeriesResult {
  /** 銘柄コード → その銘柄のレコード（tradingDate 昇順）。 */
  series: Map<string, PitPriceRecord[]>;
  /** 1件も見つからなかった銘柄。呼び出し側はここで fail closed すること。 */
  missingCodes: string[];
  datesScanned: number;
}

export function loadSeriesForCodes(input: {
  codes: Iterable<string>;
  from?: string;
  to?: string;
  root?: string;
}): LoadSeriesResult {
  const root = input.root ?? resolveStoreRoot();
  const from = input.from ? assertIsoDate(input.from, "from") : null;
  const to = input.to ? assertIsoDate(input.to, "to") : null;
  if (from && to && from > to) throw new Error(`from must be on or before to: ${from} > ${to}`);

  const wanted = new Set<string>();
  for (const code of input.codes) {
    const trimmed = code.trim().toUpperCase();
    if (!/^[0-9A-Z]{4,5}$/.test(trimmed)) throw new Error(`invalid security code: ${code}`);
    wanted.add(trimmed);
  }
  const series = new Map<string, PitPriceRecord[]>();
  for (const code of wanted) series.set(code, []);
  if (wanted.size === 0) return { series, missingCodes: [], datesScanned: 0 };

  const needles = [...wanted].map((code) => ({ code, needle: codeNeedle(code) }));
  let datesScanned = 0;

  for (const tradingDate of listIngestedDates(root)) {
    if (from && tradingDate < from) continue;
    if (to && tradingDate > to) continue;
    datesScanned += 1;

    const content = readFileSync(resolve(root, `${tradingDate}.jsonl`), "utf-8");
    for (const raw of content.split("\n")) {
      if (!raw) continue;
      // 大半の行はここで落ちる。JSON.parse は候補だけに掛ける。
      let matched: string | null = null;
      for (const { code, needle } of needles) {
        if (raw.includes(needle)) { matched = code; break; }
      }
      if (matched === null) continue;

      const record = JSON.parse(raw) as PitPriceRecord;
      // 篩は文字列一致でしかない。実体で照合し直す。
      const bucket = series.get(record.code);
      if (!bucket) continue;
      bucket.push(record);
    }
  }

  for (const bucket of series.values()) {
    bucket.sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
  }
  const missingCodes = [...series.entries()]
    .filter(([, records]) => records.length === 0)
    .map(([code]) => code)
    .sort();

  return { series, missingCodes, datesScanned };
}

/** 取り込み済み日付から得られる、その日の PIT ユニバース。 */
export function universeOn(tradingDate: string, root = resolveStoreRoot()): string[] {
  return readDateRecords(tradingDate, root)
    .filter((record) => record.status === "traded")
    .map((record) => record.code)
    .sort();
}

/**
 * 日付メジャーのストアから backtest 用の系列を組む。
 *
 * `selectPriceRecordsAsOf` は1銘柄ずつの API なので、4,400銘柄×520日を
 * 通すと同じデータを何度も走査することになる。ここは1パスで全銘柄ぶんを
 * 組むが、PIT のゲートは同じものを同じ順で掛ける。
 *
 * 改訂（同じ code+date に複数レコード）はこのストアでは起こらない
 * （日付ファイルは一度しか書かれない）。もし起きたら黙って片方を採らずに落ちる。
 */
export interface LoadBacktestSeriesResult {
  series: PriceSeries[];
  /** PIT ゲートで落ちた行数。内訳を出さないと「データが無い」と区別できない。 */
  skipped: {
    observedAtAfterAsOf: number;
    retrievedAtAfterAsOf: number;
    firstExecutableAtAfterAsOf: number;
    notTraded: number;
    outsideRequestedCodes: number;
  };
  datesScanned: number;
  rowsScanned: number;
}

export function loadBacktestSeriesAsOf(input: {
  asOf: string;
  from?: string;
  to?: string;
  /** 未指定なら全銘柄。 */
  codes?: Iterable<string>;
  root?: string;
}): LoadBacktestSeriesResult {
  const root = input.root ?? resolveStoreRoot();
  const from = input.from ? assertIsoDate(input.from, "from") : null;
  const to = input.to ? assertIsoDate(input.to, "to") : null;
  if (from && to && from > to) throw new Error(`from must be on or before to: ${from} > ${to}`);
  compareExplicitIso8601Instants(input.asOf, input.asOf, "asOf", "asOf");

  let wanted: Set<string> | null = null;
  if (input.codes !== undefined) {
    wanted = new Set<string>();
    for (const code of input.codes) {
      const trimmed = code.trim().toUpperCase();
      if (!/^[0-9A-Z]{4,5}$/.test(trimmed)) throw new Error(`invalid security code: ${code}`);
      wanted.add(trimmed);
    }
  }

  const bars = new Map<string, PriceBar[]>();
  const seen = new Set<string>();
  const skipped = {
    observedAtAfterAsOf: 0,
    retrievedAtAfterAsOf: 0,
    firstExecutableAtAfterAsOf: 0,
    notTraded: 0,
    outsideRequestedCodes: 0,
  };
  let datesScanned = 0;
  let rowsScanned = 0;

  for (const tradingDate of listIngestedDates(root)) {
    if (from && tradingDate < from) continue;
    if (to && tradingDate > to) continue;
    datesScanned += 1;

    // 同じファイル内の全行が同じ日付。文字列を1本だけ作って共有する
    // （2.16M 本の別インスタンスを作るとヒープが無駄に膨らむ）。
    const sharedDate = tradingDate;
    const content = readFileSync(resolve(root, `${tradingDate}.jsonl`), "utf-8");

    for (const raw of content.split("\n")) {
      if (!raw) continue;
      rowsScanned += 1;
      const record = JSON.parse(raw) as PitPriceRecord;

      if (wanted && !wanted.has(record.code)) { skipped.outsideRequestedCodes += 1; continue; }

      // PIT のゲート。selectPriceRecordsAsOf の "executable" 境界と同じ順序。
      if (compareExplicitIso8601Instants(record.observedAt, input.asOf, "observedAt", "asOf") > 0) {
        skipped.observedAtAfterAsOf += 1; continue;
      }
      if (compareExplicitIso8601Instants(record.retrievedAt, input.asOf, "retrievedAt", "asOf") > 0) {
        skipped.retrievedAtAfterAsOf += 1; continue;
      }
      if (compareExplicitIso8601Instants(record.firstExecutableAt, input.asOf, "firstExecutableAt", "asOf") > 0) {
        skipped.firstExecutableAtAfterAsOf += 1; continue;
      }
      if (record.status !== "traded" || !record.ohlcv) { skipped.notTraded += 1; continue; }

      const key = `${record.code}|${record.tradingDate}`;
      if (seen.has(key)) {
        throw new Error(
          `price store has two records for ${record.code} on ${record.tradingDate}. `
          + "改訂の解決はこのローダーの責務ではない。selectPriceRecordsAsOf を使うこと",
        );
      }
      seen.add(key);

      let bucket = bars.get(record.code);
      if (!bucket) { bucket = []; bars.set(record.code, bucket); }
      bucket.push({
        date: sharedDate,
        open: record.ohlcv.open,
        high: record.ohlcv.high,
        low: record.ohlcv.low,
        close: record.ohlcv.close,
        volume: record.ohlcv.volume,
      });
    }
  }

  // 日付ファイルは昇順に読むので bars は既に昇順。契約として明示しておく。
  const series = [...bars.entries()]
    .map(([code, values]) => ({ code, bars: values }))
    .sort((left, right) => left.code.localeCompare(right.code));

  return { series, skipped, datesScanned, rowsScanned };
}
