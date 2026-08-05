// Research OS — PIT Price Store foundation.
//
// Principles:
// - observedAt is the point-in-time boundary. A later revision never rewrites an older record.
// - JSONL files are append-only. Revisions form an explicit supersedesHash chain.
// - raw market data is local-only by default; repository fixtures are synthetic.
// - this module performs no network access. Providers are injected through a small interface.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PriceSeries } from "./backtest.js";
import { jstDateOf } from "./pit.js";
import { formatErrors, stableStringify, validate, type JsonSchema } from "./schema.js";

export type PriceSeriesKind = "security" | "benchmark";
export type PriceRecordStatus = "traded" | "suspended" | "no_trade" | "missing";
export type PriceDataLicense = "redistributable" | "metadata_only" | "local_only" | "unknown";
export type CorporateActionType =
  | "split"
  | "reverse_split"
  | "dividend"
  | "rights"
  | "merger"
  | "spinoff"
  | "other";

export interface PriceOhlcv {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceCorporateAction {
  type: CorporateActionType;
  effectiveDate: string;
  /** Split 1:2 => 2. Reverse split 2:1 => 0.5. */
  factor?: number;
  observedAt: string;
  source: string;
}

export interface PitPriceRecord {
  schemaVersion: 1;
  seriesKind: PriceSeriesKind;
  code: string;
  market: string;
  tradingDate: string;
  observedAt: string;
  /** Earliest timestamp at which this stored record may be used for an executable decision. */
  firstExecutableAt: string;
  source: string;
  sourceVersion: string;
  ingestionRunId: string;
  currency: string;
  status: PriceRecordStatus;
  ohlcv?: PriceOhlcv;
  /** Whether ohlcv has already been adjusted by the provider. */
  adjusted: boolean;
  /** Provider adjustment factor. Must be 1 for unadjusted rows. */
  adjustmentFactor: number;
  corporateActions: PriceCorporateAction[];
  benchmarkCode?: string;
  sectorBenchmarkCode?: string;
  license: PriceDataLicense;
  /** SHA-256 of the canonical record excluding contentHash. */
  contentHash: string;
  /** Required when the same source revises a prior record for the same series/date. */
  supersedesHash?: string;
}

export type PitPriceRecordInput = Omit<PitPriceRecord, "contentHash">;

export interface PriceStoreIssue {
  severity: "error" | "warning";
  code:
    | "schema"
    | "future_observation"
    | "observed_before_trading_date"
    | "execution_before_observation"
    | "invalid_ohlcv"
    | "ohlcv_for_non_traded"
    | "missing_ohlcv"
    | "invalid_adjustment"
    | "invalid_content_hash"
    | "duplicate_content_hash"
    | "missing_supersedes_hash"
    | "invalid_supersedes_hash"
    | "revision_time_not_monotonic";
  target: string;
  message: string;
}

export interface PriceProviderQuery {
  seriesKind: PriceSeriesKind;
  codes: string[];
  from: string;
  to: string;
  asOf: string;
}

export interface PriceProviderBatch {
  providerId: string;
  sourceVersion: string;
  license: PriceDataLicense;
  records: PitPriceRecordInput[];
}

export interface PriceProvider {
  readonly id: string;
  readonly license: PriceDataLicense;
  fetchDaily(query: PriceProviderQuery): Promise<PriceProviderBatch>;
}

function withoutContentHash(record: PitPriceRecord | PitPriceRecordInput): PitPriceRecordInput {
  const { contentHash: _contentHash, ...rest } = record as PitPriceRecord;
  return rest;
}

export function computePriceRecordHash(record: PitPriceRecord | PitPriceRecordInput): string {
  return createHash("sha256").update(stableStringify(withoutContentHash(record))).digest("hex");
}

export function withPriceRecordHash(record: PitPriceRecordInput): PitPriceRecord {
  return { ...record, contentHash: computePriceRecordHash(record) };
}

function recordTarget(record: Pick<PitPriceRecord, "seriesKind" | "code" | "market" | "tradingDate" | "source">): string {
  return `${record.seriesKind}:${record.market}:${record.code}:${record.tradingDate}:${record.source}`;
}

function revisionKey(record: PitPriceRecord): string {
  return recordTarget(record);
}

function pushIssue(
  issues: PriceStoreIssue[],
  issue: Omit<PriceStoreIssue, "severity"> & { severity?: PriceStoreIssue["severity"] },
): void {
  issues.push({ severity: issue.severity ?? "error", ...issue });
}

function validateOhlcv(record: PitPriceRecord, issues: PriceStoreIssue[]): void {
  const target = recordTarget(record);
  if (record.status === "traded" && !record.ohlcv) {
    pushIssue(issues, { code: "missing_ohlcv", target, message: "status=traded には OHLCV が必要です" });
    return;
  }
  if (record.status !== "traded" && record.ohlcv) {
    pushIssue(issues, {
      code: "ohlcv_for_non_traded",
      target,
      message: `status=${record.status} に OHLCV を保存しないでください。欠損理由を status で保持します`,
    });
    return;
  }
  if (!record.ohlcv) return;

  const { open, high, low, close, volume } = record.ohlcv;
  const positive = [open, high, low, close].every((value) => Number.isFinite(value) && value > 0);
  const rangeValid = high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
  const volumeValid = Number.isInteger(volume) && volume >= 0;
  if (!positive || !rangeValid || !volumeValid) {
    pushIssue(issues, {
      code: "invalid_ohlcv",
      target,
      message: `不正な OHLCV です: ${JSON.stringify(record.ohlcv)}`,
    });
  }
}

export function validatePriceRecord(
  record: PitPriceRecord,
  schema: JsonSchema,
  now: Date = new Date(),
): PriceStoreIssue[] {
  const issues: PriceStoreIssue[] = [];
  const target = recordTarget(record);
  const schemaErrors = validate(record, schema);
  if (schemaErrors.length > 0) {
    pushIssue(issues, {
      code: "schema",
      target,
      message: `Price record schema violation:\n${formatErrors(schemaErrors)}`,
    });
    return issues;
  }

  const nowMs = now.getTime();
  const observedMs = Date.parse(record.observedAt);
  const executableMs = Date.parse(record.firstExecutableAt);
  if (observedMs > nowMs) {
    pushIssue(issues, {
      code: "future_observation",
      target,
      message: `observedAt が現在より未来です: ${record.observedAt}`,
    });
  }
  if (jstDateOf(record.observedAt) < record.tradingDate) {
    pushIssue(issues, {
      code: "observed_before_trading_date",
      target,
      message: `tradingDate=${record.tradingDate} より前に日足を観測したことになっています: ${record.observedAt}`,
    });
  }
  if (executableMs < observedMs) {
    pushIssue(issues, {
      code: "execution_before_observation",
      target,
      message: `firstExecutableAt=${record.firstExecutableAt} が observedAt より前です`,
    });
  }

  validateOhlcv(record, issues);

  if (!Number.isFinite(record.adjustmentFactor) || record.adjustmentFactor <= 0) {
    pushIssue(issues, {
      code: "invalid_adjustment",
      target,
      message: "adjustmentFactor は 0 より大きい有限値である必要があります",
    });
  }
  if (!record.adjusted && record.adjustmentFactor !== 1) {
    pushIssue(issues, {
      code: "invalid_adjustment",
      target,
      message: "adjusted=false の行は adjustmentFactor=1 である必要があります",
    });
  }

  const expectedHash = computePriceRecordHash(record);
  if (record.contentHash !== expectedHash) {
    pushIssue(issues, {
      code: "invalid_content_hash",
      target,
      message: `contentHash が一致しません（expected=${expectedHash}, actual=${record.contentHash}）`,
    });
  }

  return issues;
}

export function validatePriceRecords(
  records: PitPriceRecord[],
  schema: JsonSchema,
  now: Date = new Date(),
): PriceStoreIssue[] {
  const issues = records.flatMap((record) => validatePriceRecord(record, schema, now));
  const byHash = new Map<string, PitPriceRecord>();
  const byRevisionKey = new Map<string, PitPriceRecord[]>();

  for (const record of records) {
    const duplicate = byHash.get(record.contentHash);
    if (duplicate) {
      pushIssue(issues, {
        code: "duplicate_content_hash",
        target: recordTarget(record),
        message: `同一 contentHash が重複しています: ${record.contentHash}`,
      });
    } else {
      byHash.set(record.contentHash, record);
    }
    const key = revisionKey(record);
    const group = byRevisionKey.get(key) ?? [];
    group.push(record);
    byRevisionKey.set(key, group);
  }

  for (const group of byRevisionKey.values()) {
    group.sort((a, b) =>
      a.observedAt === b.observedAt
        ? a.contentHash < b.contentHash
          ? -1
          : 1
        : a.observedAt < b.observedAt
          ? -1
          : 1,
    );
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      const current = group[index];
      const target = recordTarget(current);
      if (current.observedAt <= previous.observedAt) {
        pushIssue(issues, {
          code: "revision_time_not_monotonic",
          target,
          message: `revision observedAt は単調増加が必要です: ${previous.observedAt} -> ${current.observedAt}`,
        });
      }
      if (!current.supersedesHash) {
        pushIssue(issues, {
          code: "missing_supersedes_hash",
          target,
          message: `同一 series/date/source の改訂は prior hash ${previous.contentHash} を supersedesHash に指定してください`,
        });
      } else if (current.supersedesHash !== previous.contentHash) {
        pushIssue(issues, {
          code: "invalid_supersedes_hash",
          target,
          message: `supersedesHash は直前改訂 ${previous.contentHash} を指す必要があります`,
        });
      }
    }
  }

  return issues;
}

export function parsePriceJsonl(content: string, sourceName = "<memory>"): PitPriceRecord[] {
  const records: PitPriceRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as PitPriceRecord);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1} の JSON を解析できません: ${(error as Error).message}`);
    }
  }
  return records;
}

export function readPriceJsonl(path: string): PitPriceRecord[] {
  if (!existsSync(path)) return [];
  return parsePriceJsonl(readFileSync(path, "utf-8"), path);
}

export function appendPriceRecords(
  path: string,
  incoming: PitPriceRecord[],
  schema: JsonSchema,
  now: Date = new Date(),
): void {
  if (incoming.length === 0) return;
  const existing = readPriceJsonl(path);
  const existingHashes = new Set(existing.map((record) => record.contentHash));
  for (const record of incoming) {
    if (existingHashes.has(record.contentHash)) {
      throw new Error(`既存 contentHash を再追加できません: ${record.contentHash}`);
    }
  }

  const issues = validatePriceRecords([...existing, ...incoming], schema, now).filter(
    (issue) => issue.severity === "error",
  );
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"));
  }

  mkdirSync(dirname(path), { recursive: true });
  const prefix = existsSync(path) && readFileSync(path, "utf-8").length > 0 ? "" : "";
  appendFileSync(path, `${prefix}${incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
}

/** Select the latest revision known at asOf for each trading date. */
export function selectPriceRecordsAsOf(
  records: PitPriceRecord[],
  asOf: string,
  selector: { seriesKind: PriceSeriesKind; code: string; market?: string; source?: string },
): PitPriceRecord[] {
  const selected = new Map<string, PitPriceRecord>();
  for (const record of records) {
    if (record.seriesKind !== selector.seriesKind || record.code !== selector.code) continue;
    if (selector.market && record.market !== selector.market) continue;
    if (selector.source && record.source !== selector.source) continue;
    if (record.observedAt > asOf) continue;

    const key = `${record.market}:${record.tradingDate}`;
    const prior = selected.get(key);
    if (!prior || prior.observedAt < record.observedAt) selected.set(key, record);
  }
  return [...selected.values()].sort((a, b) =>
    a.tradingDate === b.tradingDate ? (a.market < b.market ? -1 : 1) : a.tradingDate < b.tradingDate ? -1 : 1,
  );
}

/** Adapter from PIT records to the deterministic Backtest PriceSeries contract. */
export function toBacktestPriceSeries(
  records: PitPriceRecord[],
  asOf: string,
  selector: { seriesKind: PriceSeriesKind; code: string; market?: string; source?: string },
): PriceSeries {
  const selected = selectPriceRecordsAsOf(records, asOf, selector);
  return {
    code: selector.code,
    bars: selected
      .filter((record): record is PitPriceRecord & { ohlcv: PriceOhlcv } => record.status === "traded" && !!record.ohlcv)
      .map((record) => ({ date: record.tradingDate, ...record.ohlcv })),
  };
}
