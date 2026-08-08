import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectGovernedPriceRecordsForReplay } from "../../src/research/price-store-replay-guard.js";
import {
  withPriceRecordHash,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

const priceInput: PitPriceRecordInput = {
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
  sourceVersion: "replay-manifest-strict-instant-v1",
  providerPlan: "synthetic",
  delayDays: 0,
  isDelayed: false,
  ingestionRunId: "replay-manifest-strict-run",
  currency: "JPY",
  status: "traded",
  ohlcv: { open: 1000, high: 1030, low: 990, close: 1020, volume: 1_000_000 },
  adjusted: false,
  adjustmentFactor: 1,
  corporateActions: [],
  benchmarkCode: "TOPIX",
  license: "redistributable",
};

const record = withPriceRecordHash(priceInput);
const selector = {
  seriesKind: "security" as const,
  code: "TEST1",
  priceBasis: "unadjusted" as const,
  source: "synthetic_fixture",
  providerPlan: "synthetic" as const,
};

function select(cutoff: string) {
  return selectGovernedPriceRecordsForReplay(
    [record],
    cutoff,
    selector,
    {
      schema,
      now: new Date("2026-08-08T12:00:00+09:00"),
      manifest: {
        snapshotId: "snapshot:strict-instant",
        informationCutoff: cutoff,
        allowedIngestionRunIds: [record.ingestionRunId],
        allowedContentHashes: [record.contentHash],
      },
    },
  );
}

{
  const selected = select("2024-01-05T12:00:00+09:00");
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.contentHash, record.contentHash);
  console.log("price-store-replay-manifest-strict-instant: valid explicit cutoff passes OK");
}

for (const [cutoff, expected] of [
  ["2024-01-05T12:00:00", /explicit timezone/],
  ["2026-02-29T12:00:00Z", /valid Gregorian/],
  ["2026-08-04T24:00:00Z", /valid Gregorian/],
  ["2026-08-04T15:30:00+15:00", /timezone offset/],
] as const) {
  assert.throws(() => select(cutoff), expected, `invalid replay cutoff must reject: ${cutoff}`);
}
console.log("price-store-replay-manifest-strict-instant: implicit/rolled-over cutoffs reject OK");

console.log("price-store-replay-manifest-strict-instant.test.ts passed");
