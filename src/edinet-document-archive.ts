/**
 * EDINET 書類一覧の保存庫。
 *
 * ## なぜ要るか
 *
 * 不祥事・子会社イベントの Edge を検証するには、価格のある期間のラベルが要る。
 * TDnet は約1ヶ月しか遡れないので、保存を始めた 2026-08-03 以降しか無い。
 * 一方 J-Quants Free の価格は84日遅延で上限が 2026-06-19。
 * **この2つは重ならない。**
 *
 * EDINET の書類一覧 API は過去日を返す（実測 2024-06-19 / 2026-06-18 とも
 * HTTP 200、上場会社の臨時報告書が1日40件前後）。**価格のある期間を
 * 丸ごとカバーできる。**
 *
 * 臨時報告書（docTypeCode=180）には `currentReportReason` に
 * 「第19条第2項第N号」という事由コードが入っている。何号が何を指すかの
 * 解釈はここではしない（法令の読みを勝手に決めない）。**コードをそのまま
 * 残す。** 意味づけは別工程で、条文を確認した人が行う。
 *
 * ## 保存の方針
 *
 * TDnet の保存庫と同じ。提出日ごとに1ファイル、追記のみ、0件の日も
 * ファイルを作る（「無かった日」と「観測していない日」を区別する）。
 * 再配布の判断を避けるためローカル限定。
 */

import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { EdinetDoc } from "./fetcher/edinet.js";

export const EDINET_DOCUMENT_ARCHIVE_ROOT = "data/edinet-documents";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVE_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

export interface ArchivedEdinetDocument {
  schemaVersion: 1;
  /** 一覧を要求した日（EDINET の提出日）。 */
  submissionDate: string;
  docId: string;
  edinetCode: string;
  /** 上場していない提出者（投資信託など）では null。 */
  secCode: string | null;
  filerName: string;
  docTypeCode: string | null;
  docDescription: string | null;
  /** 臨時報告書の事由。「第19条第2項第N号」等。意味づけはしない。 */
  currentReportReason: string | null;
  /** 提出時刻。引け後なら価格に出るのは翌営業日。 */
  submitDateTime: string | null;
  ordinanceCode: string | null;
  formCode: string | null;
  parentDocId: string | null;
  withdrawalStatus: string | null;
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

function nullable(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 同じ事実かどうかの判定。
 *
 * **`docID` は一意ではない。** 実測（2024-06-20、591件）で、同じ docID の行が
 * 2組あり、`docDescription` が違っていた:
 *
 * ```
 *   S100TN4F  大量保有報告書 / 変更報告書
 *   S100TNU6  内部統制報告書－第124期(2024/06/19－2024/06/19)
 *             内部統制報告書－第124期(2023/04/01－2024/03/31)
 * ```
 * ```
 *
 * 最初は (提出日, docID, 取り下げ状態) で畳んでいて、**別々の事実を
 * 静かに1つに潰していた。** 保存する内容すべてで判定する。
 *
 * 観測時刻は含めない（同じ書類を翌日も観測しても同じ事実）。
 */
export function computeEdinetDocumentHash(input: Omit<ArchivedEdinetDocument, "contentHash">): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.submissionDate,
      input.docId,
      input.edinetCode,
      input.secCode,
      input.filerName,
      input.docTypeCode,
      input.docDescription,
      input.currentReportReason,
      input.submitDateTime,
      input.ordinanceCode,
      input.formCode,
      input.parentDocId,
      input.withdrawalStatus,
    ]))
    .digest("hex");
}

export function toArchivedEdinetDocument(input: {
  submissionDate: string;
  doc: EdinetDoc;
}): ArchivedEdinetDocument {
  const submissionDate = assertIsoDate(input.submissionDate, "submissionDate");
  const docId = nullable(input.doc.docID);
  if (!docId) throw new Error(`EDINET document has no docID: ${JSON.stringify(input.doc).slice(0, 200)}`);
  const withdrawalStatus = nullable(input.doc.withdrawalStatus);

  const fields = {
    schemaVersion: 1 as const,
    submissionDate,
    docId,
    edinetCode: nullable(input.doc.edinetCode) ?? "",
    secCode: nullable(input.doc.secCode),
    filerName: nullable(input.doc.filerName) ?? "",
    docTypeCode: nullable(input.doc.docTypeCode),
    docDescription: nullable(input.doc.docDescription),
    currentReportReason: nullable(input.doc.currentReportReason),
    submitDateTime: nullable(input.doc.submitDateTime),
    ordinanceCode: nullable(input.doc.ordinanceCode),
    formCode: nullable(input.doc.formCode),
    parentDocId: nullable(input.doc.parentDocID),
    withdrawalStatus,
  };
  return { ...fields, contentHash: computeEdinetDocumentHash(fields) };
}

export function archiveRoot(root = EDINET_DOCUMENT_ARCHIVE_ROOT): string {
  return resolve(process.cwd(), root);
}

export function archivePath(submissionDate: string, root = archiveRoot()): string {
  return resolve(root, `${assertIsoDate(submissionDate, "submissionDate")}.jsonl`);
}

export function readArchivedEdinetDocuments(
  submissionDate: string,
  root = archiveRoot(),
): ArchivedEdinetDocument[] {
  const path = archivePath(submissionDate, root);
  if (!existsSync(path)) return [];
  const rows: ArchivedEdinetDocument[] = [];
  for (const [index, raw] of readFileSync(path, "utf-8").split("\n").entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line) as ArchivedEdinetDocument);
    } catch (error) {
      throw new Error(`${path}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
  }
  return rows;
}

export function listArchivedEdinetDates(root = archiveRoot()): string[] {
  if (!existsSync(root)) return [];
  const dates: string[] = [];
  for (const name of readdirSync(root)) {
    const match = ARCHIVE_FILE.exec(name);
    if (match) dates.push(match[1]!);
  }
  return dates.sort();
}

export interface EdinetArchiveAppendResult {
  submissionDate: string;
  appended: number;
  alreadyPresent: number;
  path: string;
}

/**
 * 1日ぶんの一覧を追記する。
 *
 * 0件の日も空ファイルを作る。「書類が無かった日」と「観測しなかった日」を
 * 区別できないと、あとから穴を埋められない。
 */
export function appendEdinetDocuments(input: {
  submissionDate: string;
  docs: readonly EdinetDoc[];
  root?: string;
}): EdinetArchiveAppendResult {
  const root = input.root ?? archiveRoot();
  const submissionDate = assertIsoDate(input.submissionDate, "submissionDate");
  const rows = input.docs.map((doc) => toArchivedEdinetDocument({ submissionDate, doc }));
  const path = archivePath(submissionDate, root);

  mkdirSync(root, { recursive: true, mode: 0o700 });
  const existing = new Set(
    readArchivedEdinetDocuments(submissionDate, root).map((row) => row.contentHash),
  );

  const fresh: ArchivedEdinetDocument[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (existing.has(row.contentHash) || seen.has(row.contentHash)) continue;
    seen.add(row.contentHash);
    fresh.push(row);
  }

  if (fresh.length > 0) {
    appendFileSync(path, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`, { mode: 0o600 });
  } else if (!existsSync(path)) {
    appendFileSync(path, "", { mode: 0o600 });
  }
  chmodSync(path, 0o600);

  return {
    submissionDate,
    appended: fresh.length,
    alreadyPresent: rows.length - fresh.length,
    path,
  };
}
