import assert from "node:assert/strict";
import { validateProviderBatchAgainstQuery } from "../../src/research/price-store-hardening.js";
import { type PitPriceRecordInput, type PriceProviderBatch } from "../../src/research/price-store.js";

const record: PitPriceRecordInput = {
  schemaVersion: 1,
  seriesKind: "security",
  code: "TEST1",
  market: "TSE",
  tradingDate: "2024-01-04",
  dataAsOf: "2024-01-04T15:00:00.000000001+09:00",
  observedAt: "2024-01-04T15:00:00.000000002+09:00",
  retrievedAt: "2024-01-04T15:00:01+09:00",
  firstExecutableAt: "2024-01-05T09:00:00+09:00",
  source: "synthetic_fixture",
  sourceVersion: "fixture-v1",
  providerPlan: "synthetic",
  delayDays: 0,
  isDelayed: false,
  ingestionRunId: "provider-cutoff-subms",
  currency: "JPY",
  status: "traded",
  ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1_000_000 },
  adjusted: false,
  adjustmentFactor: 1,
  corporateActions: [],
  benchmarkCode: "TOPIX",
  sectorBenchmarkCode: "TOPIX-17",
  license: "redistributable",
};

const batch: PriceProviderBatch = {
  providerId: "synthetic-provider",
  sourceVersion: "fixture-v1",
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
  retrievedAt: record.retrievedAt,
  records: [record],
};

const query = {
  seriesKind: "security" as const,
  codes: ["TEST1"],
  from: "2024-01-01",
  to: "2024-01-31",
  asOf: "2024-01-04T15:00:00.000000000+09:00",
  plan: "synthetic" as const,
};

{
  const issues = validateProviderBatchAgainstQuery(batch, query);
  assert.ok(
    issues.some((issue) => issue.includes("dataAsOf is after query.asOf")),
    "dataAsOf that is 1ns after the PIT cutoff must be rejected",
  );
  assert.ok(
    issues.some((issue) => issue.includes("observedAt is after query.asOf")),
    "observedAt that is 2ns after the PIT cutoff must be rejected",
  );
  console.log("price-store provider query: sub-millisecond cutoff is preserved OK");
}

{
  const issues = validateProviderBatchAgainstQuery(batch, {
    ...query,
    asOf: "2024-01-04T15:00:00",
  });
  assert.ok(issues.some((issue) => issue.includes("invalid query.asOf")));
  console.log("price-store provider query: timezone-less cutoff fails closed OK");
}

console.log("price-store-provider-query-subms-cutoff.test.ts: all tests passed");
