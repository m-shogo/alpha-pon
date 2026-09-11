/**
 * 決算開示（J-Quants `/fins/summary`）の保存庫。
 *
 * なぜ要るか:
 *   F1 の候補（-10%級の急落）には決算反応が混ざる。`knownEventDates` が
 *   空のままだと、不祥事 Edge を測っても中身の大半が決算かもしれない、
 *   という状態が残る。決算発表日はその切り分けの前提。
 *
 *   さらに `EarnForecastRevision`（業績予想修正）は、それ自体が
 *   検証に値するイベント種別。実測で 2025-05-09 の 510件中 39件。
 *
 * **急ぐ理由:**
 *   契約範囲は2年のローリング窓（実測 2024-06-19 〜 2026-06-19）。
 *   今日取らなかった最古日は明日には取れない。**取り逃した日は永久に戻らない。**
 *
 * 保存方針:
 *   API の行を **加工せずそのまま** `raw` に入れる。いま使う項目だけ抜き出すと、
 *   後で別の項目が要るとわかったときに、その日はもう契約範囲の外にいる。
 *   同一性は保存する全項目のハッシュで見る。`DiscNo` は実測では一意だったが、
 *   EDINET の docID が実際に衝突した前例があるので ID を信用しない。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const JQUANTS_FINS_STORE_ROOT = "research/fins/jquants-free-daily";
export const JQUANTS_FINS_SOURCE_VERSION = "jquants-free-fins-summary-v2";

/** 取り込み記録の台帳。保存庫に同居するので `_` で始める。 */
export const FINS_INGEST_LEDGER_NAME = "_ingest-log.jsonl";

export interface FinsDisclosureRecord {
  schemaVersion: 1;
  source: "jquants";
  sourceVersion: string;
  providerPlan: "free";
  /** API に問い合わせた日付。`raw.DiscDate` と一致することを取り込み時に検査する。 */
  queryDate: string;
  retrievedAt: string;
  ingestionRunId: string;
  contentHash: string;
  /** API の行そのまま。加工しない。 */
  raw: Record<string, unknown>;
}

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveFinsStoreRoot(root = JQUANTS_FINS_STORE_ROOT): string {
  return resolve(process.cwd(), root);
}

/**
 * 保存する全項目からハッシュを作る。
 *
 * `raw` は JSON.stringify の**キー順に依存する**ので、キーを並べ替えてから
 * 文字列化する。API が項目の順を変えただけで「別の行」に見えると、
 * 重複検査が意味を失う。
 */
export function computeFinsRecordHash(
  input: Omit<FinsDisclosureRecord, "contentHash" | "retrievedAt" | "ingestionRunId">,
): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.schemaVersion,
      input.source,
      input.sourceVersion,
      input.providerPlan,
      input.queryDate,
      stableStringify(input.raw),
    ]))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function toFinsDisclosureRecord(input: {
  queryDate: string;
  raw: Record<string, unknown>;
  retrievedAt: string;
  ingestionRunId: string;
  sourceVersion?: string;
}): FinsDisclosureRecord {
  if (!ISO_DATE.test(input.queryDate)) {
    throw new Error(`fins queryDate must be YYYY-MM-DD: ${input.queryDate}`);
  }
  const base = {
    schemaVersion: 1 as const,
    source: "jquants" as const,
    sourceVersion: input.sourceVersion ?? JQUANTS_FINS_SOURCE_VERSION,
    providerPlan: "free" as const,
    queryDate: input.queryDate,
    raw: input.raw,
  };
  return {
    ...base,
    retrievedAt: input.retrievedAt,
    ingestionRunId: input.ingestionRunId,
    contentHash: computeFinsRecordHash(base),
  };
}

// --- 読み出し側の取り出し口 -------------------------------------------------
// `raw` を直接触る場所を増やさない。API の項目名が変わったらここだけ直す。

export function disclosedDateOf(record: FinsDisclosureRecord): string {
  return String(record.raw.DiscDate ?? "");
}

/** `HH:MM:SS`。取引時間中か引け後かの判定に使う。 */
export function disclosedTimeOf(record: FinsDisclosureRecord): string {
  return String(record.raw.DiscTime ?? "");
}

/** J-Quants の5桁コード（例 `85370`）。 */
export function codeOf(record: FinsDisclosureRecord): string {
  return String(record.raw.Code ?? "");
}

export function docTypeOf(record: FinsDisclosureRecord): string {
  return String(record.raw.DocType ?? "");
}

export function disclosureNumberOf(record: FinsDisclosureRecord): string {
  return String(record.raw.DiscNo ?? "");
}

/**
 * 問い合わせた日と `DiscDate` が食い違う行があれば止める。
 *
 * 実測（3日・2,248行）では0件だった。**前提が崩れたら気づけるようにする。**
 * 黙って保存すると、保存庫の「その日」に別の日の開示が混ざり、
 * イベント日として使った瞬間に測定が狂う。
 */
export function assertRowsBelongToDate(
  date: string,
  rows: readonly Record<string, unknown>[],
): void {
  const mismatched = rows.filter((row) => String(row.DiscDate ?? "") !== date);
  if (mismatched.length === 0) return;
  throw new Error(
    `${date}: DiscDate が問い合わせた日と違う行が ${mismatched.length} 件ある`
    + `（例: ${String(mismatched[0]!.DiscDate)} / Code=${String(mismatched[0]!.Code)}）。`
    + "`?date=` の意味が変わった可能性。保存せずに止める",
  );
}

/**
 * 当期の会社予想営業利益（`FOP`）。取得できなければ null。
 *
 * **null は 0 ではない。** 銀行・保険は営業利益を出さない（経常利益で開示する）し、
 * IFRS や配当予想の修正だけの開示にも入っていない。
 * 実測（保存済み 21,388件）で `FOP` の充足率は 66.7%。
 * 0 として扱うと「予想を減額した」に見えるので、判定できない開示は
 * 呼び出し側で落とす（earnings-gap は fail closed で落とす）。
 *
 * J-Quants は数値を文字列で返す。空文字は欠損。
 */
export function forecastOperatingProfitOf(record: FinsDisclosureRecord): number | null {
  return numberOrNull(record.raw.FOP);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- 保存庫の走査 -----------------------------------------------------------

export function listIngestedFinsDates(root = resolveFinsStoreRoot()): string[] {
  if (!existsSync(root)) return [];
  const dates: string[] = [];
  for (const name of readdirSync(root)) {
    const match = DATE_FILE.exec(name);
    if (match) dates.push(match[1]!);
  }
  return dates.sort();
}

export function readFinsDateRecords(
  date: string,
  root = resolveFinsStoreRoot(),
): FinsDisclosureRecord[] {
  const path = resolve(root, `${date}.jsonl`);
  if (!existsSync(path)) return [];
  const records: FinsDisclosureRecord[] = [];
  for (const [index, raw] of readFileSync(path, "utf-8").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as FinsDisclosureRecord);
    } catch (error) {
      throw new Error(`${path}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
  }
  return records;
}
