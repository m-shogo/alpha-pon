import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  getSourceCheckpoint,
  upsertSourceCheckpoint,
  type SourceCheckpoint,
} from "../src/market-events/source-checkpoint-store.js";

const db = new DatabaseSync(":memory:");
try {
  db.exec(readFileSync("migrations/0001_market_event_foundation.sql", "utf8"));

  const successful: SourceCheckpoint = {
    sourceKey: "jpx:tdnet:failure-replay",
    sourceType: "TDNET",
    cursorValue: null,
    etag: null,
    lastModified: null,
    lastContentHash: "a".repeat(64),
    lastCheckedAt: "2026-09-07T00:00:00Z",
    lastSuccessAt: "2026-09-07T00:00:00Z",
    consecutiveFailures: 0,
    nextCheckAt: null,
    lastError: null,
  };
  assert.equal(upsertSourceCheckpoint(db, successful), "inserted");

  const twoFailures: SourceCheckpoint = {
    ...successful,
    lastCheckedAt: "2026-09-07T00:10:00Z",
    consecutiveFailures: 2,
    lastError: "second failure",
  };
  assert.equal(upsertSourceCheckpoint(db, twoFailures), "updated");

  const staleFailureReplay: SourceCheckpoint = {
    ...successful,
    lastCheckedAt: "2026-09-07T00:11:00Z",
    consecutiveFailures: 1,
    lastError: "stale concurrent failure",
  };
  assert.throws(
    () => upsertSourceCheckpoint(db, staleFailureReplay),
    /cannot regress consecutiveFailures without a newer success/,
    "a later write built from stale state must not erase part of an existing failure streak",
  );
  assert.deepEqual(getSourceCheckpoint(db, successful.sourceKey), twoFailures);

  const recovered: SourceCheckpoint = {
    ...twoFailures,
    lastCheckedAt: "2026-09-07T00:12:00Z",
    lastSuccessAt: "2026-09-07T00:12:00Z",
    consecutiveFailures: 0,
    lastError: null,
  };
  assert.equal(
    upsertSourceCheckpoint(db, recovered),
    "updated",
    "a genuine newer successful check may reset the failure streak",
  );
  assert.deepEqual(getSourceCheckpoint(db, successful.sourceKey), recovered);
} finally {
  db.close();
}

console.log("source-checkpoint-failure-replay: ok");
