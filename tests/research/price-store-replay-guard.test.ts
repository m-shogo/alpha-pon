import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  selectGovernedPriceRecordsForReplay,
  toGovernedBacktestPriceSeries,
  validateGovernedEventStudyPriceAlignment,
  validateGovernedProviderBatch,
  type GovernedReplayContext,
} from "../../src/research/price-store-replay-guard.js";
import {
  withPriceRecordHash,
  type PitPriceRecord,
  type PitPriceRecordInput,
  type PriceProviderBatch,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;
const NOW = new Date("2026-08-06T00:20:00+09:00");
const CUTOFF = "2024-01-05T12:00:00+09:00";

function record(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecord {
  return withPriceRecordHash({
    schemaVersion: 1,
    seriesKind: "security",
    code: "TEST1",
    market: "TSE",
    tradingDate: "2024-01-04",
    dataAsOf: "2024-01-04T15:00:00+09:00",
    observedAt: "2024-01-04T15:35:00+09:00",
    retrievedAt: "2024-01-04T15:36:00+09:00",
    firstExecutableAt: "2024-01-05T09:00:00+09:00",
    source: "synthetic_fixture",
    sourceVersion: "fixture-v4",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "run-a",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1_000_000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    sectorBenchmarkCode: "TOPIX-17",
    license: "redistributable",
    ...overrides,
  });
}

function context(
  records: readonly PitPriceRecord[],
  snapshotId = "snapshot-a",
): GovernedReplayContext {
  return {
    schema,
    now: NOW,
    manifest: {
      snapshotId,
      informationCutoff: CUTOFF,
      allowedIngestionRunIds: [...new Set(records.map((item) => item.ingestionRunId))],
      allowedContentHashes: [...new Set(records.map((item) => item.contentHash))],
    },
  };
}

const selector = {
  seriesKind: "security" as const,
  code: "TEST1",
  priceBasis: "unadjusted" as const,
  source: "synthetic_fixture",
  providerPlan: "synthetic" as const,
};

{
  const pinned = record();
  const unpinned = record({
    ingestionRunId: "run-b",
    retrievedAt: "2024-01-04T15:37:00+09:00",
  });
  const snapshot = context([pinned]);
  const selected = selectGovernedPriceRecordsForReplay(
    [pinned, unpinned],
    CUTOFF,
    selector,
    snapshot,
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0].ingestionRunId, "run-a");
  assert.equal(
    toGovernedBacktestPriceSeries([pinned, unpinned], CUTOFF, selector, snapshot).bars.length,
    1,
  );
  console.log("price-store-replay-guard: ingestion run/hash pinning OK");
}

{
  const original = record();
  const tampered = { ...original, close: undefined, contentHash: original.contentHash } as never;
  assert.throws(
    () => selectGovernedPriceRecordsForReplay(
      [tampered],
      CUTOFF,
      selector,
      context([tampered]),
    ),
    /schema|invalid_content_hash/,
  );

  const unknownPlan = record({ providerPlan: "unknown" });
  assert.throws(
    () => selectGovernedPriceRecordsForReplay(
      [unknownPlan],
      CUTOFF,
      { ...selector, providerPlan: undefined },
      context([unknownPlan]),
    ),
    /unknown_provider_plan/,
  );
  console.log("price-store-replay-guard: pinned record validation OK");
}

{
  const pinned = record();
  assert.throws(
    () => selectGovernedPriceRecordsForReplay(
      [pinned],
      "2024-01-05T12:01:00+09:00",
      selector,
      context([pinned]),
    ),
    /cutoff must equal pinned informationCutoff/,
  );
  const invalidContext: GovernedReplayContext = {
    schema,
    now: NOW,
    manifest: {
      snapshotId: "",
      informationCutoff: CUTOFF,
      allowedIngestionRunIds: [],
      allowedContentHashes: [],
    },
  };
  assert.throws(
    () => selectGovernedPriceRecordsForReplay([pinned], CUTOFF, selector, invalidContext),
    /snapshotId is required/,
  );
  console.log("price-store-replay-guard: manifest validation OK");
}

{
  const issuer = record();
  const benchmark = record({ seriesKind: "benchmark", code: "TOPIX", benchmarkCode: undefined });
  const sector = record({ seriesKind: "benchmark", code: "TOPIX-17", benchmarkCode: undefined });
  const sharedContext = context([issuer, benchmark, sector]);
  const inputs = [
    { role: "issuer" as const, records: [issuer], selector, context: sharedContext },
    {
      role: "benchmark" as const,
      records: [benchmark],
      selector: { ...selector, seriesKind: "benchmark" as const, code: "TOPIX" },
      context: sharedContext,
    },
    {
      role: "sector" as const,
      records: [sector],
      selector: { ...selector, seriesKind: "benchmark" as const, code: "TOPIX-17" },
      context: sharedContext,
    },
  ];
  assert.deepEqual(validateGovernedEventStudyPriceAlignment(inputs, CUTOFF), []);

  const mismatch = inputs.map((input, index) =>
    index === 2 ? { ...input, context: context([issuer, benchmark, sector], "snapshot-b") } : input
  );
  assert.ok(validateGovernedEventStudyPriceAlignment(mismatch, CUTOFF)
    .some((issue) => issue.code === "snapshot_manifest_mismatch"));

  assert.ok(validateGovernedEventStudyPriceAlignment(
    [...inputs, inputs[0]],
    CUTOFF,
  ).some((issue) => issue.code === "duplicate_series_role"));

  assert.ok(validateGovernedEventStudyPriceAlignment(
    inputs.map((input, index) => index === 0
      ? { ...input, selector: { ...input.selector, seriesKind: "benchmark" as const } }
      : input),
    CUTOFF,
  ).some((issue) => issue.code === "role_series_kind_mismatch"));
  console.log("price-store-replay-guard: event study snapshot/role alignment OK");
}

{
  const base = record();
  const { contentHash: _contentHash, ...input } = base;
  const batch: PriceProviderBatch = {
    providerId: "synthetic-provider",
    sourceVersion: input.sourceVersion,
    capabilities: {
      plan: "synthetic",
      delayDays: 0,
      supportsAdjusted: true,
      supportsUnadjusted: true,
      supportsCorporateActions: true,
      supportsBenchmarks: true,
      supportsSectorBenchmarks: true,
    },
    license: "redistributable",
    retrievedAt: input.retrievedAt,
    records: [input],
  };
  const query = {
    seriesKind: "security" as const,
    codes: ["TEST1"],
    from: "2024-01-01",
    to: "2024-01-31",
    asOf: "2024-02-01T00:00:00+09:00",
    plan: "synthetic" as const,
  };
  assert.deepEqual(validateGovernedProviderBatch(batch, query, {
    providerId: "synthetic-provider",
    source: "synthetic_fixture",
    ingestionRunId: "run-a",
  }), []);
  assert.ok(validateGovernedProviderBatch(batch, query, {
    providerId: "other-provider",
    source: "synthetic_fixture",
    ingestionRunId: "run-a",
  }).some((issue) => issue.includes("providerId")));
  assert.ok(validateGovernedProviderBatch(
    {
      ...batch,
      license: "metadata_only",
      records: [{ ...input, license: "metadata_only" }],
    },
    query,
    {
      providerId: "synthetic-provider",
      source: "synthetic_fixture",
      ingestionRunId: "run-a",
    },
  ).some((issue) => issue.includes("metadata_only")));
  console.log("price-store-replay-guard: mandatory provider identity/license OK");
}

console.log("price-store-replay-guard: 全テスト成功");
