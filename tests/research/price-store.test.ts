import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPriceRecords,
  computePriceRecordHash,
  parsePriceJsonl,
  readPriceJsonl,
  selectPriceRecordsAsOf,
  toBacktestPriceSeries,
  validatePriceRecord,
  validatePriceRecords,
  withPriceRecordHash,
  type PitPriceRecord,
  type PitPriceRecordInput,
  type PriceProvider,
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
    code: "TEST1",
    market: "TSE",
    tradingDate: "2024-01-04",
    dataAsOf: "2024-01-04T15:00:00+09:00",
    observedAt: "2024-01-04T15:35:00+09:00",
    retrievedAt: "2024-01-04T15:36:00+09:00",
    firstExecutableAt: "2024-01-05T09:00:00+09:00",
    source: "synthetic_fixture",
    sourceVersion: "fixture-v2",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "fixture-run-002",
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
  };
}

function record(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecord {
  return withPriceRecordHash(input(overrides));
}

function errorCodes(records: PitPriceRecord[]): string[] {
  return validatePriceRecords(records, schema, NOW)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);
}

{
  const content = readFileSync("research/fixtures/prices/synthetic-security.jsonl", "utf-8");
  const records = parsePriceJsonl(content, "fixture");
  assert.equal(records.length, 1);
  assert.deepEqual(errorCodes(records), []);
  assert.equal(records[0].contentHash, computePriceRecordHash(records[0]));
  console.log("research/price-store: synthetic fixture OK");
}

{
  const original = record();
  assert.equal(computePriceRecordHash(original), original.contentHash);
  const tampered = { ...original, delayDays: 84 };
  assert.ok(errorCodes([tampered]).includes("invalid_content_hash"));
  console.log("research/price-store: content hash tamper detection OK");
}

{
  assert.ok(errorCodes([record({
    dataAsOf: "2024-01-04T16:00:00+09:00",
    observedAt: "2024-01-04T15:35:00+09:00",
  })]).includes("data_after_observation"));
  assert.ok(errorCodes([record({
    retrievedAt: "2024-01-04T15:34:00+09:00",
  })]).includes("retrieval_before_observation"));
  assert.ok(errorCodes([record({
    firstExecutableAt: "2024-01-04T15:00:00+09:00",
  })]).includes("execution_before_observation"));
  assert.ok(errorCodes([record({ tradingDate: "2024-01-03" })]).includes("trading_date_mismatch"));
  assert.ok(errorCodes([record({
    observedAt: "2027-01-01T00:00:00+09:00",
    retrievedAt: "2027-01-01T00:01:00+09:00",
    firstExecutableAt: "2027-01-04T09:00:00+09:00",
  })]).includes("future_observation"));
  console.log("research/price-store: timestamp boundaries OK");
}

{
  const free = record({
    providerPlan: "free",
    delayDays: 84,
    isDelayed: true,
    observedAt: "2024-03-28T16:00:00+09:00",
    retrievedAt: "2024-03-28T16:01:00+09:00",
    firstExecutableAt: "2024-03-29T09:00:00+09:00",
  });
  const standard = record({ providerPlan: "standard", delayDays: 0, isDelayed: false });
  assert.deepEqual(errorCodes([free]), []);
  assert.deepEqual(errorCodes([standard]), []);
  assert.ok(errorCodes([record({
    providerPlan: "free",
    delayDays: 84,
    isDelayed: false,
  })]).includes("delay_flag_mismatch"));
  console.log("research/price-store: provider plan/delay contract OK");
}

{
  const missing = record({ status: "missing", missingReason: "provider_gap", ohlcv: undefined });
  assert.deepEqual(errorCodes([missing]), []);
  assert.ok(errorCodes([record({ status: "missing", ohlcv: undefined })]).includes("missing_reason_required"));
  assert.ok(errorCodes([record({
    status: "suspended",
    missingReason: "exchange_suspension",
  })]).includes("ohlcv_for_non_traded"));
  assert.ok(errorCodes([record({ missingReason: "unknown" })]).includes("missing_reason_for_traded"));
  const series = toBacktestPriceSeries([record(), missing], "2026-01-01T00:00:00+09:00", {
    seriesKind: "security",
    code: "TEST1",
  });
  assert.equal(series.bars.length, 1, "missing row is not forward-filled into Backtest");
  console.log("research/price-store: missing/no-forward-fill contract OK");
}

{
  const leaked = record({
    corporateActions: [{
      type: "split",
      effectiveDate: "2024-02-01",
      factor: 2,
      observedAt: "2024-02-01T15:30:00+09:00",
      source: "fixture",
    }],
  });
  assert.ok(errorCodes([leaked]).includes("corporate_action_after_record"));

  const noFactor = record({
    corporateActions: [{
      type: "split",
      effectiveDate: "2024-01-04",
      observedAt: "2024-01-04T14:00:00+09:00",
      source: "fixture",
    }],
  });
  assert.ok(errorCodes([noFactor]).includes("corporate_action_factor_required"));
  console.log("research/price-store: corporate action PIT contract OK");
}

{
  assert.ok(errorCodes([record({ license: "unknown" })]).includes("unknown_license"));
  console.log("research/price-store: license boundary OK");
}

{
  const first = record({
    observedAt: "2024-01-05T00:30:00+09:00",
    retrievedAt: "2024-01-05T00:31:00+09:00",
    firstExecutableAt: "2024-01-05T09:00:00+09:00",
  });
  const secondInput = input({
    observedAt: "2024-01-04T16:00:00Z",
    retrievedAt: "2024-01-04T16:01:00Z",
    firstExecutableAt: "2024-01-05T09:00:00+09:00",
    sourceVersion: "fixture-v3",
    ingestionRunId: "fixture-run-003",
    ohlcv: { open: 1000, high: 1040, low: 990, close: 1030, volume: 1_100_000 },
    supersedesHash: first.contentHash,
  });
  const second = withPriceRecordHash(secondInput);
  assert.deepEqual(errorCodes([first, second]), []);
  const selected = selectPriceRecordsAsOf(
    [first, second],
    "2024-01-05T10:00:00+09:00",
    { seriesKind: "security", code: "TEST1", providerPlan: "synthetic" },
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0].contentHash, second.contentHash);

  const broken = withPriceRecordHash({ ...secondInput, supersedesHash: "0".repeat(64) });
  assert.ok(errorCodes([first, broken]).includes("invalid_supersedes_hash"));
  console.log("research/price-store: revision chain/timezone ordering OK");
}

{
  const row = record();
  assert.equal(selectPriceRecordsAsOf(
    [row],
    "2024-01-04T16:00:00+09:00",
    { seriesKind: "security", code: "TEST1" },
    "observed",
  ).length, 1);
  assert.equal(selectPriceRecordsAsOf(
    [row],
    "2024-01-04T16:00:00+09:00",
    { seriesKind: "security", code: "TEST1" },
    "executable",
  ).length, 0);
  assert.equal(toBacktestPriceSeries(
    [row],
    "2024-01-04T16:00:00+09:00",
    { seriesKind: "security", code: "TEST1" },
  ).bars.length, 0);
  console.log("research/price-store: firstExecutable boundary OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "pit-price-store-"));
  const path = join(dir, "security", "TEST1.jsonl");
  try {
    const first = record();
    appendPriceRecords(path, [first], schema, NOW);
    assert.equal(readPriceJsonl(path).length, 1);
    assert.throws(() => appendPriceRecords(path, [first], schema, NOW), /既存contentHash/);
    assert.equal(readPriceJsonl(path).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("research/price-store: append-only writer OK");
}

{
  const provider: PriceProvider = {
    id: "synthetic-provider",
    license: "redistributable",
    capabilities: {
      plan: "synthetic",
      delayDays: 0,
      supportsAdjusted: true,
      supportsUnadjusted: true,
      supportsCorporateActions: true,
      supportsBenchmarks: true,
      supportsSectorBenchmarks: true,
      historyFrom: "2020-01-01",
    },
    async fetchDaily() {
      return {
        providerId: "synthetic-provider",
        sourceVersion: "fixture-v2",
        capabilities: this.capabilities,
        license: this.license,
        retrievedAt: "2024-01-04T15:36:00+09:00",
        records: [input()],
      };
    },
  };
  const batch = await provider.fetchDaily({
    seriesKind: "security",
    codes: ["TEST1"],
    from: "2024-01-01",
    to: "2024-01-31",
    asOf: "2024-02-01T00:00:00+09:00",
  });
  assert.equal(batch.capabilities.plan, "synthetic");
  assert.equal(batch.records.length, 1);
  console.log("research/price-store: provider capability contract OK");
}

{
  const raw = record() as unknown as Record<string, unknown>;
  delete raw.retrievedAt;
  const issues = validatePriceRecord(raw as unknown as PitPriceRecord, schema, NOW);
  assert.ok(issues.some((issue) => issue.code === "schema"));
}

console.log("research/price-store: 全テスト成功");
