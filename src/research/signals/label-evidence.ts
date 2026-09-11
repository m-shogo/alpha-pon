/**
 * ラベル付けの証拠を、情報源に依らない形にそろえる。
 *
 * ## なぜ要るか
 *
 * 証拠は2系統ある。
 *
 * - **TDnet 適時開示**: 2026-08-03 以降しか無い（公開ビューアが約1ヶ月しか
 *   遡れないため）。見出しの日本語が手がかり。
 * - **EDINET 書類一覧**: 価格のある期間（2024-06-19〜）を丸ごとカバーする。
 *   臨時報告書の `currentReportReason` に事由コードが入る。
 *
 * 両方に別々の突合を書くと、時刻の扱いやコードの正規化が片方だけ変わる。
 * ここで同じ形にしてから、突合は1本で行う。
 *
 * ## コードは5桁にそろえる
 *
 * ```
 *   価格ストア  13010 / 72030   （5桁）
 *   EDINET     83040           （5桁・そのまま一致。実測264/268）
 *   TDnet      code=4891 / sourceCode=48910
 * ```
 *
 * TDnet だけ4桁の `code` を持つが、`sourceCode` が5桁なのでそちらを使う。
 * 4桁へ落としてから突き合わせると、5桁の予備コードが異なる銘柄を
 * 取り違える余地が残る。
 */

import type { ArchivedDisclosure } from "../../disclosure-archive.js";
import type { ArchivedEdinetDocument } from "../../edinet-document-archive.js";
import { buildPdfUrl } from "../../fetcher/edinet.js";

export type LabelEvidenceSource = "tdnet" | "edinet";

export interface LabelEvidence {
  source: LabelEvidenceSource;
  /** 価格ストアと同じ5桁コード。 */
  code: string;
  /** 観測した日（TDnet は一覧の日、EDINET は提出日）。 */
  observationDate: string;
  /**
   * 公表時刻。取り下げ行など時刻の無いものは null。
   * **無いものを推測で埋めない。** 引け前後の判定ができなくなるだけ。
   */
  publishedAt: string | null;
  title: string;
  url: string | null;
  /** EDINET 臨時報告書の事由（「第19条第2項第12号」等）。解釈はしない。 */
  reasonCode: string | null;
  /** EDINET の書類種別（180=臨時報告書 等）。 */
  documentTypeCode: string | null;
}

const FIVE_DIGIT = /^[0-9A-Z]{5}$/;

/** 5桁へそろえる。4桁なら末尾に予備コード 0 を補う。 */
export function toFiveDigitCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (FIVE_DIGIT.test(trimmed)) return trimmed;
  if (/^[0-9A-Z]{4}$/.test(trimmed)) return `${trimmed}0`;
  return null;
}

/**
 * TDnet の保存行を証拠にする。
 *
 * 5桁の `sourceCode` を優先する。無ければ4桁の `code` から補うが、
 * それは一覧の表示が5桁でなかった場合の保険。
 */
export function tdnetEvidence(row: ArchivedDisclosure): LabelEvidence | null {
  const code = toFiveDigitCode(row.sourceCode ?? row.code);
  if (!code) return null;
  return {
    source: "tdnet",
    code,
    observationDate: row.observationDate,
    publishedAt: row.publishedAt ?? null,
    title: row.title,
    url: row.url ?? null,
    reasonCode: null,
    documentTypeCode: null,
  };
}

/**
 * EDINET の保存行を証拠にする。
 *
 * `secCode` が無い提出者（投資信託など）は価格が無いので証拠にならない。
 * null を返して呼び出し側に落とさせる。
 *
 * `submitDateTime` は `YYYY-MM-DD HH:mm`（JST）。ISO へ直して返す。
 * 時差を付けずに渡すと、引け前後の判定が実行環境のタイムゾーンで変わる。
 */
export function edinetEvidence(row: ArchivedEdinetDocument): LabelEvidence | null {
  if (!row.secCode) return null;
  const code = toFiveDigitCode(row.secCode);
  if (!code) return null;
  return {
    source: "edinet",
    code,
    observationDate: row.submissionDate,
    publishedAt: toIsoJst(row.submitDateTime),
    title: row.docDescription ?? "",
    url: buildPdfUrl(row.docId),
    reasonCode: row.currentReportReason,
    documentTypeCode: row.docTypeCode,
  };
}

const EDINET_SUBMIT_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/** EDINET の `YYYY-MM-DD HH:mm`（JST）を明示オフセット付き ISO にする。 */
export function toIsoJst(value: string | null): string | null {
  if (!value) return null;
  const match = EDINET_SUBMIT_TIME.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}+09:00`;
}
