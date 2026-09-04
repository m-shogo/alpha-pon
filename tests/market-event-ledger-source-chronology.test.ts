import assert from "node:assert/strict";
import { validateLedgerRecord } from "../src/market-events/local-ledger.js";

const baseRecord = {
  recordType: "EVENT_SOURCE" as const,
  recordedAt: "2026-08-28T10:30:00Z",
  payload: {
    schemaVersion: 1 as const,
    sourceId: "src_fixture",
    eventId: "evt_fixture",
    authority: "FIXTURE",
    sourceType: "OTHER" as const,
    url: "https://example.com/fixture",
    title: "Fixture source",
    publishedAt: "2026-08-28T10:00:00Z",
    retrievedAt: "2026-08-28T09:00:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY" as const,
    objectKey: null,
  },
};

assert.throws(
  () => validateLedgerRecord(baseRecord),
  /publishedAt must be on or before retrievedAt/,
  "read-only ledger validation must reject a source retrieved before publication",
);

assert.throws(
  () => validateLedgerRecord({
    ...baseRecord,
    payload: {
      ...baseRecord.payload,
      publishedAt: "not-a-timestamp",
    },
  }),
  /publishedAt must be a strict ISO timestamp/,
  "read-only ledger validation must reject malformed source publication timestamps",
);

assert.throws(
  () => validateLedgerRecord({
    ...baseRecord,
    payload: {
      ...baseRecord.payload,
      publishedAt: "2026-08-28T08:00:00Z",
      contentHash: "fixture-content-hash",
    },
  }),
  /source contentHash must be a lowercase SHA-256 hash/,
  "read-only ledger validation must reject invalid source content hashes",
);

assert.throws(
  () => validateLedgerRecord({
    ...baseRecord,
    payload: {
      ...baseRecord.payload,
      sourceType: "UNRECOGNIZED_SOURCE" as never,
      publishedAt: "2026-08-28T08:00:00Z",
    },
  }),
  /Unknown source type: UNRECOGNIZED_SOURCE/,
  "read-only ledger validation must reject unknown source types",
);

assert.throws(
  () => validateLedgerRecord({
    ...baseRecord,
    payload: {
      ...baseRecord.payload,
      storageClass: "UNRECOGNIZED_STORAGE" as never,
      publishedAt: "2026-08-28T08:00:00Z",
    },
  }),
  /Unknown storage class: UNRECOGNIZED_STORAGE/,
  "read-only ledger validation must reject unknown storage classes",
);

console.log("market event ledger source chronology: fail-closed OK");
