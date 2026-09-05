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
try {
  db.exec(readFileSync("migrations/0001_market_event_foundation.sql", "utf8"));
  db.prepare(`
    INSERT INTO source_checkpoints (
      source_key, source_type, cursor_value, etag, last_modified,
      last_content_hash, last_checked_at, last_success_at,
      consecutive_failures, next_check_at, last_error
    ) VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL)
  `).run(
    "tdnet:corrupt-read",
    "JPX_TDNET",
    "2026-09-04T12:00:00",
    "2026-09-04T12:01:00Z",
    0,
    "2026-09-04T13:00:00Z",
  );

  assert.throws(
    () => getSourceCheckpoint(db, "tdnet:corrupt-read"),
    /explicit timezone/,
    "persisted checkpoint reads must fail closed on invalid chronology metadata",
  );

  db.prepare("UPDATE source_checkpoints SET last_checked_at = ?, last_success_at = ? WHERE source_key = ?").run(
    "2026-09-04T12:00:00Z",
    "2026-09-04T12:01:00Z",
    "tdnet:corrupt-read",
  );
  assert.throws(
    () => getSourceCheckpoint(db, "tdnet:corrupt-read"),
    /lastSuccessAt must be on or before lastCheckedAt/,
    "persisted checkpoint reads must fail closed on impossible success chronology",
  );

  db.prepare("UPDATE source_checkpoints SET last_success_at = ?, last_content_hash = ? WHERE source_key = ?").run(
    "2026-09-04T12:00:00Z",
    "not-a-sha256",
    "tdnet:corrupt-read",
  );
  assert.throws(
    () => getSourceCheckpoint(db, "tdnet:corrupt-read"),
    /lastContentHash must be a lowercase SHA-256 hash/,
    "persisted checkpoint reads must fail closed on invalid provenance hashes",
  );

  const checkpoint: SourceCheckpoint = {
    sourceKey: "jpx:tdnet:market-events",
    sourceType: "TDNET",
    cursorValue: null,
    etag: null,
    lastModified: null,
    lastContentHash: "a".repeat(64),
    lastCheckedAt: "2026-09-04T13:00:00Z",
    lastSuccessAt: "2026-09-04T13:00:00Z",
    consecutiveFailures: 0,
    nextCheckAt: null,
    lastError: null,
  };
  assert.equal(upsertSourceCheckpoint(db, checkpoint), "inserted");

  assert.throws(
    () => getSourceCheckpoint(db, ` ${checkpoint.sourceKey}`),
    /sourceKey must be canonical without surrounding whitespace/,
    "checkpoint lookup must not silently alias a malformed source identity",
  );
  assert.throws(
    () => upsertSourceCheckpoint(db, { ...checkpoint, sourceKey: `${checkpoint.sourceKey} ` }),
    /sourceKey must be canonical without surrounding whitespace/,
    "checkpoint writes must preserve sourceKey identity exactly",
  );
  assert.throws(
    () => upsertSourceCheckpoint(db, { ...checkpoint, sourceType: " TDNET" }),
    /sourceType must be canonical without surrounding whitespace/,
    "checkpoint writes must preserve sourceType provenance exactly",
  );

  let fetchCalls = 0;
  await assert.rejects(
    () => collectTdnetSourceOnce(db, {
      sourceKey: ` ${checkpoint.sourceKey}`,
      now: () => "2026-09-04T13:05:00Z",
      fetchDisclosures: async () => {
        fetchCalls += 1;
        return [];
      },
    }),
    /sourceKey must be canonical without surrounding whitespace/,
    "TDnet collection must reject malformed checkpoint identity before source I/O",
  );
  assert.equal(fetchCalls, 0);
  assert.deepEqual(getSourceCheckpoint(db, checkpoint.sourceKey), checkpoint);
} finally {
  db.close();
}

console.log("source-checkpoint-read-validation: ok");
