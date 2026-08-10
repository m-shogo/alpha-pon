import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  selectPriceRecordsAsOf,
  validatePriceRecord,
  validatePriceRecords,
  withPriceRecordHash,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;
const NOW = new Date("2026-08-05T20:00:00+09:00");

function input(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecordInput {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code: "SUBMS1",
    market: "TSE",
    tradingDate: "2024-01-04",
    dataAsOf: "2024-01-04T15:00:00.000000000+09:00",
    observedAt: "2024-01-04T15:35:00.000000000+09:00",
    retrievedAt: "2024-01-04T15:36:00.000000000+09:00",
    firstExecutableAt: "2024-01-04T15:37:00.000000000+09:00",
    source: "synthetic_fixture",
    sourceVersion: "subms-v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "subms-run-001",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1_000_000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    license: "redistributable",
    ...overrides,
  };
}

function codes(overrides: Partial<PitPriceRecordInput>, now = NOW): string[] {
  return validatePriceRecord(withPriceRecordHash(input(overrides)), schema, now)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);
}

assert.ok(codes({
  dataAsOf: "2024-01-04T15:35:00.000000001+09:00",
  observedAt: "2024-01-04T15:35:00.000000000+09:00",
}).includes("data_after_observation"), "1ns future dataAsOf must not collapse into observedAt millisecond");

assert.ok(codes({
  observedAt: "2024-01-04T15:35:00.000000001+09:00",
  retrievedAt: "2024-01-04T15:35:00.000000000+09:00",
}).includes("retrieval_before_observation"), "1ns retrieval inversion must fail closed");

assert.ok(codes({
  retrievedAt: "2024-01-04T15:36:00.000000001+09:00",
  firstExecutableAt: "2024-01-04T15:36:00.000000000+09:00",
}).includes("execution_before_retrieval"), "1ns execution inversion must fail closed");

assert.ok(codes({
  corporateActions: [{
    type: "split",
    effectiveDate: "2024-01-04",
    factor: 2,
    observedAt: "2024-01-04T15:35:00.000000001+09:00",
    source: "synthetic_fixture",
  }],
}).includes("corporate_action_after_record"), "1ns future corporate action must not enter a price record");

assert.ok(codes({
  observedAt: "2024-01-04T15:35:00.000000001+09:00",
  retrievedAt: "2024-01-04T15:35:00.000000001+09:00",
  firstExecutableAt: "2024-01-04T15:35:00.000000001+09:00",
}, new Date("2024-01-04T06:35:00.000Z")).includes("future_observation"), "1ns future observation must not collapse into Date millisecond now");

const revisionRoot = withPriceRecordHash(input({
  observedAt: "2024-01-04T15:35:00.000000001+09:00",
  retrievedAt: "2024-01-04T15:36:00.000000001+09:00",
  firstExecutableAt: "2024-01-04T15:37:00.000000001+09:00",
}));
const revisionNext = withPriceRecordHash(input({
  observedAt: "2024-01-04T15:35:00.000000002+09:00",
  retrievedAt: "2024-01-04T15:36:00.000000002+09:00",
  firstExecutableAt: "2024-01-04T15:37:00.000000002+09:00",
  supersedesHash: revisionRoot.contentHash,
}));
const revisionIssues = validatePriceRecords([revisionRoot, revisionNext], schema, NOW);
assert.ok(
  !revisionIssues.some((issue) => issue.code === "revision_time_not_monotonic"),
  "1ns-forward revision chronology must remain monotonic instead of collapsing to one millisecond",
);

const futureByOneNs = withPriceRecordHash(input({
  observedAt: "2024-01-04T15:35:00.000000001+09:00",
  retrievedAt: "2024-01-04T15:35:00.000000001+09:00",
  firstExecutableAt: "2024-01-04T15:35:00.000000001+09:00",
}));
assert.equal(
  selectPriceRecordsAsOf(
    [futureByOneNs],
    "2024-01-04T15:35:00.000000000+09:00",
    { seriesKind: "security", code: "SUBMS1" },
    "observed",
  ).length,
  0,
  "record observed 1ns after asOf must stay invisible",
);

console.log("research/price-store: sub-ms validation/revision/as-of ordering OK");
