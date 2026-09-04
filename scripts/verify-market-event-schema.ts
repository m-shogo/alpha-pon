import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  getSourceCheckpoint,
  upsertSourceCheckpoint,
  type SourceCheckpoint,
} from "../src/market-events/source-checkpoint-store.js";

const migrationPath = "migrations/0001_market_event_foundation.sql";
const sql = readFileSync(migrationPath, "utf8");
const db = new DatabaseSync(":memory:");

try {
  db.exec(sql);

  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(row => row.name),
  );

  for (const table of [
    "schema_migrations",
    "market_events",
    "event_revisions",
    "event_sources",
    "decision_snapshots",
    "delivery_outbox",
    "alert_deliveries",
    "calendar_sync_state",
    "source_checkpoints",
    "review_tasks",
  ]) {
    assert(tables.has(table), `missing table: ${table}`);
  }

  const checkpoint: SourceCheckpoint = {
    sourceKey: "jpx:tdnet",
    sourceType: "JPX_TDNET",
    cursorValue: "2026-09-04T00:00:00Z",
    etag: "\"tdnet-v1\"",
    lastModified: "Fri, 04 Sep 2026 00:00:00 GMT",
    lastContentHash: "a".repeat(64),
    lastCheckedAt: "2026-09-04T00:10:00Z",
    lastSuccessAt: "2026-09-04T00:10:00Z",
    consecutiveFailures: 0,
    nextCheckAt: "2026-09-04T01:10:00Z",
    lastError: null,
  };

  assert.equal(upsertSourceCheckpoint(db, checkpoint), "inserted");
  assert.deepEqual(getSourceCheckpoint(db, checkpoint.sourceKey), checkpoint);
  assert.equal(upsertSourceCheckpoint(db, checkpoint), "unchanged");

  const failedCheckpoint: SourceCheckpoint = {
    ...checkpoint,
    lastCheckedAt: "2026-09-04T00:20:00Z",
    consecutiveFailures: 1,
    nextCheckAt: "2026-09-04T01:20:00Z",
    lastError: "http 503",
  };
  assert.equal(upsertSourceCheckpoint(db, failedCheckpoint), "updated");
  assert.deepEqual(getSourceCheckpoint(db, checkpoint.sourceKey), failedCheckpoint);

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      lastCheckedAt: "2026-09-04T00:15:00Z",
      nextCheckAt: "2026-09-04T01:15:00Z",
    }),
    /cannot move backwards/,
    "older collector runs must not roll back a newer checkpoint",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      cursorValue: "different-cursor-at-same-check-time",
    }),
    /collision/,
    "same checked instant with different state must fail closed",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      lastCheckedAt: "2026-09-04T00:30:00Z",
      lastSuccessAt: null,
      nextCheckAt: "2026-09-04T01:30:00Z",
    }),
    /cannot forget lastSuccessAt/,
    "later failures must preserve the most recent successful checkpoint time",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      lastCheckedAt: "2026-09-04T00:30:00Z",
      lastSuccessAt: "2026-09-04T00:05:00Z",
      nextCheckAt: "2026-09-04T01:30:00Z",
    }),
    /cannot regress lastSuccessAt/,
    "a newer collector run must not regress last successful source time",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      lastCheckedAt: "2026-09-04T00:30:00",
      nextCheckAt: "2026-09-04T01:30:00Z",
    }),
    /explicit timezone/,
    "checkpoint instants must include an explicit timezone",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      lastCheckedAt: "2026-09-04T00:30:00Z",
      nextCheckAt: "2026-09-04T00:29:59Z",
    }),
    /nextCheckAt must be on or after lastCheckedAt/,
    "next source check must not be scheduled before the current check",
  );

  assert.throws(
    () => upsertSourceCheckpoint(db, {
      ...failedCheckpoint,
      sourceType: "EDINET",
      lastCheckedAt: "2026-09-04T00:30:00Z",
      nextCheckAt: "2026-09-04T01:30:00Z",
    }),
    /sourceType cannot change/,
    "a source key must not silently change source type",
  );

  const eventId = "evt_0123456789abcdef01234567";
  const revisionId = "rev_0123456789abcdef01234567";
  db.prepare(`
    INSERT INTO market_events (
      event_id, schema_version, occurrence_key, issuer_code, issuer_name,
      event_type, title, status, priority, start_at, end_at, all_day,
      timezone, time_precision, window_start, window_end, edge_types_json,
      current_decision_state, why_it_matters, checks_before_json,
      checks_after_json, related_event_ids_json, current_revision_id,
      last_verified_at, stale_after, created_at, updated_at
    ) VALUES (
      ?, 1, 'fy2026-q1', ?, ?, ?, ?, ?, ?, ?, NULL, 0,
      'Asia/Tokyo', 'EXACT', NULL, NULL, '[]', ?, '', '[]', '[]', '[]', ?, ?, NULL, ?, ?
    )
  `).run(
    eventId,
    "8136",
    "サンリオ",
    "EARNINGS_RELEASE",
    "FY2026 Q1 決算発表",
    "SCHEDULED",
    "S1",
    "2026-08-10T15:00:00+09:00",
    "WAIT",
    revisionId,
    "2026-08-03T05:00:00Z",
    "2026-08-03T05:00:00Z",
    "2026-08-03T05:00:00Z",
  );

  db.prepare(`
    INSERT INTO event_revisions (
      revision_id, event_id, schema_version, revision_number, observed_at,
      change_type, facts_json, source_ids_json
    ) VALUES (?, ?, 1, 1, ?, 'CREATED', '{}', '[]')
  `).run(revisionId, eventId, "2026-08-03T05:00:00Z");

  db.prepare(`
    INSERT INTO delivery_outbox (
      delivery_id, delivery_key, event_id, revision_id, schema_version,
      channel, state, payload_json, scheduled_at, created_at, updated_at
    ) VALUES (?, 'day-before', ?, ?, 1, 'IN_APP', 'PENDING', '{}', ?, ?, ?)
  `).run(
    "dlv_0123456789abcdef01234567",
    eventId,
    revisionId,
    "2026-08-09T06:00:00Z",
    "2026-08-03T05:00:00Z",
    "2026-08-03T05:00:00Z",
  );

  assert.throws(
    () => db.prepare(`
      INSERT INTO market_events (
        event_id, schema_version, occurrence_key, issuer_name, event_type,
        title, status, priority, start_at, all_day, timezone, time_precision,
        current_decision_state, last_verified_at, created_at, updated_at
      ) VALUES (?, 1, 'unknown-date', 'Test', 'OTHER', 'Unknown date',
        'UNKNOWN_DATE', 'S3', ?, 0, 'Asia/Tokyo', 'UNKNOWN', 'INFO', ?, ?, ?)
    `).run(
      "evt_abcdefabcdefabcdefabcdef",
      "2026-08-10T00:00:00+09:00",
      "2026-08-03T05:00:00Z",
      "2026-08-03T05:00:00Z",
      "2026-08-03T05:00:00Z",
    ),
    /constraint/i,
    "UNKNOWN precision must reject invented dates",
  );

  assert.throws(
    () => db.prepare(`
      INSERT INTO delivery_outbox (
        delivery_id, delivery_key, event_id, revision_id, schema_version,
        channel, state, payload_json, scheduled_at, created_at, updated_at
      ) VALUES (?, 'day-before', ?, ?, 1, 'IN_APP', 'PENDING', '{}', ?, ?, ?)
    `).run(
      "dlv_abcdefabcdefabcdefabcdef",
      eventId,
      revisionId,
      "2026-08-09T06:00:00Z",
      "2026-08-03T05:00:00Z",
      "2026-08-03T05:00:00Z",
    ),
    /unique|constraint/i,
    "same delivery purpose and schedule must not be duplicated",
  );

  const migration = db.prepare("SELECT version FROM schema_migrations").get() as { version: string };
  assert.equal(migration.version, "0001_market_event_foundation");
  assert.equal((db.prepare("PRAGMA foreign_key_check").all() as unknown[]).length, 0);
  console.log("market-event-schema: ok");
} finally {
  db.close();
}
