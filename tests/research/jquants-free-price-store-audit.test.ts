import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditJQuantsFreePriceStore,
  summarizeJQuantsFreePriceStoreAudit,
} from "../../src/research/jquants-free-price-store-audit.js";
import {
  withPriceRecordHash,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

function recordInput(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecordInput {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code: "8136",
    market: "TSE",
    tradingDate: "2026-05-14",
    dataAsOf: "2026-05-14T15:30:00+09:00",
    observedAt: "2026-08-06T23:59:59+09:00",
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T12:00:00+09:00",
    source: "jquants",
    sourceVersion: "audit-fixture-v1",
    providerPlan: "free",
    delayDays: 84,
    isDelayed: true,
    ingestionRunId: "jquants-audit-fixture",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 7200, high: 7350, low: 7150, close: 7300, volume: 1234500 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    license: "local_only",
    ...overrides,
  };
}

{
  const traded = withPriceRecordHash(recordInput());
  const missing = withPriceRecordHash(recordInput({
    tradingDate: "2026-05-15",
    dataAsOf: "2026-05-15T15:30:00+09:00",
    observedAt: "2026-08-07T23:59:59+09:00",
    retrievedAt: "2026-08-08T15:01:00.000Z",
    firstExecutableAt: "2026-08-10T09:00:00+09:00",
    ingestionRunId: "jquants-audit-fixture-missing",
    status: "missing",
    missingReason: "unknown",
    ohlcv: undefined,
  }));
  const report = summarizeJQuantsFreePriceStoreAudit({
    records: [traded, missing],
    issues: [],
    fileCount: 1,
  });
  assert.equal(report.status, "ok");
  assert.equal(report.recordCount, 2);
  assert.equal(report.statusCounts.traded, 1);
  assert.equal(report.statusCounts.missing, 1);
  assert.equal(report.unknownMissingCount, 1);
  assert.equal(report.series[0]?.recordCount, 2);
  assert.equal(report.rawValuesIncluded, false);
  assert.equal(report.rawLinesIncluded, false);
  assert.equal(report.absolutePathsIncluded, false);
  assert.equal(report.automaticTradingAuthorized, false);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("7300"), false);
  assert.equal(serialized.includes("1234500"), false);
  assert.equal(serialized.includes(traded.contentHash), false);
  console.log("jquants-free-price-store-audit: metadata summary redacts raw values and hashes OK");
}

{
  const root = join(mkdtempSync(join(tmpdir(), "alpha-pon-jquants-audit-valid-")), "jquants-free");
  mkdirSync(root, { recursive: true });
  const record = withPriceRecordHash(recordInput());
  writeFileSync(join(root, "8136.jsonl"), `${JSON.stringify(record)}\n`);
  writeFileSync(join(root, "README.txt"), "ignored metadata helper\n");
  const report = auditJQuantsFreePriceStore({
    root,
    schema,
    now: new Date("2026-08-08T12:00:00.000Z"),
  });
  assert.equal(report.status, "ok");
  assert.equal(report.fileCount, 1);
  assert.equal(report.recordCount, 1);
  assert.equal(report.ignoredEntryCount, 1);
  assert.deepEqual(report.filesystemIssueCounts, {});
  console.log("jquants-free-price-store-audit: valid local JSONL audits without raw-value output OK");
}

{
  const missingRoot = join(tmpdir(), `alpha-pon-jquants-audit-missing-${Date.now()}`);
  const report = auditJQuantsFreePriceStore({ root: missingRoot, schema });
  assert.equal(report.status, "no_local_price_files");
  assert.equal(report.fileCount, 0);
  assert.equal(report.errorCount, 0);
  console.log("jquants-free-price-store-audit: missing local store is nonfatal OK");
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-jquants-audit-hardlink-"));
  const root = join(sandbox, "jquants-free");
  const outside = join(sandbox, "outside.jsonl");
  mkdirSync(root);
  writeFileSync(outside, "licensed-raw-line-that-must-not-be-read\n");
  linkSync(outside, join(root, "8136.jsonl"));
  const report = auditJQuantsFreePriceStore({ root, schema });
  assert.equal(report.status, "issues_found");
  assert.equal(report.filesystemIssueCounts.hard_linked_price_file, 1);
  assert.equal(report.recordCount, 0);
  assert.equal(JSON.stringify(report).includes("licensed-raw-line"), false);
  console.log("jquants-free-price-store-audit: hard-linked file rejects before read OK");
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-jquants-audit-symlink-"));
  const root = join(sandbox, "jquants-free");
  const outside = join(sandbox, "outside.jsonl");
  mkdirSync(root);
  writeFileSync(outside, "licensed-raw-line-that-must-not-be-read\n");
  symlinkSync(outside, join(root, "8136.jsonl"));
  const report = auditJQuantsFreePriceStore({ root, schema });
  assert.equal(report.status, "issues_found");
  assert.equal(report.filesystemIssueCounts.unsafe_price_file, 1);
  assert.equal(report.recordCount, 0);
  console.log("jquants-free-price-store-audit: symlink file rejects before read OK");
}

console.log("jquants-free-price-store-audit.test.ts passed");
