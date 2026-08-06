// Governed replay boundary for PIT Price Store.
//
// A timestamp cutoff alone is not a deterministic snapshot. Recommendation,
// Event Study and historical decision replay must also pin the ingestion runs
// and immutable content hashes accepted at issue time.

import type { PriceSeries } from "./backtest.js";
import {
  selectPriceRecordsForReplay,
  validateEventStudyPriceAlignment,
  validateHardenedPriceRecords,
  validateProviderBatchAgainstQuery,
  type EventStudyPriceInput,
  type HardenedPriceSeriesSelector,
  type PriceHardeningIssue,
} from "./price-store-hardening.js";
import {
  type PitPriceRecord,
  type PriceOhlcv,
  type PriceProviderBatch,
  type PriceProviderQuery,
} from "./price-store.js";
import type { JsonSchema } from "./schema.js";

export interface PriceReplaySnapshotManifest {
  snapshotId: string;
  informationCutoff: string;
  allowedIngestionRunIds: readonly string[];
  allowedContentHashes: readonly string[];
}

export interface GovernedReplayContext {
  schema: JsonSchema;
  manifest: PriceReplaySnapshotManifest;
  now?: Date;
}

export interface GovernedEventStudyPriceInput extends EventStudyPriceInput {
  context: GovernedReplayContext;
}

export interface ExpectedProviderBatchIdentity {
  providerId: string;
  source: string;
  ingestionRunId: string;
}

export type PriceReplayGuardIssueCode =
  | "snapshot_manifest_mismatch"
  | "replay_cutoff_mismatch"
  | "duplicate_series_role"
  | "role_series_kind_mismatch"
  | "duplicate_required_series"
  | "pinned_record_invalid";

export interface PriceReplayGuardIssue {
  severity: "error";
  code: PriceReplayGuardIssueCode;
  target: string;
  message: string;
}

export type GovernedReplayIssue = PriceHardeningIssue | PriceReplayGuardIssue;

interface ValidatedManifest {
  runIds: Set<string>;
  contentHashes: Set<string>;
  signature: string;
}

function timeMs(value: string): number {
  return Date.parse(value);
}

function replayIssue(
  code: PriceReplayGuardIssueCode,
  target: string,
  message: string,
): PriceReplayGuardIssue {
  return { severity: "error", code, target, message };
}

function normalizedUniqueValues(
  values: readonly string[],
  label: string,
  validator?: (value: string) => boolean,
): string[] {
  const normalized = values.map((value) => value.trim());
  if (normalized.length === 0 || normalized.some((value) => value.length === 0)) {
    throw new Error(`${label} must contain non-empty values`);
  }
  if (validator && normalized.some((value) => !validator(value))) {
    throw new Error(`${label} contains an invalid value`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return normalized.sort();
}

function assertManifest(manifest: PriceReplaySnapshotManifest): ValidatedManifest {
  const snapshotId = manifest.snapshotId.trim();
  if (!snapshotId) throw new Error("snapshotId is required");
  if (!Number.isFinite(timeMs(manifest.informationCutoff))) {
    throw new Error(`invalid informationCutoff: ${manifest.informationCutoff}`);
  }
  const runIds = normalizedUniqueValues(
    manifest.allowedIngestionRunIds,
    "allowedIngestionRunIds",
  );
  const contentHashes = normalizedUniqueValues(
    manifest.allowedContentHashes,
    "allowedContentHashes",
    (value) => /^[a-f0-9]{64}$/.test(value),
  );
  const signature = JSON.stringify({
    snapshotId,
    informationCutoff: manifest.informationCutoff,
    allowedIngestionRunIds: runIds,
    allowedContentHashes: contentHashes,
  });
  return {
    runIds: new Set(runIds),
    contentHashes: new Set(contentHashes),
    signature,
  };
}

function basisOf(record: PitPriceRecord): "adjusted" | "unadjusted" {
  return record.adjusted ? "adjusted" : "unadjusted";
}

function matchesBaseIdentity(
  record: PitPriceRecord,
  selector: HardenedPriceSeriesSelector,
): boolean {
  if (record.seriesKind !== selector.seriesKind || record.code !== selector.code) return false;
  if (basisOf(record) !== selector.priceBasis) return false;
  if (selector.market && record.market !== selector.market) return false;
  return true;
}

function matchesFullIdentity(
  record: PitPriceRecord,
  selector: HardenedPriceSeriesSelector,
): boolean {
  if (!matchesBaseIdentity(record, selector)) return false;
  if (selector.source && record.source !== selector.source) return false;
  if (selector.providerPlan && record.providerPlan !== selector.providerPlan) return false;
  return true;
}

function assertCutoff(asOf: string, manifest: PriceReplaySnapshotManifest): void {
  if (asOf !== manifest.informationCutoff) {
    throw new Error(
      `replay cutoff must equal pinned informationCutoff: ${asOf} != ${manifest.informationCutoff}`,
    );
  }
}

function validatePinnedCandidates(
  records: PitPriceRecord[],
  selector: HardenedPriceSeriesSelector,
  context: GovernedReplayContext,
): PitPriceRecord[] {
  const manifest = assertManifest(context.manifest);
  const pinnedBaseRecords = records.filter(
    (record) =>
      matchesBaseIdentity(record, selector) &&
      manifest.runIds.has(record.ingestionRunId) &&
      manifest.contentHashes.has(record.contentHash),
  );
  if (pinnedBaseRecords.length === 0) {
    throw new Error(
      `no records match pinned snapshot ${context.manifest.snapshotId} for ${selector.code}`,
    );
  }

  const errors = validateHardenedPriceRecords(
    pinnedBaseRecords,
    context.schema,
    context.now ?? new Date(),
  ).filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      errors.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"),
    );
  }

  const candidates = pinnedBaseRecords.filter((record) => matchesFullIdentity(record, selector));
  if (candidates.length === 0) {
    throw new Error(
      `pinned snapshot ${context.manifest.snapshotId} has no record matching source/plan for ${selector.code}`,
    );
  }
  return candidates;
}

export function selectGovernedPriceRecordsForReplay(
  records: PitPriceRecord[],
  asOf: string,
  selector: HardenedPriceSeriesSelector,
  context: GovernedReplayContext,
): PitPriceRecord[] {
  assertCutoff(asOf, context.manifest);
  const candidates = validatePinnedCandidates(records, selector, context);
  const selected = selectPriceRecordsForReplay(
    candidates,
    asOf,
    selector,
    "system_replay",
  );
  if (selected.length === 0) {
    throw new Error(
      `pinned snapshot ${context.manifest.snapshotId} has no system-replay price for ${selector.code}`,
    );
  }
  return selected;
}

export function toGovernedBacktestPriceSeries(
  records: PitPriceRecord[],
  asOf: string,
  selector: HardenedPriceSeriesSelector,
  context: GovernedReplayContext,
): PriceSeries {
  const selected = selectGovernedPriceRecordsForReplay(records, asOf, selector, context);
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

function roleCount(inputs: GovernedEventStudyPriceInput[], role: string): number {
  return inputs.filter((input) => input.role === role).length;
}

export function validateGovernedEventStudyPriceAlignment(
  inputs: GovernedEventStudyPriceInput[],
  asOf: string,
): GovernedReplayIssue[] {
  const issues: GovernedReplayIssue[] = [];
  const manifestSignatures = new Set<string>();
  for (const input of inputs) {
    try {
      manifestSignatures.add(assertManifest(input.context.manifest).signature);
    } catch (error) {
      issues.push(replayIssue("pinned_record_invalid", input.role, (error as Error).message));
    }
  }
  if (manifestSignatures.size > 1) {
    issues.push(replayIssue(
      "snapshot_manifest_mismatch",
      "event-study",
      "issuer/TOPIX/sector must use the exact same pinned snapshot manifest",
    ));
  }

  for (const role of ["issuer", "benchmark", "sector"] as const) {
    if (roleCount(inputs, role) > 1) {
      issues.push(replayIssue(
        "duplicate_series_role",
        role,
        `Event Study role=${role} must appear exactly once`,
      ));
    }
  }

  for (const input of inputs) {
    const expectedKind = input.role === "issuer" ? "security" : "benchmark";
    if (input.selector.seriesKind !== expectedKind) {
      issues.push(replayIssue(
        "role_series_kind_mismatch",
        input.role,
        `role=${input.role} requires seriesKind=${expectedKind}`,
      ));
    }
  }

  const byRole = new Map(inputs.map((input) => [input.role, input]));
  const benchmark = byRole.get("benchmark");
  const sector = byRole.get("sector");
  if (benchmark && sector && benchmark.selector.code === sector.selector.code) {
    issues.push(replayIssue(
      "duplicate_required_series",
      "event-study",
      "benchmark and sector benchmark must be distinct series",
    ));
  }

  const cutoffs = new Set(inputs.map((input) => input.context.manifest.informationCutoff));
  if (cutoffs.size !== 1 || !cutoffs.has(asOf)) {
    issues.push(replayIssue(
      "replay_cutoff_mismatch",
      "event-study",
      "issuer/TOPIX/sector informationCutoff must equal the requested replay cutoff",
    ));
  }
  if (issues.length > 0) return issues;

  const hardenedInputs: EventStudyPriceInput[] = [];
  for (const input of inputs) {
    try {
      assertCutoff(asOf, input.context.manifest);
      const records = validatePinnedCandidates(input.records, input.selector, input.context);
      hardenedInputs.push({ role: input.role, records, selector: input.selector });
    } catch (error) {
      issues.push(replayIssue("pinned_record_invalid", input.role, (error as Error).message));
    }
  }
  if (issues.length > 0) return issues;
  return validateEventStudyPriceAlignment(hardenedInputs, asOf, "system_replay");
}

export function validateGovernedProviderBatch(
  batch: PriceProviderBatch,
  query: PriceProviderQuery,
  expected: ExpectedProviderBatchIdentity,
): string[] {
  const issues: string[] = [];
  if (!expected.providerId.trim()) issues.push("expected.providerId is required");
  if (!expected.source.trim()) issues.push("expected.source is required");
  if (!expected.ingestionRunId.trim()) issues.push("expected.ingestionRunId is required");
  if (batch.providerId !== expected.providerId) {
    issues.push("batch.providerId does not match expected.providerId");
  }
  batch.records.forEach((record, index) => {
    if (record.license === "metadata_only" && (record.status === "traded" || !!record.ohlcv)) {
      issues.push(`records[${index}] metadata_only may not contain OHLCV price payload`);
    }
  });
  issues.push(...validateProviderBatchAgainstQuery(batch, query, {
    expectedSource: expected.source,
    expectedIngestionRunId: expected.ingestionRunId,
  }));
  return [...new Set(issues)].sort();
}
