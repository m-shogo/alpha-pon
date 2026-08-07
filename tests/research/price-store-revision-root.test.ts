import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPriceRecords,
  validatePriceRecords,
  withPriceRecordHash,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

function baseRecord(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecordInput {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code: "8136",
    market: "TSE",
    tradingDate: "2026-05-14",
    dataAsOf: "2026-05-14T15:30:00+09:00",
    observedAt: "2026-08-06T23:59:59+09:00",
    retrievedAt: "2026-08-07T02:30:00.000Z",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
    source: "jquants",
    sourceVersion: "fixture-v1",
    providerPlan: "free",
    delayDays: 84,
    isDelayed: true,
    ingestionRunId: "revision-root-fixture",
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
  const validRoot = withPriceRecordHash(baseRecord());
  const errors = validatePriceRecords(
    [validRoot],
    schema,
    new Date("2026-08-07T12:00:00.000Z"),
  ).filter(issue => issue.severity === "error");
  assert.deepEqual(errors, []);
  console.log("price-store-revision-root: first immutable record without supersedesHash passes OK");
}

{
  const orphan = withPriceRecordHash(baseRecord({ supersedesHash: "f".repeat(64) }));
  const issues = validatePriceRecords(
    [orphan],
    schema,
    new Date("2026-08-07T12:00:00.000Z"),
  );
  assert.ok(issues.some(issue => issue.code === "orphan_supersedes_hash"));
  console.log("price-store-revision-root: orphan supersedesHash on series root is rejected OK");
}

{
  const root = withPriceRecordHash(baseRecord());
  const revision = withPriceRecordHash(baseRecord({
    observedAt: "2026-08-07T03:30:00.000Z",
    retrievedAt: "2026-08-07T03:31:00.000Z",
    firstExecutableAt: "2026-08-07T09:30:00+09:00",
    ingestionRunId: "revision-root-fixture-correction",
    supersedesHash: root.contentHash,
    ohlcv: { open: 7200, high: 7350, low: 7150, close: 7295, volume: 1234500 },
  }));
  const errors = validatePriceRecords(
    [root, revision],
    schema,
    new Date("2026-08-07T12:00:00.000Z"),
  ).filter(issue => issue.severity === "error");
  assert.deepEqual(errors, []);
  console.log("price-store-revision-root: valid root to exact previous-hash revision chain passes OK");
}

{
  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-price-revision-"));
  const path = join(sandbox, "prices", "8136.jsonl");
  const orphan = withPriceRecordHash(baseRecord({ supersedesHash: "e".repeat(64) }));
  assert.throws(() => appendPriceRecords(
    path,
    [orphan],
    schema,
    new Date("2026-08-07T12:00:00.000Z"),
  ), /orphan_supersedes_hash/);
  assert.equal(existsSync(path), false);
  console.log("price-store-revision-root: orphan revision is rejected before JSONL creation/append OK");
}

console.log("price-store-revision-root.test.ts passed");
