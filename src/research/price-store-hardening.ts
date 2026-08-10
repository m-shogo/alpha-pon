// Additional safety contracts for PIT Price Store v1.
//
// This module keeps the original storage contract intact while making the
// governed/replay-facing API stricter. Callers that feed Event Study,
// Recommendation or deterministic replay should use these functions rather
// than selecting raw records directly.

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { PriceSeries } from "./backtest.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { jstDateOf } from "./pit.js";
import {
  parsePriceJsonl,
  readPriceJsonl,
  validatePriceRecords,
  validateProviderBatch,
  type PitPriceRecord,
  type PriceOhlcv,
  type PriceProviderBatch,
  type PriceProviderPlan,
  type PriceProviderQuery,
  type PriceSeriesKind,
  type PriceStoreIssue,
} from "./price-store.js";
import type { JsonSchema } from "./schema.js";

export type PriceBasis = "adjusted" | "unadjusted";
export type PriceReplayMode = "provider_available" | "system_replay";
export type GovernedPriceProviderPlan = Exclude<PriceProviderPlan, "unknown">;

export interface HardenedPriceSeriesSelector {
  seriesKind: PriceSeriesKind;
  code: string;
  priceBasis: PriceBasis;
  market?: string;
  source?: string;
  providerPlan?: GovernedPriceProviderPlan;
}

export type PriceHardeningIssueCode =
  | "execution_before_retrieval"
  | "unknown_provider_plan"
  | "unknown_source"
  | "metadata_only_price_payload"
  | "status_reason_mismatch"
  | "future_effective_corporate_action"
  | "batch_query_plan_mismatch"
  | "batch_series_kind_mismatch"
  | "batch_code_outside_query"
  | "batch_date_outside_query"
  | "batch_observation_after_cutoff"
  | "batch_source_ambiguous"
  | "missing_required_series"
  | "misaligned_price_basis"
  | "misaligned_trading_dates"
  | "theoretical_mode_not_executable"
  | "partial_jsonl_tail";

export interface PriceHardeningIssue {
  severity: "error" | "warning";
  code: PriceHardeningIssueCode;
  target: string;
  message: string;
}

export type HardenedPriceIssue = PriceStoreIssue | PriceHardeningIssue;

const UNKNOWN_SOURCE_VALUES = new Set(["unknown", "unspecified", "n/a", "na", "none"]);

function timeMs(value: string): number {
  return Date.parse(value);
}

function basisOf(record: Pick<PitPriceRecord, "adjusted">): PriceBasis {
  return record.adjusted ? "adjusted" : "unadjusted";
}

function targetOf(record: PitPriceRecord): string {
  return [
    record.seriesKind,
    record.market,
    record.code,
    record.tradingDate,
    record.source,
    record.providerPlan,
    basisOf(record),
  ].join(":");
}

function hardeningIssue(
  code: PriceHardeningIssueCode,
  target: string,
  message: string,
  severity: PriceHardeningIssue["severity"] = "error",
): PriceHardeningIssue {
  return { severity, code, target, message };
}

function isUnknownSource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  return normalized.length === 0 || UNKNOWN_SOURCE_VALUES.has(normalized);
}

export function validatePriceRecordHardening(record: PitPriceRecord): PriceHardeningIssue[] {
  const issues: PriceHardeningIssue[] = [];
  const target = targetOf(record);

  if (
    compareExplicitIso8601Instants(
      record.firstExecutableAt,
      record.retrievedAt,
      "priceRecord.firstExecutableAt",
      "priceRecord.retrievedAt",
    ) < 0
  ) {
    issues.push(hardeningIssue(
      "execution_before_retrieval",
      target,
      `firstExecutableAt=${record.firstExecutableAt}がretrievedAt=${record.retrievedAt}より前です`,
    ));
  }

  if (record.providerPlan === "unknown") {
    issues.push(hardeningIssue(
      "unknown_provider_plan",
      target,
      "providerPlan=unknownのrecordはgoverned price seriesへ昇格できません",
    ));
  }

  if (isUnknownSource(record.source)) {
    issues.push(hardeningIssue(
      "unknown_source",
      target,
      "source未解決のrecordはgoverned price seriesへ昇格できません",
    ));
  }

  if (record.license === "metadata_only" && (record.status === "traded" || !!record.ohlcv)) {
    issues.push(hardeningIssue(
      "metadata_only_price_payload",
      target,
      "license=metadata_onlyではOHLCV価格payloadを保存・利用できません",
    ));
  }

  const allowedReasons: Record<Exclude<PitPriceRecord["status"], "traded">, ReadonlySet<string>> = {
    suspended: new Set(["exchange_suspension"]),
    no_trade: new Set(["no_execution", "market_holiday"]),
    missing: new Set(["provider_gap", "outside_entitlement", "not_yet_available"]),
  };

  if (record.status !== "traded") {
    const reason = record.missingReason ?? "<missing>";
    if (!allowedReasons[record.status].has(reason)) {
      issues.push(hardeningIssue(
        "status_reason_mismatch",
        target,
        `status=${record.status}とmissingReason=${reason}の組合せは許可されません`,
      ));
    }
  }

  if (record.adjusted) {
    const observedDate = jstDateOf(record.observedAt);
    for (const action of record.corporateActions) {
      if (action.effectiveDate > observedDate) {
        issues.push(hardeningIssue(
          "future_effective_corporate_action",
          target,
          `observedAtのJST日付=${observedDate}より後にeffectiveなcorporate actionをadjusted rowへ混入できません: ${action.type} ${action.effectiveDate}`,
        ));
      }
    }
  }

  return issues;
}

/**
 * Validate records with adjusted/unadjusted treated as separate immutable
 * series identities. This prevents one basis from being mistaken for a
 * revision of the other basis.
 */
export function validateHardenedPriceRecords(
  records: PitPriceRecord[],
  schema: JsonSchema,
  now: Date = new Date(),
): HardenedPriceIssue[] {
  const byBasis = new Map<PriceBasis, PitPriceRecord[]>();
  for (const record of records) {
    const basis = basisOf(record);
    const group = byBasis.get(basis) ?? [];
    group.push(record);
    byBasis.set(basis, group);
  }

  const issues: HardenedPriceIssue[] = [];
  for (const group of byBasis.values()) {
    issues.push(...validatePriceRecords(group, schema, now));
  }
  for (const record of records) {
    issues.push(...validatePriceRecordHardening(record));
  }

  return issues.sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

export interface ProviderBatchValidationOptions {
  expectedSource?: string;
  expectedIngestionRunId?: string;
}

export function validateProviderBatchAgainstQuery(
  batch: PriceProviderBatch,
  query: PriceProviderQuery,
  options: ProviderBatchValidationOptions = {},
): string[] {
  const issues = [...validateProviderBatch(batch)];
  const asOfMs = timeMs(query.asOf);

  if (!Number.isFinite(asOfMs)) {
    issues.push(`invalid query.asOf: ${query.asOf}`);
  }
  if (batch.capabilities.plan === "unknown") {
    issues.push("batch capabilities.plan may not be unknown");
  }
  if (query.plan && query.plan !== batch.capabilities.plan) {
    issues.push("batch capabilities.plan does not match query.plan");
  }
  if (query.from > query.to) {
    issues.push(`query.from must be <= query.to: ${query.from} > ${query.to}`);
  }

  const sources = new Set<string>();
  const ingestionRunIds = new Set<string>();
  batch.records.forEach((record, index) => {
    const prefix = `records[${index}]`;
    const source = record.source.trim();
    const ingestionRunId = record.ingestionRunId.trim();
    if (source) sources.add(source);
    if (ingestionRunId) ingestionRunIds.add(ingestionRunId);

    if (options.expectedSource && record.source !== options.expectedSource) {
      issues.push(`${prefix}.source does not match expectedSource`);
    }
    if (
      options.expectedIngestionRunId &&
      record.ingestionRunId !== options.expectedIngestionRunId
    ) {
      issues.push(`${prefix}.ingestionRunId does not match expectedIngestionRunId`);
    }
    if (!ingestionRunId) {
      issues.push(`${prefix}.ingestionRunId is required`);
    }
    if (record.seriesKind !== query.seriesKind) {
      issues.push(`${prefix}.seriesKind does not match query.seriesKind`);
    }
    if (!query.codes.includes(record.code)) {
      issues.push(`${prefix}.code is outside query.codes: ${record.code}`);
    }
    if (record.tradingDate < query.from || record.tradingDate > query.to) {
      issues.push(`${prefix}.tradingDate is outside query range: ${record.tradingDate}`);
    }
    if (Number.isFinite(asOfMs) && timeMs(record.dataAsOf) > asOfMs) {
      issues.push(`${prefix}.dataAsOf is after query.asOf: ${record.dataAsOf}`);
    }
    if (Number.isFinite(asOfMs) && timeMs(record.observedAt) > asOfMs) {
      issues.push(`${prefix}.observedAt is after query.asOf: ${record.observedAt}`);
    }
    if (record.providerPlan === "unknown") {
      issues.push(`${prefix}.providerPlan may not be unknown`);
    }
    if (isUnknownSource(record.source)) {
      issues.push(`${prefix}.source is unresolved`);
    }
  });

  if (sources.size > 1) {
    issues.push(`batch contains ambiguous record sources: ${[...sources].sort().join(", ")}`);
  }
  if (ingestionRunIds.size > 1) {
    issues.push(
      `batch contains ambiguous ingestionRunIds: ${[...ingestionRunIds].sort().join(", ")}`,
    );
  }

  return [...new Set(issues)].sort();
}

function isRecordAvailable(
  record: PitPriceRecord,
  asOf: string,
  mode: PriceReplayMode,
): boolean {
  if (
    compareExplicitIso8601Instants(
      record.observedAt,
      asOf,
      "priceRecord.observedAt",
      "replay.asOf",
    ) > 0
  ) return false;
  if (mode === "system_replay") {
    if (
      compareExplicitIso8601Instants(
        record.retrievedAt,
        asOf,
        "priceRecord.retrievedAt",
        "replay.asOf",
      ) > 0
    ) return false;
    if (
      compareExplicitIso8601Instants(
        record.firstExecutableAt,
        asOf,
        "priceRecord.firstExecutableAt",
        "replay.asOf",
      ) > 0
    ) return false;
  }
  return true;
}

function matchesSelectorBaseIdentity(
  record: PitPriceRecord,
  selector: HardenedPriceSeriesSelector,
): boolean {
  if (record.seriesKind !== selector.seriesKind || record.code !== selector.code) return false;
  if (basisOf(record) !== selector.priceBasis) return false;
  if (selector.market && record.market !== selector.market) return false;
  return true;
}

function assertReplayRecordsSafe(
  records: PitPriceRecord[],
  selector: HardenedPriceSeriesSelector,
): void {
  const errors = records
    .filter((record) => matchesSelectorBaseIdentity(record, selector))
    .flatMap((record) => validatePriceRecordHardening(record))
    .filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      errors.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"),
    );
  }
}

function assertUnambiguousSeries(
  records: PitPriceRecord[],
  selector: HardenedPriceSeriesSelector,
): void {
  const byDate = new Map<string, PitPriceRecord[]>();
  for (const record of records) {
    const group = byDate.get(record.tradingDate) ?? [];
    group.push(record);
    byDate.set(record.tradingDate, group);
  }

  for (const [date, group] of byDate) {
    if (group.length <= 1) continue;
    const choices = group
      .map((record) => `${record.source}/${record.providerPlan}/${basisOf(record)}`)
      .sort()
      .join(", ");
    throw new Error(
      `PIT price series is ambiguous for ${selector.code} ${date}: ${choices}. ` +
      "Specify selector.source, selector.providerPlan and selector.priceBasis.",
    );
  }
}

export function selectPriceRecordsForReplay(
  records: PitPriceRecord[],
  asOf: string,
  selector: HardenedPriceSeriesSelector,
  mode: PriceReplayMode = "system_replay",
): PitPriceRecord[] {
  try {
    compareExplicitIso8601Instants(asOf, asOf, "replay.asOf", "replay.asOf");
  } catch {
    throw new Error(`invalid asOf: ${asOf}`);
  }
  if (selector.priceBasis !== "adjusted" && selector.priceBasis !== "unadjusted") {
    throw new Error("selector.priceBasis must be adjusted or unadjusted");
  }
  assertReplayRecordsSafe(records, selector);

  const selected = new Map<string, PitPriceRecord>();
  for (const record of records) {
    if (!matchesSelectorBaseIdentity(record, selector)) continue;
    if (selector.source && record.source !== selector.source) continue;
    if (selector.providerPlan && record.providerPlan !== selector.providerPlan) continue;
    if (!isRecordAvailable(record, asOf, mode)) continue;

    const key = [
      record.market,
      record.tradingDate,
      record.source,
      record.providerPlan,
      basisOf(record),
    ].join(":");
    const prior = selected.get(key);
    const observedOrder = prior
      ? compareExplicitIso8601Instants(
          prior.observedAt,
          record.observedAt,
          "priorPriceRecord.observedAt",
          "priceRecord.observedAt",
        )
      : 0;
    const retrievedOrder = prior && observedOrder === 0
      ? compareExplicitIso8601Instants(
          prior.retrievedAt,
          record.retrievedAt,
          "priorPriceRecord.retrievedAt",
          "priceRecord.retrievedAt",
        )
      : 0;
    if (
      !prior ||
      observedOrder < 0 ||
      (observedOrder === 0 && retrievedOrder < 0) ||
      (
        observedOrder === 0 &&
        retrievedOrder === 0 &&
        prior.contentHash > record.contentHash
      )
    ) {
      selected.set(key, record);
    }
  }

  const result = [...selected.values()].sort((a, b) =>
    a.tradingDate === b.tradingDate
      ? targetOf(a).localeCompare(targetOf(b))
      : a.tradingDate.localeCompare(b.tradingDate),
  );
  assertUnambiguousSeries(result, selector);
  return result;
}

export function toHardenedBacktestPriceSeries(
  records: PitPriceRecord[],
  asOf: string,
  selector: HardenedPriceSeriesSelector,
  mode: PriceReplayMode = "system_replay",
): PriceSeries {
  if (mode !== "system_replay") {
    throw new Error("Backtest requires system_replay; provider_available is availability research only");
  }
  const selected = selectPriceRecordsForReplay(records, asOf, selector, mode);
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

export type EventStudySeriesRole = "issuer" | "benchmark" | "sector";

export interface EventStudyPriceInput {
  role: EventStudySeriesRole;
  records: PitPriceRecord[];
  selector: HardenedPriceSeriesSelector;
}

function equalStringSets(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function validateEventStudyPriceAlignment(
  inputs: EventStudyPriceInput[],
  asOf: string,
  mode: PriceReplayMode = "system_replay",
): PriceHardeningIssue[] {
  if (mode !== "system_replay") {
    return [hardeningIssue(
      "theoretical_mode_not_executable",
      "event-study",
      "Event Study / Net Alphaはsystem_replay専用です。provider_availableは資料可用性の研究にのみ使用できます",
    )];
  }

  const issues: PriceHardeningIssue[] = [];
  const byRole = new Map(inputs.map((input) => [input.role, input]));

  for (const role of ["issuer", "benchmark", "sector"] as const) {
    if (!byRole.has(role)) {
      issues.push(hardeningIssue(
        "missing_required_series",
        role,
        `Event Studyには${role} seriesが必要です`,
      ));
    }
  }
  if (issues.length > 0) return issues;

  const bases = new Set(inputs.map((input) => input.selector.priceBasis));
  if (bases.size !== 1) {
    issues.push(hardeningIssue(
      "misaligned_price_basis",
      "event-study",
      `issuer/TOPIX/sectorのprice basisが一致しません: ${[...bases].sort().join(", ")}`,
    ));
  }

  const dateSets = new Map<EventStudySeriesRole, Set<string>>();
  for (const input of inputs) {
    try {
      const selected = selectPriceRecordsForReplay(input.records, asOf, input.selector, mode)
        .filter((record) => record.status === "traded" && !!record.ohlcv);
      if (selected.length === 0) {
        issues.push(hardeningIssue(
          "missing_required_series",
          input.role,
          `${input.role}に利用可能なtraded priceがありません`,
        ));
      }
      dateSets.set(input.role, new Set(selected.map((record) => record.tradingDate)));
    } catch (error) {
      issues.push(hardeningIssue(
        "missing_required_series",
        input.role,
        (error as Error).message,
      ));
    }
  }

  const issuerDates = dateSets.get("issuer");
  if (issuerDates) {
    for (const role of ["benchmark", "sector"] as const) {
      const dates = dateSets.get(role);
      if (dates && !equalStringSets(issuerDates, dates)) {
        issues.push(hardeningIssue(
          "misaligned_trading_dates",
          role,
          `issuerと${role}のtrading date集合が一致しません`,
        ));
      }
    }
  }

  return issues.sort((a, b) =>
    `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`),
  );
}

export interface AppendPriceRecordsWithLockOptions {
  ownerToken: string;
  now?: Date;
}

function assertCompleteJsonlTail(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`partial_jsonl_tail ${path}: final newlineがなくpartial writeの可能性があります`);
  }
  parsePriceJsonl(content, path);
}

function releasePriceStoreLock(lockPath: string, ownerToken: string): void {
  const ownerPath = `${lockPath}/owner.json`;
  let owner: { ownerToken?: unknown };
  try {
    owner = JSON.parse(readFileSync(ownerPath, "utf-8")) as { ownerToken?: unknown };
  } catch (error) {
    throw new Error(`price store lock ownership cannot be verified: ${(error as Error).message}`);
  }
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`price store lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

/**
 * Cooperative single-writer wrapper. A stale lock is never stolen
 * automatically; recovery requires an explicit human operation.
 */
export function appendPriceRecordsWithLock(
  path: string,
  incoming: PitPriceRecord[],
  schema: JsonSchema,
  options: AppendPriceRecordsWithLockOptions,
): void {
  if (!options.ownerToken.trim()) throw new Error("ownerToken is required");
  if (incoming.length === 0) return;

  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(`price store lock is already held: ${lockPath}`);
    }
    throw error;
  }

  const now = options.now ?? new Date();
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken: options.ownerToken, acquiredAt: now.toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    assertCompleteJsonlTail(path);
    const existing = readPriceJsonl(path);
    const errors = validateHardenedPriceRecords([...existing, ...incoming], schema, now)
      .filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        errors.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"),
      );
    }

    const fd = openSync(path, "a");
    try {
      appendFileSync(fd, `${incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } finally {
    releasePriceStoreLock(lockPath, options.ownerToken);
  }
}
