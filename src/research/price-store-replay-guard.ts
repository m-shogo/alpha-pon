// Governed replay boundary for PIT Price Store.
//
// A timestamp cutoff alone is not a deterministic snapshot. Recommendation,
// Event Study and historical decision replay must also pin the ingestion runs
// that were accepted at issue time. This module validates that manifest before
// exposing price bars to downstream research.

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

function timeMs(value: string): number {
  return Date.parse(value);
}

function assertManifest(manifest: PriceReplaySnapshotManifest): Set<string> {
  if (!manifest.snapshotId.trim()) throw new Error("snapshotId is required");
  if (!Number.isFinite(timeMs(manifest.informationCutoff))) {
    throw new Error(`invalid informationCutoff: ${manifest.informationCutoff}`);
  }
  const runIds = manifest.allowedIngestionRunIds.map((value) => value.trim());
  if (runIds.length === 0 || runIds.some((value) => value.length === 0)) {
    throw new Error("allowedIngestionRunIds must contain non-empty run IDs");
  }
  if (new Set(runIds).size !== runIds.length) {
    throw new Error("allowedIngestionRunIds must not contain duplicates");
  }
  return new Set(runIds);
}

function matchesSelectorIdentity(
  record: PitPriceRecord,
  selector: HardenedPriceSeriesSelector,
): boolean {
  if (record.seriesKind !== selector.seriesKind || record.code !== selector.code) return false;
  if ((record.adjusted ? "adjusted" : "unadjusted") !== selector.priceBasis) return false;
  if (selector.market && record.market !== selector.market) return false;
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
  const allowedRunIds = assertManifest(context.manifest);
  const candidates = records.filter(
    (record) => matchesSelectorIdentity(record, selector) && allowedRunIds.has(record.ingestionRunId),
  );
  if (candidates.length === 0) {
    throw new Error(
      `no records match pinned snapshot ${context.manifest.snapshotId} for ${selector.code}`,
    );
  }

  const errors = validateHardenedPriceRecords(
    candidates,
    context.schema,
    context.now ?? new Date(),
  ).filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      errors.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"),
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

export function validateGovernedEventStudyPriceAlignment(
  inputs: GovernedEventStudyPriceInput[],
  asOf: string,
): PriceHardeningIssue[] {
  const issues: PriceHardeningIssue[] = [];
  const snapshotIds = new Set(inputs.map((input) => input.context.manifest.snapshotId));
  const cutoffs = new Set(inputs.map((input) => input.context.manifest.informationCutoff));
  if (snapshotIds.size !== 1) {
    issues.push({
      severity: "error",
      code: "missing_required_series",
      target: "event-study",
      message: `issuer/TOPIX/sector must use one pinned snapshotId: ${[...snapshotIds].sort().join(", ")}`,
    });
  }
  if (cutoffs.size !== 1 || !cutoffs.has(asOf)) {
    issues.push({
      severity: "error",
      code: "missing_required_series",
      target: "event-study",
      message: "issuer/TOPIX/sector informationCutoff must equal the requested replay cutoff",
    });
  }
  if (issues.length > 0) return issues;

  const hardenedInputs: EventStudyPriceInput[] = [];
  for (const input of inputs) {
    try {
      assertCutoff(asOf, input.context.manifest);
      const records = validatePinnedCandidates(input.records, input.selector, input.context);
      hardenedInputs.push({ role: input.role, records, selector: input.selector });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "missing_required_series",
        target: input.role,
        message: (error as Error).message,
      });
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
  issues.push(...validateProviderBatchAgainstQuery(batch, query, {
    expectedSource: expected.source,
    expectedIngestionRunId: expected.ingestionRunId,
  }));
  return [...new Set(issues)].sort();
}
