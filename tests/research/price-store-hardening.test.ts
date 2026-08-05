import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPriceRecordsWithLock,
  selectPriceRecordsForReplay,
  validateEventStudyPriceAlignment,
  validateHardenedPriceRecords,
  validatePriceRecordHardening,
  validateProviderBatchAgainstQuery,
} from "../../src/research/price-store-hardening.js";
import {
  readPriceJsonl,
  type PitPriceRecord,
  type PriceProviderBatch,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;
const NOW = new Date("2026-08-05T23:30:00+09:00");
let hashCounter = 0;

function record(overrides: Partial<PitPriceRecord> = {}): PitPriceRecord {
  hashCounter += 1;
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
    sourceVersion: "fixture-v3",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "fixture-run-hardening",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1_000_000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    sectorBenchmarkCode: "TOPIX-17",
    license: "redistributable",
    contentHash: hashCounter.toString(16).padStart(64, "0"),
    ...overrides,
  };
}

{
  const unadjusted = record();
  const adjusted = record({
    adjusted: true,
    adjustmentFactor: 0.5,
    corporateActions: [{
      type: "split",
      effectiveDate: "2023-12-01",
      factor: 2,
      observedAt: "2023-11-01T15:30:00+09:00",
      source: "synthetic_fixture",
    }],
  });
  const issues = validateHardenedPriceRecords([unadjusted, adjusted], schema, NOW);
  assert.equal(issues.some((issue) => issue.code === "missing_supersedes_hash"), false);
  console.log("price-store-hardening: adjusted/unadjusted identity isolation OK");
}

{
  const issues = validatePriceRecordHardening(record({
    retrievedAt: "2024-01-05T10:00:00+09:00",
    firstExecutableAt: "2024-01-05T09:00:00+09:00",
  }));
  assert.ok(issues.some((issue) => issue.code === "execution_before_retrieval"));
  console.log("price-store-hardening: retrieval/execution boundary OK");
}

{
  const issues = validatePriceRecordHardening(record({ providerPlan: "unknown", source: "unknown" }));
  assert.ok(issues.some((issue) => issue.code === "unknown_provider_plan"));
  assert.ok(issues.some((issue) => issue.code === "unknown_source"));
  console.log("price-store-hardening: governed source/plan boundary OK");
}

{
  assert.ok(validatePriceRecordHardening(record({
    status: "suspended",
    missingReason: "provider_gap",
    ohlcv: undefined,
  })).some((issue) => issue.code === "status_reason_mismatch"));
  assert.deepEqual(validatePriceRecordHardening(record({
    status: "suspended",
    missingReason: "exchange_suspension",
    ohlcv: undefined,
  })).filter((issue) => issue.code === "status_reason_mismatch"), []);
  console.log("price-store-hardening: status/reason matrix OK");
}

{
  const issues = validatePriceRecordHardening(record({
    adjusted: true,
    adjustmentFactor: 0.5,
    corporateActions: [{
      type: "split",
      effectiveDate: "2024-02-01",
      factor: 2,
      observedAt: "2024-01-03T15:30:00+09:00",
      source: "synthetic_fixture",
    }],
  }));
  assert.ok(issues.some((issue) => issue.code === "future_effective_corporate_action"));
  console.log("price-store-hardening: future-effective action leakage guard OK");
}

{
  const delayedIngestion = record({
    retrievedAt: "2024-01-06T08:00:00+09:00",
    firstExecutableAt: "2024-01-06T09:00:00+09:00",
  });
  const selector = {
    seriesKind: "security" as const,
    code: "TEST1",
    priceBasis: "unadjusted" as const,
    source: "synthetic_fixture",
    providerPlan: "synthetic" as const,
  };
  assert.equal(selectPriceRecordsForReplay(
    [delayedIngestion],
    "2024-01-05T12:00:00+09:00",
    selector,
    "provider_available",
  ).length, 1);
  assert.equal(selectPriceRecordsForReplay(
    [delayedIngestion],
    "2024-01-05T12:00:00+09:00",
    selector,
    "system_replay",
  ).length, 0);
  console.log("price-store-hardening: provider/system replay separation OK");
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
  assert.deepEqual(validateProviderBatchAgainstQuery(batch, query), []);
  assert.ok(validateProviderBatchAgainstQuery(
    { ...batch, records: [{ ...input, code: "OUTSIDE" }] },
    query,
  ).some((issue) => issue.includes("outside query.codes")));
  console.log("price-store-hardening: provider batch/query contract OK");
}

{
  const issuer = record();
  const benchmark = record({ seriesKind: "benchmark", code: "TOPIX", benchmarkCode: undefined });
  const sector = record({ seriesKind: "benchmark", code: "TOPIX-17", benchmarkCode: undefined });
  const inputs = [
    {
      role: "issuer" as const,
      records: [issuer],
      selector: {
        seriesKind: "security" as const,
        code: "TEST1",
        priceBasis: "unadjusted" as const,
        source: "synthetic_fixture",
        providerPlan: "synthetic" as const,
      },
    },
    {
      role: "benchmark" as const,
      records: [benchmark],
      selector: {
        seriesKind: "benchmark" as const,
        code: "TOPIX",
        priceBasis: "unadjusted" as const,
        source: "synthetic_fixture",
        providerPlan: "synthetic" as const,
      },
    },
    {
      role: "sector" as const,
      records: [sector],
      selector: {
        seriesKind: "benchmark" as const,
        code: "TOPIX-17",
        priceBasis: "unadjusted" as const,
        source: "synthetic_fixture",
        providerPlan: "synthetic" as const,
      },
    },
  ];
  assert.deepEqual(validateEventStudyPriceAlignment(
    inputs,
    "2026-01-01T00:00:00+09:00",
  ), []);
  assert.ok(validateEventStudyPriceAlignment(
    inputs.slice(0, 2),
    "2026-01-01T00:00:00+09:00",
  ).some((issue) => issue.code === "missing_required_series"));
  console.log("price-store-hardening: issuer/TOPIX/sector alignment gate OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "pit-price-hardening-"));
  const path = join(dir, "prices.jsonl");
  try {
    const first = record();
    appendPriceRecordsWithLock(path, [first], schema, { ownerToken: "test-owner", now: NOW });
    assert.equal(readPriceJsonl(path).length, 1);

    mkdirSync(`${path}.lock`);
    assert.throws(
      () => appendPriceRecordsWithLock(path, [record()], schema, {
        ownerToken: "second-owner",
        now: NOW,
      }),
      /lock is already held/,
    );
    rmSync(`${path}.lock`, { recursive: true, force: true });

    const partialPath = join(dir, "partial.jsonl");
    writeFileSync(partialPath, JSON.stringify(record()), "utf-8");
    assert.throws(
      () => appendPriceRecordsWithLock(partialPath, [record()], schema, {
        ownerToken: "partial-owner",
        now: NOW,
      }),
      /partial_jsonl_tail/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("price-store-hardening: single-writer/partial-tail guard OK");
}

console.log("price-store-hardening: 全テスト成功");
