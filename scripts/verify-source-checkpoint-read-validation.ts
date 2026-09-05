import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getSourceCheckpoint } from "../src/market-events/source-checkpoint-store.js";

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
} finally {
  db.close();
}

console.log("source-checkpoint-read-validation: ok");
