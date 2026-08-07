import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validatePriceRecord,
  validateProviderBatch,
  withPriceRecordHash,
  type PitPriceRecordInput,
  type PriceProviderBatch,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

function input(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecordInput {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code: "TEST1",
    market: "TSE",
    tradingDate: "2026-08-06",
    dataAsOf: "2026-08-06T15:30:00+09:00",
    observedAt: "2026-08-07T01:00:00.000Z",
    retrievedAt: "2026-08-07T01:05:00.000Z",
    firstExecutableAt: "2026-08-07T01:06:00.000Z",
    source: "synthetic_fixture",
    sourceVersion: "execution-boundary-v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "execution-boundary-fixture",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1000000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    license: "redistributable",
    ...overrides,
  };
}

{
  const valid = withPriceRecordHash(input());
  const errors = validatePriceRecord(
    valid,
    schema,
    new Date("2026-08-07T12:00:00.000Z"),
  ).filter(issue => issue.severity === "error");
  assert.deepEqual(errors, []);
  console.log("price-store-execution-boundary: retrievedAt <= firstExecutableAt passes OK");
}

{
  const impossible = withPriceRecordHash(input({
    firstExecutableAt: "2026-08-07T01:04:00.000Z",
  }));
  const issues = validatePriceRecord(
    impossible,
    schema,
    new Date("2026-08-07T12:00:00.000Z"),
  );
  assert.ok(issues.some(issue => issue.code === "execution_before_retrieval"));
  console.log("price-store-execution-boundary: execution before retrieval is rejected OK");
}

{
  const record = input({ firstExecutableAt: "2026-08-07T01:04:00.000Z" });
  const batch: PriceProviderBatch = {
    providerId: "synthetic-provider",
    sourceVersion: "execution-boundary-v1",
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
    retrievedAt: "2026-08-07T01:05:00.000Z",
    records: [record],
  };
  assert.ok(validateProviderBatch(batch).includes(
    "records[0].firstExecutableAt precedes batch retrievedAt",
  ));
  console.log("price-store-execution-boundary: provider batch rejects pre-retrieval execution OK");
}

console.log("price-store-execution-after-retrieval.test.ts passed");
