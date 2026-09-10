import assert from "node:assert/strict";
import { buildSourceId } from "../src/market-events/contracts.js";
import { validateLedgerRecord } from "../src/market-events/local-ledger.js";

const VALID_CONTENT_HASH = "a".repeat(64);

// sourceId が正準値でないと source identity 検査が先に発火し、
// ここで確かめたい各検査に到達しない。
// buildSourceId は authority / url / publishedAt / contentHash を使うため、
// ケースごとに正準 ID を計算し直す。
function sourceRecord(overrides: Record<string, unknown> = {}) {
  const payload = {
    schemaVersion: 1 as const,
    eventId: "evt_fixture",
    authority: "FIXTURE",
    sourceType: "OTHER" as const,
    url: "https://example.com/fixture",
    title: "Fixture source",
    publishedAt: "2026-08-28T10:00:00Z" as string | null,
    retrievedAt: "2026-08-28T09:00:00Z",
    contentHash: VALID_CONTENT_HASH,
    storageClass: "METADATA_ONLY" as const,
    objectKey: null,
    ...overrides,
  };
  return {
    recordType: "EVENT_SOURCE" as const,
    recordedAt: "2026-08-28T10:30:00Z",
    payload: {
      ...payload,
      sourceId: buildSourceId({
        authority: payload.authority as string,
        url: payload.url as string,
        publishedAt: payload.publishedAt as string | null,
        contentHash: payload.contentHash as string,
      }),
    },
  };
}

assert.throws(
  () => validateLedgerRecord(sourceRecord()),
  /publishedAt must be on or before retrievedAt/,
  "read-only ledger validation must reject a source retrieved before publication",
);

assert.throws(
  () => validateLedgerRecord(sourceRecord({ publishedAt: "not-a-timestamp" })),
  /publishedAt must be a strict ISO timestamp/,
  "read-only ledger validation must reject malformed source publication timestamps",
);

assert.throws(
  () => validateLedgerRecord(sourceRecord({
    publishedAt: "2026-08-28T08:00:00Z",
    contentHash: "fixture-content-hash",
  })),
  /source contentHash must be a lowercase SHA-256 hash/,
  "read-only ledger validation must reject invalid source content hashes",
);

assert.throws(
  () => validateLedgerRecord(sourceRecord({
    sourceType: "UNRECOGNIZED_SOURCE",
    publishedAt: "2026-08-28T08:00:00Z",
  })),
  /Unknown source type: UNRECOGNIZED_SOURCE/,
  "read-only ledger validation must reject unknown source types",
);

assert.throws(
  () => validateLedgerRecord(sourceRecord({
    storageClass: "UNRECOGNIZED_STORAGE",
    publishedAt: "2026-08-28T08:00:00Z",
  })),
  /Unknown storage class: UNRECOGNIZED_STORAGE/,
  "read-only ledger validation must reject unknown storage classes",
);

console.log("market event ledger source chronology: fail-closed OK");
