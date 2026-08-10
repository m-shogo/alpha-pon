import assert from "node:assert/strict";
import {
  selectPriceRecordsForReplay,
  validatePriceRecordHardening,
  validateProviderBatchAgainstQuery,
} from "../../src/research/price-store-hardening.js";
import {
  withPriceRecordHash,
  type PitPriceRecordInput,
  type PriceProviderBatch,
} from "../../src/research/price-store.js";

function record(overrides: Partial<PitPriceRecordInput> = {}) {
  return withPriceRecordHash({
    schemaVersion: 1,
    seriesKind: "security",
    code: "SUBMS-HARD",
    market: "TSE",
    tradingDate: "2024-01-04",
    dataAsOf: "2024-01-04T15:00:00.000000000+09:00",
    observedAt: "2024-01-04T15:35:00.000000000+09:00",
    retrievedAt: "2024-01-04T15:36:00.000000000+09:00",
    firstExecutableAt: "2024-01-04T15:37:00.000000000+09:00",
    source: "synthetic_fixture",
    sourceVersion: "subms-hard-v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "subms-hard-run",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1_000_000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    license: "redistributable",
    ...overrides,
  });
}

const selector = {
  seriesKind: "security" as const,
  code: "SUBMS-HARD",
  priceBasis: "unadjusted" as const,
  source: "synthetic_fixture",
  providerPlan: "synthetic" as const,
};

const inverted = record({
  retrievedAt: "2024-01-04T15:36:00.000000001+09:00",
  firstExecutableAt: "2024-01-04T15:36:00.000000000+09:00",
});
assert.ok(
  validatePriceRecordHardening(inverted)
    .some((issue) => issue.code === "execution_before_retrieval"),
  "hardening must reject a firstExecutableAt 1ns before retrievedAt",
);

const futureByOneNs = record({
  observedAt: "2024-01-04T15:35:00.000000001+09:00",
  retrievedAt: "2024-01-04T15:35:00.000000001+09:00",
  firstExecutableAt: "2024-01-04T15:35:00.000000001+09:00",
});
assert.equal(
  selectPriceRecordsForReplay(
    [futureByOneNs],
    "2024-01-04T15:35:00.000000000+09:00",
    selector,
    "provider_available",
  ).length,
  0,
  "hardening replay must keep a record observed 1ns after asOf invisible",
);

assert.throws(
  () => selectPriceRecordsForReplay(
    [futureByOneNs],
    "2024-01-04T15:35:00",
    selector,
    "provider_available",
  ),
  /invalid asOf/,
  "hardening replay asOf must require an explicit timezone",
);

const { contentHash: _futureHash, ...futureInput } = futureByOneNs;
const batch: PriceProviderBatch = {
  providerId: "synthetic-provider",
  sourceVersion: futureInput.sourceVersion,
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
  retrievedAt: futureInput.retrievedAt,
  records: [futureInput],
};
const query = {
  seriesKind: "security" as const,
  codes: ["SUBMS-HARD"],
  from: "2024-01-04",
  to: "2024-01-04",
  asOf: "2024-01-04T15:35:00.000000000+09:00",
  plan: "synthetic" as const,
};
assert.ok(
  validateProviderBatchAgainstQuery(batch, query)
    .includes(`records[0].observedAt is after query.asOf: ${futureInput.observedAt}`),
  "provider query cutoff must reject a record observed 1ns after asOf",
);
assert.ok(
  validateProviderBatchAgainstQuery(batch, { ...query, asOf: "2024-01-04T15:35:00" })
    .includes("invalid query.asOf: 2024-01-04T15:35:00"),
  "provider query cutoff must require an explicit timezone",
);

console.log("price-store-hardening: sub-ms replay/query-cutoff ordering OK");
