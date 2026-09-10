// Research OS — イベント原因ラベル台帳 v1。
//
// 目的:
//   価格から検出した候補に「なぜ下げたのか」を付け、
//   treatment（研究対象の事件）と control（それ以外）へ分ける。
//
// なぜ必要か（統合して初めて分かったこと）:
//   検出候補すべてを treatment にすると、対照が構造的に作れない。
//   対照は「同じくらい下げたが treatment ではない」ものなので、
//   同程度の下落を全部 treatment 側へ入れると候補が残らない。
//   PR #2033 の初回実行では対照 0 件 / 未マッチ 6 件になった。
//   ラベリングはチェーンの飾りではなく、比較を成立させるための必須工程。
//
// 設計方針:
//   - append-only。判断を後から書き換えない。
//     訂正は supersedesLabelId を持つ新しい行として追記する。
//   - **一次情報の URL を必須にする。** 記憶や推測でラベルを付けさせない。
//   - 「分からない」を正規のラベルとして持つ。
//     unknown を無理に misconduct へ寄せると母集団が汚れる。
//   - ラベルの付与者と時刻を残す。後から誰の判断か辿れるようにする。

import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseExplicitIso8601Instant } from "../iso-instant.js";
import { stableStringify } from "../schema.js";

export const DEFAULT_EVENT_LABELS_PATH = "research/event_labels.jsonl";

export const EVENT_CAUSE_LABELS = [
  /** 業績に無関係な不祥事・事故・事件 */
  "misconduct",
  /** 従業員・アルバイトによる不祥事 */
  "employee_misconduct",
  /** 子会社・関連会社に限定された問題 */
  "subsidiary_localized",
  /** 他社の事件による連れ安（read-across） */
  "read_across",
  /** 決算・業績修正など業績起因 */
  "earnings",
  /** 増資・資本政策 */
  "equity_offering",
  /** M&A・TOB・再編 */
  "corporate_action",
  /** 規制・行政処分・訴訟 */
  "regulatory_or_litigation",
  /** 地合い・セクター要因 */
  "market_or_sector",
  /** 調べたが原因を特定できなかった */
  "unknown",
] as const;

export type EventCauseLabel = (typeof EVENT_CAUSE_LABELS)[number];

/** treatment（研究対象）として扱ってよいラベル。それ以外は対照候補。 */
export const TREATMENT_LABELS: readonly EventCauseLabel[] = [
  "misconduct",
  "employee_misconduct",
  "subsidiary_localized",
  "read_across",
];

export interface EventLabelInput {
  candidateId: string;
  code: string;
  /** イベントが価格に出た営業日 */
  date: string;
  label: EventCauseLabel;
  /**
   * 一次情報の URL。記憶や推測でラベルを付けさせないため必須。
   * unknown ラベルでも「何を見て分からなかったか」を残す。
   */
  evidenceUrls: string[];
  /** 誰が付けたか。人間名・エージェント名など。 */
  labelledBy: string;
  /** 判断の根拠を一言で。 */
  rationale: string;
  /** 訂正のとき、置き換える対象の labelId。 */
  supersedesLabelId?: string;
}

export interface EventLabelRecord extends EventLabelInput {
  schemaVersion: 1;
  labelId: string;
  labelledAt: string;
}

const CODE_PATTERN = /^[0-9A-Z]{4,5}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`event label ${field} must be a non-empty string`);
  }
  return value;
}

function assertHttpsUrl(value: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${field} must use https: ${value}`);
  }
}

function assertInput(input: EventLabelInput): void {
  assertNonEmpty(input.candidateId, "candidateId");
  const code = assertNonEmpty(input.code, "code").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new Error(`event label code must be 4-5 alphanumeric: ${input.code}`);
  if (!ISO_DATE_PATTERN.test(input.date)) throw new Error(`event label date must be YYYY-MM-DD: ${input.date}`);
  if (!EVENT_CAUSE_LABELS.includes(input.label)) {
    throw new Error(`unknown event cause label: ${input.label}`);
  }
  assertNonEmpty(input.labelledBy, "labelledBy");
  assertNonEmpty(input.rationale, "rationale");
  if (!Array.isArray(input.evidenceUrls) || input.evidenceUrls.length === 0) {
    throw new Error(
      "event label evidenceUrls is required: 記憶や推測でラベルを付けない。"
      + "原因を特定できなかった場合も、何を見たかを残す",
    );
  }
  for (const [index, url] of input.evidenceUrls.entries()) {
    assertHttpsUrl(assertNonEmpty(url, `evidenceUrls[${index}]`), `evidenceUrls[${index}]`);
  }
}

export function computeEventLabelId(input: EventLabelInput): string {
  const canonical = stableStringify({
    candidateId: input.candidateId,
    code: input.code.trim().toUpperCase(),
    date: input.date,
    label: input.label,
    evidenceUrls: [...input.evidenceUrls].sort(),
    labelledBy: input.labelledBy,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function parseEventLabels(content: string, sourceName = "<memory>"): EventLabelRecord[] {
  const records: EventLabelRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: EventLabelRecord;
    try {
      parsed = JSON.parse(line) as EventLabelRecord;
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
    if (parsed.schemaVersion !== 1) throw new Error(`${sourceName}:${index + 1} schemaVersion must be 1`);
    parseExplicitIso8601Instant(parsed.labelledAt, `${sourceName}:${index + 1} labelledAt`);
    assertInput(parsed);
    records.push(parsed);
  }
  return records;
}

export function readEventLabels(path: string = DEFAULT_EVENT_LABELS_PATH): EventLabelRecord[] {
  if (!existsSync(path)) return [];
  return parseEventLabels(readFileSync(path, "utf-8"), path);
}

export function appendEventLabel(
  input: EventLabelInput,
  path: string = DEFAULT_EVENT_LABELS_PATH,
  now: Date = new Date(),
): { labelId: string; appended: boolean } {
  assertInput(input);
  const existing = readEventLabels(path);

  if (input.supersedesLabelId !== undefined) {
    if (!existing.some((record) => record.labelId === input.supersedesLabelId)) {
      throw new Error(`cannot supersede an unknown label: ${input.supersedesLabelId}`);
    }
  }

  const labelId = computeEventLabelId(input);
  if (existing.some((record) => record.labelId === labelId)) {
    return { labelId, appended: false };
  }

  const record: EventLabelRecord = {
    schemaVersion: 1,
    labelId,
    labelledAt: now.toISOString(),
    ...input,
    code: input.code.trim().toUpperCase(),
  };
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a");
  try {
    appendFileSync(fd, `${JSON.stringify(record)}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return { labelId, appended: true };
}

export interface ResolvedLabels {
  /** candidateId -> 有効なラベル（訂正後の最終판定）。 */
  byCandidateId: Map<string, EventLabelRecord>;
  /** 訂正で置き換えられた labelId。 */
  supersededLabelIds: Set<string>;
}

/**
 * 訂正チェーンを解決して、候補ごとの最終ラベルを返す。
 * 同じ候補に複数の有効ラベルが残る場合は矛盾として例外にする。
 */
export function resolveEventLabels(records: readonly EventLabelRecord[]): ResolvedLabels {
  const superseded = new Set<string>();
  for (const record of records) {
    if (record.supersedesLabelId) superseded.add(record.supersedesLabelId);
  }
  const byCandidateId = new Map<string, EventLabelRecord>();
  for (const record of records) {
    if (superseded.has(record.labelId)) continue;
    const previous = byCandidateId.get(record.candidateId);
    if (previous && previous.labelId !== record.labelId) {
      throw new Error(
        `candidate ${record.candidateId} has conflicting active labels `
        + `(${previous.label} / ${record.label}). 訂正するなら supersedesLabelId を指定してください`,
      );
    }
    byCandidateId.set(record.candidateId, record);
  }
  return { byCandidateId, supersededLabelIds: superseded };
}

export interface TreatmentSplit {
  treatmentCandidateIds: string[];
  controlPoolCandidateIds: string[];
  unlabelledCandidateIds: string[];
  countByLabel: Record<string, number>;
}

/**
 * 候補を treatment / 対照候補 / 未ラベルへ分ける。
 *
 * 未ラベルは treatment にも対照にもしない。
 * 「分からないものを研究対象に混ぜない」のが要点。
 */
export function splitCandidatesByLabel(
  candidateIds: readonly string[],
  resolved: ResolvedLabels,
  treatmentLabels: readonly EventCauseLabel[] = TREATMENT_LABELS,
): TreatmentSplit {
  const treatmentSet = new Set(treatmentLabels);
  const treatmentCandidateIds: string[] = [];
  const controlPoolCandidateIds: string[] = [];
  const unlabelledCandidateIds: string[] = [];
  const countByLabel: Record<string, number> = {};

  for (const candidateId of [...candidateIds].sort()) {
    const record = resolved.byCandidateId.get(candidateId);
    if (!record) {
      unlabelledCandidateIds.push(candidateId);
      continue;
    }
    countByLabel[record.label] = (countByLabel[record.label] ?? 0) + 1;
    if (treatmentSet.has(record.label)) treatmentCandidateIds.push(candidateId);
    else controlPoolCandidateIds.push(candidateId);
  }

  return { treatmentCandidateIds, controlPoolCandidateIds, unlabelledCandidateIds, countByLabel };
}
