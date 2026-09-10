// Research OS — 試行回数台帳 v1。
//
// 目的:
//   「何回試したか」を人間の記憶ではなくファイルに固定する。
//
// なぜ必要か:
//   False Discovery Guard は試行回数に応じて要求 t 値を上げる仕組みだが、
//   その試行回数を呼び出し側が自己申告していた。閾値を10通り試して
//   一番良かった1本だけを trials=1 で報告しても、誰も止められない。
//   個人の裁量研究が失敗する最大の理由は過剰適合であり、
//   それを防ぐ唯一の実効手段が事前登録と試行回数の記録である。
//
// 設計方針:
//   - append-only。既存行の書き換え・削除・並べ替えを行わない
//   - 結果を見る **前** に登録する。登録済み試行は結果が無くても回数に数える
//     （都合の悪い試行を無かったことにできない）
//   - 同一パラメータ・同一データの再実行は新規試行にしない
//     （再現性の確認を罰しない）
//   - 未登録の trialId に結果を書けない
//   - 同一試行に異なる結果を書けない（決定論の破れを検出する）

import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { parseExplicitIso8601Instant } from "./iso-instant.js";
import { stableStringify } from "./schema.js";

export const DEFAULT_TRIALS_LEDGER_PATH = "research/trials.jsonl";

export interface TrialRegistrationInput {
  edgeId: string;
  specId: string;
  /** 試したパラメータ一式。1つでも違えば別試行として数える。 */
  params: Record<string, unknown>;
  /** 入力データの指紋。同じパラメータでも対象データが違えば別試行。 */
  datasetFingerprint: string;
  /** 何を確かめようとしたのか。空文字は許さない。 */
  intent: string;
}

export interface TrialOutcome {
  executedCount: number;
  meanNetAlphaBps: number;
  tStat: number | null;
  clusteredTStat: number | null;
  clusterCount: number | null;
}

export interface TrialRegistrationRecord extends TrialRegistrationInput {
  schemaVersion: 1;
  kind: "registration";
  trialId: string;
  recordedAt: string;
}

export interface TrialOutcomeRecord {
  schemaVersion: 1;
  kind: "outcome";
  trialId: string;
  recordedAt: string;
  outcome: TrialOutcome;
}

export type TrialRecord = TrialRegistrationRecord | TrialOutcomeRecord;

/** 同一の実験を一意に決める指紋。edgeId / specId / params / データが揃って同じなら同じ試行。 */
export function computeTrialId(input: TrialRegistrationInput): string {
  const canonical = stableStringify({
    edgeId: input.edgeId,
    specId: input.specId,
    params: input.params,
    datasetFingerprint: input.datasetFingerprint,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** 入力データの指紋。signal と価格が変われば別データとして扱う。 */
export function computeDatasetFingerprint(input: {
  signalIds: readonly string[];
  priceCodes: readonly string[];
  benchmarkCode?: string;
  asOf: string;
}): string {
  const canonical = stableStringify({
    signalIds: [...input.signalIds].sort(),
    priceCodes: [...input.priceCodes].sort(),
    benchmarkCode: input.benchmarkCode ?? null,
    asOf: input.asOf,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function assertNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`trial ${field} must be a non-empty string`);
  }
  return value;
}

function assertRegistrationInput(input: TrialRegistrationInput): void {
  assertNonEmpty(input.edgeId, "edgeId");
  assertNonEmpty(input.specId, "specId");
  assertNonEmpty(input.datasetFingerprint, "datasetFingerprint");
  assertNonEmpty(input.intent, "intent");
  if (input.params === null || typeof input.params !== "object" || Array.isArray(input.params)) {
    throw new Error("trial params must be a plain object");
  }
}

export function parseTrialLedger(content: string, sourceName = "<memory>"): TrialRecord[] {
  const records: TrialRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: TrialRecord;
    try {
      parsed = JSON.parse(line) as TrialRecord;
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
    if (parsed.schemaVersion !== 1) {
      throw new Error(`${sourceName}:${index + 1} schemaVersion must be 1`);
    }
    if (parsed.kind !== "registration" && parsed.kind !== "outcome") {
      throw new Error(`${sourceName}:${index + 1} kind must be registration or outcome`);
    }
    parseExplicitIso8601Instant(parsed.recordedAt, `${sourceName}:${index + 1} recordedAt`);
    records.push(parsed);
  }
  return records;
}

export function readTrialLedger(path: string = DEFAULT_TRIALS_LEDGER_PATH): TrialRecord[] {
  if (!existsSync(path)) return [];
  return parseTrialLedger(readFileSync(path, "utf-8"), path);
}

function appendRecord(path: string, record: TrialRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a");
  try {
    appendFileSync(fd, `${JSON.stringify(record)}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * ある Edge についてこれまでに登録された試行数。
 * 結果が未記録の試行も数える。都合の悪い試行を無かったことにさせないため。
 */
export function countTrials(records: readonly TrialRecord[], edgeId: string): number {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.kind === "registration" && record.edgeId === edgeId) ids.add(record.trialId);
  }
  return ids.size;
}

export interface RegisterTrialResult {
  trialId: string;
  /** 新規試行として台帳に追加されたか。既存と同一なら false。 */
  isNew: boolean;
  /** この Edge の累計試行数（この登録を含む）。False Discovery Guard へ渡す。 */
  trialCount: number;
}

/**
 * 結果を見る前に試行を登録する。同一内容の再実行は新規試行にしない。
 */
export function registerTrial(
  input: TrialRegistrationInput,
  path: string = DEFAULT_TRIALS_LEDGER_PATH,
  now: Date = new Date(),
): RegisterTrialResult {
  assertRegistrationInput(input);
  const trialId = computeTrialId(input);
  const existing = readTrialLedger(path);
  const already = existing.some(
    (record) => record.kind === "registration" && record.trialId === trialId,
  );

  if (!already) {
    const record: TrialRegistrationRecord = {
      schemaVersion: 1,
      kind: "registration",
      trialId,
      recordedAt: now.toISOString(),
      ...input,
    };
    appendRecord(path, record);
    existing.push(record);
  }

  return { trialId, isNew: !already, trialCount: countTrials(existing, input.edgeId) };
}

/**
 * 登録済み試行に結果を紐付ける。
 * 未登録の trialId は拒否する（結果だけ後から生やせない）。
 * 同一試行に異なる結果を書こうとした場合も拒否する（決定論の破れ）。
 */
export function recordTrialOutcome(
  trialId: string,
  outcome: TrialOutcome,
  path: string = DEFAULT_TRIALS_LEDGER_PATH,
  now: Date = new Date(),
): { appended: boolean } {
  assertNonEmpty(trialId, "trialId");
  const records = readTrialLedger(path);
  const registered = records.some(
    (record) => record.kind === "registration" && record.trialId === trialId,
  );
  if (!registered) {
    throw new Error(`cannot record an outcome for an unregistered trial: ${trialId}`);
  }

  const previous = records.find(
    (record): record is TrialOutcomeRecord => record.kind === "outcome" && record.trialId === trialId,
  );
  if (previous) {
    if (stableStringify(previous.outcome) !== stableStringify(outcome)) {
      throw new Error(
        `trial ${trialId} already has a different outcome; the pipeline is not deterministic`,
      );
    }
    return { appended: false };
  }

  appendRecord(path, {
    schemaVersion: 1,
    kind: "outcome",
    trialId,
    recordedAt: now.toISOString(),
    outcome,
  });
  return { appended: true };
}
