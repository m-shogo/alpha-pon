import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  getSourceCheckpoint,
  upsertSourceCheckpoint,
  type SourceCheckpoint,
} from "../src/market-events/source-checkpoint-store.js";
import { collectTdnetSourceOnce } from "../src/market-events/tdnet-source-collector.js";

const db = new DatabaseSync(":memory:");
const migration = readFileSync("migrations/0001_market_event_foundation.sql", "utf8");

try {
  db.exec(migration);

  const checkpoint: SourceCheckpoint = {
    sourceKey: "jpx:tdnet:market-events",
    sourceType: "TDNET",
    cursorValue: null,
    etag: null,
    lastModified: null,
    lastContentHash: "a".repeat(64),
    lastCheckedAt: "2026-09-04T01:00:00Z",
    lastSuccessAt: "2026-09-04T01:00:00Z",
    consecutiveFailures: 0,
    nextCheckAt: null,
    lastError: null,
  };

  assert.equal(upsertSourceCheckpoint(db, checkpoint), "inserted");
  assert.deepEqual(getSourceCheckpoint(db, checkpoint.sourceKey), checkpoint);

  assert.throws(
    () => getSourceCheckpoint(db, ` ${checkpoint.sourceKey}`),
    /sourceKey must be canonical without surrounding whitespace/,
    "lookup must not silently alias a noncanonical source key to the canonical checkpoint",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, { ...checkpoint, sourceKey: `${checkpoint.sourceKey} ` }),
    /sourceKey must be canonical without surrounding whitespace/,
    "writes must preserve source checkpoint identity exactly",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, { ...checkpoint, sourceType: " TDNET" }),
    /sourceType must be canonical without surrounding whitespace/,
    "source type provenance must not be normalized before persistence",
  );

  let fetchCalls = 0;
  await assert.rejects(
    () => collectTdnetSourceOnce(db, {
      sourceKey: ` ${checkpoint.sourceKey}`,
      now: () => "2026-09-04T01:05:00Z",
      fetchDisclosures: async () => {
        fetchCalls += 1;
        return [];
      },
    }),
    /sourceKey must be canonical without surrounding whitespace/,
    "collector must reject noncanonical checkpoint identity before any source fetch",
  );
  assert.equal(fetchCalls, 0, "invalid checkpoint identity must not trigger TDnet I/O");

  assert.deepEqual(
    getSourceCheckpoint(db, checkpoint.sourceKey),
    checkpoint,
    "rejected aliases must not mutate the canonical checkpoint",
  );

  console.log("source-checkpoint-canonical-identity: ok");
} finally {
  db.close();
}
