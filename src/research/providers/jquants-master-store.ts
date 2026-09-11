/**
 * 上場銘柄マスタ（J-Quants `/equities/master`）の保存庫。
 *
 * なぜ要るか:
 *   これまで銘柄は **コードしか持っていなかった**。走査の出力は `76030` の
 *   ような5桁で、人が読めない。さらに業種・規模区分が無いので
 *   - 対照群を「規模・業種でそろえる」ことができない
 *     （ロードマップ §7 が明示的に要求している）
 *   - read-across（同業への伝播）の peer を config に手で書くしかない
 *     （実測で登録は8社のみ）
 *
 * **急ぐ理由:**
 *   契約範囲は価格・決算と同じ2年のローリング窓（実測 2024-06-20 〜 2026-06-20）。
 *   今日取らなかった最古日は明日には取れない。
 *
 * なぜ日次で持つか（実測した変化の量・6ヶ月ごと）:
 *   属性変化 175 / 465 / 207 / 84 社、新規上場 63〜105、消滅 50〜90。
 *   業種も規模区分も市場区分も動く。**「変わらないはず」で1枚に畳まない。**
 *
 * 保存方針は決算と同じ。API の行を加工せず `raw` に入れ、同一性は
 * 保存する全項目のハッシュで見る。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const JQUANTS_MASTER_STORE_ROOT = "research/master/jquants-free-daily";
export const JQUANTS_MASTER_SOURCE_VERSION = "jquants-free-equities-master-v2";

/** 取り込み記録の台帳。保存庫に同居するので `_` で始める。 */
export const MASTER_INGEST_LEDGER_NAME = "_ingest-log.jsonl";

export interface EquityMasterRecord {
  schemaVersion: 1;
  source: "jquants";
  sourceVersion: string;
  providerPlan: "free";
  /** API に問い合わせた日付。`raw.Date` と一致することを取り込み時に検査する。 */
  queryDate: string;
  retrievedAt: string;
  ingestionRunId: string;
  contentHash: string;
  /** API の行そのまま。加工しない。 */
  raw: Record<string, unknown>;
}

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveMasterStoreRoot(root = JQUANTS_MASTER_STORE_ROOT): string {
  return resolve(process.cwd(), root);
}

/**
 * 保存する全項目からハッシュを作る。
 *
 * `raw` は JSON.stringify の**キー順に依存する**ので、キーを並べ替えてから
 * 文字列化する。API が項目の順を変えただけで「別の行」に見えると、
 * 重複検査が意味を失う。
 */
export function computeMasterRecordHash(
  input: Omit<EquityMasterRecord, "contentHash" | "retrievedAt" | "ingestionRunId">,
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

export function toEquityMasterRecord(input: {
  queryDate: string;
  raw: Record<string, unknown>;
  retrievedAt: string;
  ingestionRunId: string;
  sourceVersion?: string;
}): EquityMasterRecord {
  if (!ISO_DATE.test(input.queryDate)) {
    throw new Error(`master queryDate must be YYYY-MM-DD: ${input.queryDate}`);
  }
  const base = {
    schemaVersion: 1 as const,
    source: "jquants" as const,
    sourceVersion: input.sourceVersion ?? JQUANTS_MASTER_SOURCE_VERSION,
    providerPlan: "free" as const,
    queryDate: input.queryDate,
    raw: input.raw,
  };
  return {
    ...base,
    retrievedAt: input.retrievedAt,
    ingestionRunId: input.ingestionRunId,
    contentHash: computeMasterRecordHash(base),
  };
}

// --- 読み出し側の取り出し口 -------------------------------------------------
// `raw` を直接触る場所を増やさない。API の項目名が変わったらここだけ直す。

/** その日のマスタとしての基準日。 */
export function masterDateOf(record: EquityMasterRecord): string {
  return String(record.raw.Date ?? "");
}

/** J-Quants の5桁コード。価格・決算と同じ体系。 */
export function codeOf(record: EquityMasterRecord): string {
  return String(record.raw.Code ?? "");
}

/** 会社名（日本語）。走査の出力を人が読めるようにする。 */
export function companyNameOf(record: EquityMasterRecord): string {
  return String(record.raw.CoName ?? "");
}

/** 33業種コード。対照群を業種でそろえるのに使う。 */
export function sector33Of(record: EquityMasterRecord): string {
  return String(record.raw.S33 ?? "");
}

export function sector33NameOf(record: EquityMasterRecord): string {
  return String(record.raw.S33Nm ?? "");
}

/** 17業種コード。33業種が細かすぎて対照が作れないときの粗い区分。 */
export function sector17Of(record: EquityMasterRecord): string {
  return String(record.raw.S17 ?? "");
}

/** 規模区分（TOPIX Core30 / Large70 / Mid400 / Small など）。 */
export function scaleCategoryOf(record: EquityMasterRecord): string {
  return String(record.raw.ScaleCat ?? "");
}

/** 市場区分コード（プライム / スタンダード / グロース など）。 */
export function marketOf(record: EquityMasterRecord): string {
  return String(record.raw.Mkt ?? "");
}

/** `?date=` に対して API が何を返したかの判定。 */
export type MasterRowsDateCheck =
  | { kind: "matches" }
  /**
   * 休場日は**翌営業日のマスタが返る**（実測 2024-07-15 海の日 →
   * 全4,374行が 2024-07-16）。決算 `/fins/summary` は0件を返すので、
   * 同じ `?date=` でも端点ごとに挙動が違う。
   */
  | { kind: "rolled_forward"; returnedDate: string }
  /** 想定外。保存せずに止める。 */
  | { kind: "mismatch"; count: number; example: string };

/**
 * 返ってきた行が、問い合わせた日のものかを判定する。
 *
 * 黙って保存すると、保存庫の「その日」に別の日のマスタが混ざり、
 * PIT の属性として使った瞬間に狂う。
 */
export function classifyMasterRows(
  date: string,
  rows: readonly Record<string, unknown>[],
): MasterRowsDateCheck {
  if (rows.length === 0) return { kind: "matches" };
  const dates = new Set(rows.map((row) => String(row.Date ?? "")));
  if (dates.size === 1 && dates.has(date)) return { kind: "matches" };
  // 全行が同じ「後の日」なら、その日は立会が無く翌営業日へ送られている。
  if (dates.size === 1) {
    const returned = [...dates][0]!;
    if (returned > date) return { kind: "rolled_forward", returnedDate: returned };
  }
  const mismatched = rows.filter((row) => String(row.Date ?? "") !== date);
  return {
    kind: "mismatch",
    count: mismatched.length,
    example: `${String(mismatched[0]?.Date)} / Code=${String(mismatched[0]?.Code)}`,
  };
}

/** 保存してはいけない行のときに投げる。**再試行しても直らない。** */
export class MasterRowsDateError extends Error {}


// --- 保存庫の走査 -----------------------------------------------------------

export function listIngestedMasterDates(root = resolveMasterStoreRoot()): string[] {
  if (!existsSync(root)) return [];
  const dates: string[] = [];
  for (const name of readdirSync(root)) {
    const match = DATE_FILE.exec(name);
    if (match) dates.push(match[1]!);
  }
  return dates.sort();
}

export function readMasterDateRecords(
  date: string,
  root = resolveMasterStoreRoot(),
): EquityMasterRecord[] {
  const path = resolve(root, `${date}.jsonl`);
  if (!existsSync(path)) return [];
  const records: EquityMasterRecord[] = [];
  for (const [index, raw] of readFileSync(path, "utf-8").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as EquityMasterRecord);
    } catch (error) {
      throw new Error(`${path}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
  }
  return records;
}
