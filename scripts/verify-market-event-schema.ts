import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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
