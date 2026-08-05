import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPriceRecords,
  parsePriceJsonl,
  readPriceJsonl,
  selectPriceRecordsAsOf,
  toBacktestPriceSeries,
  validatePriceRecord,
  validatePriceRecords,
  withPriceRecordHash,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const NOW = new Date("2026-08-05T14:00:00+09:00");
const schema = JSON.parse(readFileSync("research/schemas/price-record.schema.json", "utf-8")) as JsonSchema;

function input(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecordInput {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code: "TEST1",
    market: "TSE",
    tradingDate: "2024-01-04",
    observedAt: "2024-01-04T15:35:00+09:00",
    firstExecutableAt: "2024-01-05T09:00:00+09:00",
    source: "synthetic_fixture",
    sourceVersion: "fixture-v1",
    ingestionRunId: "fixture-run-001",
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

function codes(records: ReturnType<typeof withPriceRecordHash>[]): string[] {
  return validatePriceRecords(records, schema, NOW).map((issue) => issue.code);
}

function testSyntheticFixturePasses() {
  const records = parsePriceJsonl(
    readFileSync("research/fixtures/prices/synthetic-security.jsonl", "utf-8"),
    "synthetic-security.jsonl",
  );
  assert.deepEqual(validatePriceRecords(records, schema, NOW), []);
  console.log("research/price-store: synthetic fixture OK");
}

function testHashTamperingRejected() {
  const record = { ...withPriceRecordHash(input()), contentHash: "0".repeat(64) };
  assert.ok(validatePriceRecord(record, schema, NOW).some((issue) => issue.code === "invalid_content_hash"));
  console.log("research/price-store: content hash tampering rejected");
}

function testFutureAndExecutionOrderRejected() {
  const future = withPriceRecordHash(input({ observedAt: "2026-08-06T15:35:00+09:00", firstExecutableAt: "2026-08-07T09:00:00+09:00" }));
  assert.ok(validatePriceRecord(future, schema, NOW).some((issue) => issue.code === "future_observation"));

  const reversed = withPriceRecordHash(input({ firstExecutableAt: "2024-01-04T15:00:00+09:00" }));
  assert.ok(validatePriceRecord(reversed, schema, NOW).some((issue) => issue.code === "execution_before_observation"));
  console.log("research/price-store: PIT timestamp order OK");
}

function testInvalidOhlcvRejected() {
  const record = withPriceRecordHash(
    input({ ohlcv: { open: 1000, high: 900, low: 950, close: 980, volume: 10.5 } }),
  );
  assert.ok(validatePriceRecord(record, schema, NOW).some((issue) => issue.code === "schema" || issue.code === "invalid_ohlcv"));
  console.log("research/price-store: invalid OHLCV rejected");
}

function testRevisionRequiresHashChain() {
  const first = withPriceRecordHash(input());
  const missingLink = withPriceRecordHash(
    input({
      observedAt: "2024-01-05T18:00:00+09:00",
      firstExecutableAt: "2024-01-09T09:00:00+09:00",
      sourceVersion: "fixture-v2",
      ingestionRunId: "fixture-run-002",
      ohlcv: { open: 1000, high: 1030, low: 990, close: 1015, volume: 1_000_000 },
    }),
  );
  assert.ok(codes([first, missingLink]).includes("missing_supersedes_hash"));

  const linked = withPriceRecordHash({ ...missingLink, supersedesHash: first.contentHash });
  assert.deepEqual(validatePriceRecords([first, linked], schema, NOW), []);
  console.log("research/price-store: explicit revision chain OK");
}

function testAsOfSelectionDoesNotLeakRevision() {
  const first = withPriceRecordHash(input());
  const revised = withPriceRecordHash(
    input({
      observedAt: "2024-01-05T18:00:00+09:00",
      firstExecutableAt: "2024-01-09T09:00:00+09:00",
      sourceVersion: "fixture-v2",
      ingestionRunId: "fixture-run-002",
      supersedesHash: first.contentHash,
      ohlcv: { open: 1000, high: 1030, low: 990, close: 1015, volume: 1_000_000 },
    }),
  );

  const beforeRevision = selectPriceRecordsAsOf([first, revised], "2024-01-05T12:00:00+09:00", {
    seriesKind: "security",
    code: "TEST1",
  });
  assert.equal(beforeRevision[0].contentHash, first.contentHash, "revision publication before cannot use revision");

  const afterRevision = toBacktestPriceSeries([first, revised], "2024-01-05T19:00:00+09:00", {
    seriesKind: "security",
    code: "TEST1",
  });
  assert.equal(afterRevision.bars[0].close, 1015);
  console.log("research/price-store: as-of revision selection OK");
}

function testAppendOnlyWriter() {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-price-store-"));
  const path = join(root, "TEST1.jsonl");
  try {
    const first = withPriceRecordHash(input());
    const revised = withPriceRecordHash(
      input({
        observedAt: "2024-01-05T18:00:00+09:00",
        firstExecutableAt: "2024-01-09T09:00:00+09:00",
        sourceVersion: "fixture-v2",
        ingestionRunId: "fixture-run-002",
        supersedesHash: first.contentHash,
        ohlcv: { open: 1000, high: 1030, low: 990, close: 1015, volume: 1_000_000 },
      }),
    );
    appendPriceRecords(path, [first], schema, NOW);
    appendPriceRecords(path, [revised], schema, NOW);
    assert.equal(readPriceJsonl(path).length, 2);
    assert.throws(() => appendPriceRecords(path, [first], schema, NOW), /再追加できません/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/price-store: append-only writer OK");
}

testSyntheticFixturePasses();
testHashTamperingRejected();
testFutureAndExecutionOrderRejected();
testInvalidOhlcvRejected();
testRevisionRequiresHashChain();
testAsOfSelectionDoesNotLeakRevision();
testAppendOnlyWriter();

console.log("research/price-store: all tests passed");
