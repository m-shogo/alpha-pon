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
