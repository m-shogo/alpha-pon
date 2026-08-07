// Research OS — PIT Price Store v1.
//
// Principles:
// - dataAsOf / observedAt / retrievedAt / firstExecutableAt are distinct.
// - later corrections append a new row with supersedesHash; old rows are immutable.
// - missing/suspended/no-trade rows are explicit and never forward-filled here.
// - provider/network logic is injected. This module performs no network access.
// - licensed raw data is local-only unless redistribution is explicitly allowed.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { PriceSeries } from "./backtest.js";
import { jstDateOf } from "./pit.js";
import { formatErrors, stableStringify, validate, type JsonSchema } from "./schema.js";

export type PriceSeriesKind = "security" | "benchmark";
export type PriceRecordStatus = "traded" | "suspended" | "no_trade" | "missing";
export type PriceDataLicense = "redistributable" | "metadata_only" | "local_only" | "unknown";
export type PriceProviderPlan =
  | "free"
  | "standard"
  | "premium"
  | "official_public"
  | "synthetic"
  | "unknown";
export type MissingPriceReason =
  | "exchange_suspension"
  | "market_holiday"
  | "no_execution"
  | "provider_gap"
  | "outside_entitlement"
  | "not_yet_available"
  | "unknown";
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
  /** Market time represented by the OHLCV row, normally the trading-day close. */
  dataAsOf: string;
  /** Contractual/public availability boundary. The PIT source of truth. */
  observedAt: string;
  /** Actual Alpha Pon ingestion time. */
  retrievedAt: string;
  /** Earliest timestamp at which a decision using this row could be executed. */
  firstExecutableAt: string;
  source: string;
  sourceVersion: string;
  providerPlan: PriceProviderPlan;
  delayDays: number;
  isDelayed: boolean;
  ingestionRunId: string;
  currency: string;
  status: PriceRecordStatus;
  missingReason?: MissingPriceReason;
  ohlcv?: PriceOhlcv;
  adjusted: boolean;
  adjustmentFactor: number;
  corporateActions: PriceCorporateAction[];
  benchmarkCode?: string;
  sectorBenchmarkCode?: string;
  license: PriceDataLicense;
  contentHash: string;
  supersedesHash?: string;
}

export type PitPriceRecordInput = Omit<PitPriceRecord, "contentHash">;

export interface PriceProviderCapabilities {
  plan: PriceProviderPlan;
  delayDays: number;
  supportsAdjusted: boolean;
  supportsUnadjusted: boolean;
  supportsCorporateActions: boolean;
  supportsBenchmarks: boolean;
  supportsSectorBenchmarks: boolean;
  historyFrom?: string;
}

export interface PriceProviderQuery {
  seriesKind: PriceSeriesKind;
  codes: string[];
  from: string;
  to: string;
  asOf: string;
  plan?: PriceProviderPlan;
}

export interface PriceProviderBatch {
  providerId: string;
  sourceVersion: string;
  capabilities: PriceProviderCapabilities;
  license: PriceDataLicense;
  retrievedAt: string;
  records: PitPriceRecordInput[];
}

export interface PriceProvider {
  readonly id: string;
  readonly license: PriceDataLicense;
  readonly capabilities: PriceProviderCapabilities;
  fetchDaily(query: PriceProviderQuery): Promise<PriceProviderBatch>;
}

export interface PriceSeriesSelector {
  seriesKind: PriceSeriesKind;
  code: string;
  market?: string;
  source?: string;
  providerPlan?: PriceProviderPlan;
}

export type PriceStoreIssueCode =
  | "schema"
  | "future_observation"
  | "future_retrieval"
  | "data_after_observation"
  | "retrieval_before_observation"
  | "execution_before_observation"
  | "execution_before_retrieval"
  | "trading_date_mismatch"
  | "delay_flag_mismatch"
  | "invalid_ohlcv"
  | "ohlcv_for_non_traded"
  | "missing_ohlcv"
  | "missing_reason_required"
  | "missing_reason_for_traded"
  | "invalid_adjustment"
  | "corporate_action_after_record"
  | "corporate_action_factor_required"
  | "unknown_license"
  | "missing_benchmark"
  | "invalid_content_hash"
  | "duplicate_content_hash"
  | "orphan_supersedes_hash"
  | "missing_supersedes_hash"
  | "invalid_supersedes_hash"
  | "revision_time_not_monotonic";

export interface PriceStoreIssue {
  severity: "error" | "warning";
  code: PriceStoreIssueCode;
  target: string;
  message: string;
}

function withoutContentHash(record: PitPriceRecord | PitPriceRecordInput): PitPriceRecordInput {
  const { contentHash: _contentHash, ...rest } = record as PitPriceRecord;
  return rest;
}

export function computePriceRecordHash(record: PitPriceRecord | PitPriceRecordInput): string {
  return createHash("sha256")
    .update(stableStringify(withoutContentHash(record)))
    .digest("hex");
}

export function withPriceRecordHash(record: PitPriceRecordInput): PitPriceRecord {
  return { ...record, contentHash: computePriceRecordHash(record) };
}

function targetOf(
  record: Pick<PitPriceRecord, "seriesKind" | "code" | "market" | "tradingDate" | "source" | "providerPlan">,
): string {
  return `${record.seriesKind}:${record.market}:${record.code}:${record.tradingDate}:${record.source}:${record.providerPlan}`;
}

function revisionKey(record: PitPriceRecord): string {
  return targetOf(record);
}

function timeMs(value: string): number {
  return Date.parse(value);
}

function pushIssue(
  issues: PriceStoreIssue[],
  issue: Omit<PriceStoreIssue, "severity"> & { severity?: PriceStoreIssue["severity"] },
): void {
  issues.push({ severity: issue.severity ?? "error", ...issue });
}

function validateOhlcv(record: PitPriceRecord, issues: PriceStoreIssue[]): void {
  const target = targetOf(record);
  if (record.status === "traded") {
    if (!record.ohlcv) {
      pushIssue(issues, {
        code: "missing_ohlcv",
        target,
        message: "status=tradedにはOHLCVが必要です",
      });
    }
    if (record.missingReason !== undefined) {
      pushIssue(issues, {
        code: "missing_reason_for_traded",
        target,
        message: "status=tradedにmissingReasonを設定しないでください",
      });
    }
  } else {
    if (record.ohlcv) {
      pushIssue(issues, {
        code: "ohlcv_for_non_traded",
        target,
        message: `status=${record.status}にOHLCVを保存しないでください`,
      });
    }
    if (!record.missingReason) {
      pushIssue(issues, {
        code: "missing_reason_required",
        target,
        message: `status=${record.status}にはmissingReasonが必要です`,
      });
    }
  }

  if (!record.ohlcv) return;
  const { open, high, low, close, volume } = record.ohlcv;
  const positive = [open, high, low, close]
    .every((value) => Number.isFinite(value) && value > 0);
  const rangeValid = high >= Math.max(open, close, low) && low <= Math.min(open, close, high);
  const volumeValid = Number.isInteger(volume) && volume >= 0;
  if (!positive || !rangeValid || !volumeValid) {
    pushIssue(issues, {
      code: "invalid_ohlcv",
      target,
      message: `不正なOHLCVです: ${JSON.stringify(record.ohlcv)}`,
    });
  }
}

function validateCorporateActions(record: PitPriceRecord, issues: PriceStoreIssue[]): void {
  const target = targetOf(record);
  for (const action of record.corporateActions) {
    if (timeMs(action.observedAt) > timeMs(record.observedAt)) {
      pushIssue(issues, {
        code: "corporate_action_after_record",
        target,
        message: `record観測後のcorporate actionを混入できません: ${action.observedAt}`,
      });
    }
    if (
      (action.type === "split" || action.type === "reverse_split") &&
      (!Number.isFinite(action.factor) || Number(action.factor) <= 0)
    ) {
      pushIssue(issues, {
        code: "corporate_action_factor_required",
        target,
        message: `${action.type}には正のfactorが必要です`,
      });
    }
  }
}

export function validatePriceRecord(
  record: PitPriceRecord,
  schema: JsonSchema,
  now: Date = new Date(),
): PriceStoreIssue[] {
  const issues: PriceStoreIssue[] = [];
  const target = targetOf(record);
  const schemaErrors = validate(record, schema);
  if (schemaErrors.length > 0) {
    pushIssue(issues, {
      code: "schema",
      target,
      message: `Price record schema violation:\n${formatErrors(schemaErrors)}`,
    });
    return issues;
  }

  const dataMs = timeMs(record.dataAsOf);
  const observedMs = timeMs(record.observedAt);
  const retrievedMs = timeMs(record.retrievedAt);
  const executableMs = timeMs(record.firstExecutableAt);
  const nowMs = now.getTime();

  if (observedMs > nowMs) {
    pushIssue(issues, {
      code: "future_observation",
      target,
      message: `observedAtが現在より未来です: ${record.observedAt}`,
    });
  }
  if (retrievedMs > nowMs) {
    pushIssue(issues, {
      code: "future_retrieval",
      target,
      message: `retrievedAtが現在より未来です: ${record.retrievedAt}`,
    });
  }
  if (dataMs > observedMs) {
    pushIssue(issues, {
      code: "data_after_observation",
      target,
      message: `dataAsOf=${record.dataAsOf}より前に観測したことにはできません`,
    });
  }
  if (retrievedMs < observedMs) {
    pushIssue(issues, {
      code: "retrieval_before_observation",
      target,
      message: `retrievedAt=${record.retrievedAt}がobservedAtより前です`,
    });
  }
  if (executableMs < observedMs) {
    pushIssue(issues, {
      code: "execution_before_observation",
      target,
      message: `firstExecutableAt=${record.firstExecutableAt}がobservedAtより前です`,
    });
  }
  if (executableMs < retrievedMs) {
    pushIssue(issues, {
      code: "execution_before_retrieval",
      target,
      message: `firstExecutableAt=${record.firstExecutableAt}がretrievedAt=${record.retrievedAt}より前です`,
    });
  }
  if (jstDateOf(record.dataAsOf) !== record.tradingDate) {
    pushIssue(issues, {
      code: "trading_date_mismatch",
      target,
      message: `dataAsOfのJST日付とtradingDateが一致しません: ${record.dataAsOf}`,
    });
  }
  if (record.isDelayed !== (record.delayDays > 0)) {
    pushIssue(issues, {
      code: "delay_flag_mismatch",
      target,
      message: `delayDays=${record.delayDays}とisDelayed=${record.isDelayed}が不整合です`,
    });
  }

  validateOhlcv(record, issues);
  validateCorporateActions(record, issues);

  if (!Number.isFinite(record.adjustmentFactor) || record.adjustmentFactor <= 0) {
    pushIssue(issues, {
      code: "invalid_adjustment",
      target,
      message: "adjustmentFactorは0より大きい有限値が必要です",
    });
  }
  if (!record.adjusted && record.adjustmentFactor !== 1) {
    pushIssue(issues, {
      code: "invalid_adjustment",
      target,
      message: "adjusted=falseの行はadjustmentFactor=1が必要です",
    });
  }
  if (record.license === "unknown") {
    pushIssue(issues, {
      code: "unknown_license",
      target,
      message: "利用権不明の価格recordは研究基盤へ取り込めません",
    });
  }
  if (record.seriesKind === "security" && !record.benchmarkCode) {
    pushIssue(issues, {
      severity: "warning",
      code: "missing_benchmark",
      target,
      message: "security recordにbenchmarkCodeがありません。event study前に補完してください",
    });
  }

  const expectedHash = computePriceRecordHash(record);
  if (record.contentHash !== expectedHash) {
    pushIssue(issues, {
      code: "invalid_content_hash",
      target,
      message: `contentHash不一致 expected=${expectedHash} actual=${record.contentHash}`,
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
    if (byHash.has(record.contentHash)) {
      pushIssue(issues, {
        code: "duplicate_content_hash",
        target: targetOf(record),
        message: `同一contentHashが重複しています: ${record.contentHash}`,
      });
    } else {
      byHash.set(record.contentHash, record);
    }
    const group = byRevisionKey.get(revisionKey(record)) ?? [];
    group.push(record);
    byRevisionKey.set(revisionKey(record), group);
  }

  for (const group of byRevisionKey.values()) {
    group.sort((a, b) => {
      const timeDiff = timeMs(a.observedAt) - timeMs(b.observedAt);
      return timeDiff !== 0 ? timeDiff : a.contentHash.localeCompare(b.contentHash);
    });
    const root = group[0];
    if (root?.supersedesHash) {
      pushIssue(issues, {
        code: "orphan_supersedes_hash",
        target: targetOf(root),
        message: `系列先頭recordはsupersedesHashを持てません: ${root.supersedesHash}`,
      });
    }
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      const current = group[index];
      const target = targetOf(current);
      if (timeMs(current.observedAt) <= timeMs(previous.observedAt)) {
        pushIssue(issues, {
          code: "revision_time_not_monotonic",
          target,
          message: `revision observedAtは単調増加が必要です: ${previous.observedAt} -> ${current.observedAt}`,
        });
      }
      if (!current.supersedesHash) {
        pushIssue(issues, {
          code: "missing_supersedes_hash",
          target,
          message: `改訂は直前hash ${previous.contentHash} をsupersedesHashへ指定してください`,
        });
      } else if (current.supersedesHash !== previous.contentHash) {
        pushIssue(issues, {
          code: "invalid_supersedes_hash",
          target,
          message: `supersedesHashは直前改訂 ${previous.contentHash} を指す必要があります`,
        });
      }
    }
  }

  return issues.sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

export function validateProviderBatch(batch: PriceProviderBatch): string[] {
  const issues: string[] = [];
  const retrievedMs = timeMs(batch.retrievedAt);
  if (!batch.providerId.trim()) issues.push("providerId is required");
  if (!batch.sourceVersion.trim()) issues.push("sourceVersion is required");
  if (!Number.isFinite(retrievedMs)) issues.push(`invalid batch retrievedAt: ${batch.retrievedAt}`);
  if (batch.license === "unknown") issues.push("batch license may not be unknown");

  batch.records.forEach((record, index) => {
    const prefix = `records[${index}]`;
    if (record.providerPlan !== batch.capabilities.plan) {
      issues.push(`${prefix}.providerPlan does not match capabilities.plan`);
    }
    if (record.delayDays !== batch.capabilities.delayDays) {
      issues.push(`${prefix}.delayDays does not match capabilities.delayDays`);
    }
    if (record.license !== batch.license) {
      issues.push(`${prefix}.license does not match batch license`);
    }
    if (record.retrievedAt !== batch.retrievedAt) {
      issues.push(`${prefix}.retrievedAt does not match batch retrievedAt`);
    }
    const executableMs = timeMs(record.firstExecutableAt);
    if (Number.isFinite(retrievedMs) && Number.isFinite(executableMs) && executableMs < retrievedMs) {
      issues.push(`${prefix}.firstExecutableAt precedes batch retrievedAt`);
    }
    if (record.sourceVersion !== batch.sourceVersion) {
      issues.push(`${prefix}.sourceVersion does not match batch.sourceVersion`);
    }
    if (record.adjusted && !batch.capabilities.supportsAdjusted) {
      issues.push(`${prefix} is adjusted but provider does not support adjusted prices`);
    }
    if (!record.adjusted && !batch.capabilities.supportsUnadjusted) {
      issues.push(`${prefix} is unadjusted but provider does not support unadjusted prices`);
    }
    if (record.corporateActions.length > 0 && !batch.capabilities.supportsCorporateActions) {
      issues.push(`${prefix} contains corporate actions unsupported by provider`);
    }
    if (record.seriesKind === "benchmark" && !batch.capabilities.supportsBenchmarks) {
      issues.push(`${prefix} is benchmark data unsupported by provider`);
    }
    if (record.sectorBenchmarkCode && !batch.capabilities.supportsSectorBenchmarks) {
      issues.push(`${prefix} references a sector benchmark unsupported by provider`);
    }
  });

  return issues.sort();
}

export function parsePriceJsonl(content: string, sourceName = "<memory>"): PitPriceRecord[] {
  const records: PitPriceRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as PitPriceRecord);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}のJSONを解析できません: ${(error as Error).message}`);
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
      throw new Error(`既存contentHashを再追加できません: ${record.contentHash}`);
    }
  }

  const errors = validatePriceRecords([...existing, ...incoming], schema, now)
    .filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"));
  }

  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a");
  try {
    appendFileSync(fd, `${incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export type PriceAvailabilityBoundary = "observed" | "executable";

/** Select the latest revision available at asOf for each source/plan/trading date. */
export function selectPriceRecordsAsOf(
  records: PitPriceRecord[],
  asOf: string,
  selector: PriceSeriesSelector,
  boundary: PriceAvailabilityBoundary = "executable",
): PitPriceRecord[] {
  const asOfMs = timeMs(asOf);
  if (!Number.isFinite(asOfMs)) throw new Error(`invalid asOf: ${asOf}`);

  const selected = new Map<string, PitPriceRecord>();
  for (const record of records) {
    if (record.seriesKind !== selector.seriesKind || record.code !== selector.code) continue;
    if (selector.market && record.market !== selector.market) continue;
    if (selector.source && record.source !== selector.source) continue;
    if (selector.providerPlan && record.providerPlan !== selector.providerPlan) continue;
    if (timeMs(record.observedAt) > asOfMs) continue;
    if (boundary === "executable" && timeMs(record.firstExecutableAt) > asOfMs) continue;

    const key = `${record.market}:${record.tradingDate}:${record.source}:${record.providerPlan}`;
    const prior = selected.get(key);
    if (
      !prior ||
      timeMs(prior.observedAt) < timeMs(record.observedAt) ||
      (timeMs(prior.observedAt) === timeMs(record.observedAt) && prior.contentHash > record.contentHash)
    ) {
      selected.set(key, record);
    }
  }
  return [...selected.values()].sort((a, b) =>
    a.tradingDate === b.tradingDate
      ? targetOf(a).localeCompare(targetOf(b))
      : a.tradingDate.localeCompare(b.tradingDate),
  );
}

function assertUnambiguousSeries(records: PitPriceRecord[], selector: PriceSeriesSelector): void {
  const byDate = new Map<string, PitPriceRecord[]>();
  for (const record of records) {
    const group = byDate.get(record.tradingDate) ?? [];
    group.push(record);
    byDate.set(record.tradingDate, group);
  }

  for (const [date, group] of byDate) {
    if (group.length <= 1) continue;
    const choices = group
      .map((record) => `${record.source}/${record.providerPlan}`)
      .sort()
      .join(", ");
    throw new Error(
      `PIT price series is ambiguous for ${selector.code} ${date}: ${choices}. ` +
      "Specify selector.source and selector.providerPlan.",
    );
  }
}

export function toBacktestPriceSeries(
  records: PitPriceRecord[],
  asOf: string,
  selector: PriceSeriesSelector,
): PriceSeries {
  const selected = selectPriceRecordsAsOf(records, asOf, selector, "executable");
  assertUnambiguousSeries(selected, selector);
  return {
    code: selector.code,
    bars: selected
      .filter(
        (record): record is PitPriceRecord & { ohlcv: PriceOhlcv } =>
          record.status === "traded" && !!record.ohlcv,
      )
      .map((record) => ({ date: record.tradingDate, ...record.ohlcv })),
  };
}
