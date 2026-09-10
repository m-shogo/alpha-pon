/**
 * TDnet 開示の保存庫。
 *
 * ## なぜ要るか
 *
 * daily は毎朝 TDnet を取得しているが、キーワード抽出に使ったあと**捨てていた**。
 * TDnet の公開閲覧サービスは約1ヶ月しか遡れない（実測: 2026-06-10 も
 * 2025-09-10 も `first page not found`）。
 * **保存しなかった日の開示は永久に失われる。**
 *
 * 不祥事・子会社問題といったイベントの Edge を検証するには、
 * 「いつ・どの会社に・何が起きたか」のラベルが要る。TDnet の適時開示は
 * その一次情報で、公式 URL という証拠も付く。過去に遡って取れない以上、
 * **今日から貯めるしかない。**
 *
 * ## 保存の方針
 *
 * - 観測日ごとに1ファイル（`<YYYY-MM-DD>.jsonl`）。取得は日次なので素直に対応する
 * - 追記のみ。同じ開示が複数回観測されても contentHash で畳む
 * - **取り下げられた開示も残す。** 取り下げそのものが事象であり、
 *   「その日に何が出て、何が消えたか」を後から復元できないと使えない
 * - 再配布の判断を避けるため**ローカル限定**にする（価格ストアと同じ扱い）
 *
 * ## 失敗したら止める
 *
 * 保存に失敗したら例外を投げる。「今日のレポートが1段欠ける」は再実行で
 * 取り戻せるが、「その日の開示を保存し損ねた」は二度と取り戻せない。
 */

import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { tdnetIssuerCode } from "./fetcher/jpx.js";
import type {
  TdnetDisclosure,
  TdnetDisclosureSnapshot,
  TdnetWithdrawnDisclosure,
} from "./fetcher/jpx.js";

export const DISCLOSURE_ARCHIVE_ROOT = "data/disclosures";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVE_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export type ArchivedDisclosureStatus = "published" | "withdrawn";

export interface ArchivedDisclosure {
  schemaVersion: 1;
  /** TDnet 一覧を観測した日。開示の公表日と一致するとは限らない。 */
  observationDate: string;
  status: ArchivedDisclosureStatus;
  code: string;
  sourceCode?: string;
  companyName: string;
  title: string;
  /**
   * 一覧に表示された公表時刻。Market Event の EventTime へ流用しない。
   * 取り下げ行には無い（一覧から時刻ごと落ちる）。
   */
  publishedAt?: string;
  /** 取り下げ行には無い（開示書類へのリンクが外される）。 */
  url?: string;
  /** 取り下げの場合の履歴欄の生テキスト。 */
  historyText?: string;
  retrievedAt: string;
  contentHash: string;
}

export function assertIsoDate(value: string, field: string): string {
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

/**
 * 同じ開示かどうかの判定。
 *
 * 観測時刻は含めない。同じ開示を翌日も観測しても同じ事実。
 * 一方 `status` は含める。公開されていたものが取り下げられたら別の事実で、
 * 両方が残っていないと「何が消えたか」を復元できない。
 */
export function computeDisclosureHash(input: {
  status: ArchivedDisclosureStatus;
  code: string;
  title: string;
  publishedAt?: string;
  url?: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.status,
      input.code,
      input.title,
      input.publishedAt ?? null,
      input.url ?? null,
    ]))
    .digest("hex");
}

function publishedRow(input: {
  observationDate: string;
  disclosure: TdnetDisclosure;
  retrievedAt: string;
}): ArchivedDisclosure {
  const { disclosure } = input;
  if (!disclosure.code || !disclosure.title || !disclosure.url) {
    throw new Error(`incomplete TDnet disclosure: ${JSON.stringify(disclosure)}`);
  }
  return {
    schemaVersion: 1,
    observationDate: input.observationDate,
    status: "published",
    code: disclosure.code,
    ...(disclosure.sourceCode ? { sourceCode: disclosure.sourceCode } : {}),
    companyName: disclosure.companyName,
    title: disclosure.title,
    publishedAt: disclosure.publishedAt,
    url: disclosure.url,
    retrievedAt: input.retrievedAt,
    contentHash: computeDisclosureHash({
      status: "published",
      code: disclosure.code,
      title: disclosure.title,
      publishedAt: disclosure.publishedAt,
      url: disclosure.url,
    }),
  };
}

/**
 * 取り下げ行。
 *
 * 一覧から公表時刻とリンクが落ちるので `publishedAt` / `url` は持てない。
 * 持てないものを空文字で埋めない（あとで「時刻が不明」と「時刻が空」を
 * 区別できなくなる）。発行体コードは公開行と同じ変換で作る。
 */
function withdrawnRow(input: {
  observationDate: string;
  withdrawn: TdnetWithdrawnDisclosure;
  retrievedAt: string;
}): ArchivedDisclosure {
  const { withdrawn } = input;
  if (!withdrawn.sourceCode || !withdrawn.title) {
    throw new Error(`incomplete withdrawn TDnet row: ${JSON.stringify(withdrawn)}`);
  }
  const code = tdnetIssuerCode(withdrawn.sourceCode);
  return {
    schemaVersion: 1,
    observationDate: input.observationDate,
    status: "withdrawn",
    code,
    sourceCode: withdrawn.sourceCode,
    companyName: withdrawn.companyName,
    title: withdrawn.title,
    ...(withdrawn.historyText ? { historyText: withdrawn.historyText } : {}),
    retrievedAt: input.retrievedAt,
    contentHash: computeDisclosureHash({ status: "withdrawn", code, title: withdrawn.title }),
  };
}

/** スナップショットを保存用の行へ変換する（I/O はしない）。 */
export function toArchivedDisclosures(
  snapshot: TdnetDisclosureSnapshot,
  retrievedAt: string,
): ArchivedDisclosure[] {
  const observationDate = assertIsoDate(snapshot.observationDate, "snapshot.observationDate");
  const rows: ArchivedDisclosure[] = [];
  for (const disclosure of snapshot.disclosures) {
    rows.push(publishedRow({ observationDate, disclosure, retrievedAt }));
  }
  for (const withdrawn of snapshot.withdrawn) {
    rows.push(withdrawnRow({ observationDate, withdrawn, retrievedAt }));
  }
  return rows;
}

export function archiveRoot(root = DISCLOSURE_ARCHIVE_ROOT): string {
  return resolve(process.cwd(), root);
}

export function archivePath(observationDate: string, root = archiveRoot()): string {
  return resolve(root, `${assertIsoDate(observationDate, "observationDate")}.jsonl`);
}

export function readArchivedDisclosures(
  observationDate: string,
  root = archiveRoot(),
): ArchivedDisclosure[] {
  const path = archivePath(observationDate, root);
  if (!existsSync(path)) return [];
  const rows: ArchivedDisclosure[] = [];
  for (const [index, raw] of readFileSync(path, "utf-8").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line) as ArchivedDisclosure);
    } catch (error) {
      throw new Error(`${path}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
  }
  return rows;
}

export function listArchivedDates(root = archiveRoot()): string[] {
  if (!existsSync(root)) return [];
  const dates: string[] = [];
  for (const name of readdirSync(root)) {
    const match = ARCHIVE_FILE.exec(name);
    if (match) dates.push(match[1]!);
  }
  return dates.sort();
}

export interface ArchiveAppendResult {
  observationDate: string;
  appended: number;
  /** すでに保存済みだった行数。 */
  alreadyPresent: number;
  path: string;
}

/**
 * 観測結果を追記する。すでに保存済みの開示は畳む。
 *
 * 0件のスナップショットでもファイルを作る。**「その日は開示が無かった」と
 * 「その日は観測しなかった」を区別できないと、後から穴を埋められない。**
 */
export function appendDisclosureSnapshot(input: {
  snapshot: TdnetDisclosureSnapshot;
  retrievedAt: string;
  root?: string;
}): ArchiveAppendResult {
  const root = input.root ?? archiveRoot();
  const rows = toArchivedDisclosures(input.snapshot, input.retrievedAt);
  const observationDate = assertIsoDate(input.snapshot.observationDate, "snapshot.observationDate");
  const path = archivePath(observationDate, root);

  mkdirSync(root, { recursive: true, mode: 0o700 });
  const existing = new Set(readArchivedDisclosures(observationDate, root).map((row) => row.contentHash));

  const fresh: ArchivedDisclosure[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (existing.has(row.contentHash) || seen.has(row.contentHash)) continue;
    seen.add(row.contentHash);
    fresh.push(row);
  }

  if (fresh.length > 0) {
    appendFileSync(path, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`, { mode: 0o600 });
  } else if (!existsSync(path)) {
    // 0件の日も観測した事実を残す。空ファイルが「観測したが開示なし」。
    appendFileSync(path, "", { mode: 0o600 });
  }
  chmodSync(path, 0o600);

  return {
    observationDate,
    appended: fresh.length,
    alreadyPresent: rows.length - fresh.length,
    path,
  };
}
