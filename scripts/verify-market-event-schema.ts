import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migrationPath = "migrations/0001_market_event_foundation.sql";
const sql = readFileSync(migrationPath, "utf8");
const db = new DatabaseSync(":memory:");

try {
  db.exec(sql);

  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );

  for (const table of [
    "market_events",
    "event_revisions",
    "event_sources",
    "decision_snapshots",
    "delivery_outbox",
    "alert_deliveries",
    "calendar_sync_state",
    "source_checkpoints",
  ]) {
    assert(tables.has(table), `missing table: ${table}`);
  }

  db.prepare(`
    INSERT INTO market_events (
      event_id, schema_version, issuer_code, issuer_name, event_type, title,
      status, priority, start_at, end_at, all_day, timezone, time_precision,
      window_start, window_end, current_decision_state, created_at, updated_at
    ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 'Asia/Tokyo', 'EXACT', NULL, NULL, ?, ?, ?)
  `).run(
    "evt_0123456789abcdef01234567",
    "8136",
    "サンリオ",
    "EARNINGS_RELEASE",
    "FY2026 Q1 決算発表",
    "SCHEDULED",
    "S1",
    "2026-08-10T15:00:00+09:00",
    "WAIT",
    "2026-08-03T05:00:00Z",
    "2026-08-03T05:00:00Z",
  );

  db.prepare(`
    INSERT INTO event_revisions (
      revision_id, event_id, schema_version, revision_number, observed_at,
      change_type, facts_json, source_ids_json
    ) VALUES (?, ?, 1, 1, ?, 'CREATED', '{}', '[]')
  `).run(
    "rev_0123456789abcdef01234567",
    "evt_0123456789abcdef01234567",
    "2026-08-03T05:00:00Z",
  );

  db.prepare(`
    INSERT INTO delivery_outbox (
      delivery_id, event_id, revision_id, channel, state, payload_json,
      scheduled_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'GOOGLE_CALENDAR', 'PENDING', '{}', ?, ?, ?)
  `).run(
    "dlv_0123456789abcdef01234567",
    "evt_0123456789abcdef01234567",
    "rev_0123456789abcdef01234567",
    "2026-08-03T06:00:00Z",
    "2026-08-03T05:00:00Z",
    "2026-08-03T05:00:00Z",
  );

  assert.throws(
    () =>
      db.prepare(`
        INSERT INTO market_events (
          event_id, schema_version, issuer_name, event_type, title, status,
          priority, start_at, all_day, timezone, time_precision,
          current_decision_state, created_at, updated_at
        ) VALUES (?, 1, 'Test', 'OTHER', 'Unknown date', 'UNKNOWN_DATE',
          'S3', ?, 0, 'Asia/Tokyo', 'UNKNOWN', 'INFO', ?, ?)
      `).run(
        "evt_abcdefabcdefabcdefabcdef",
        "2026-08-10T00:00:00+09:00",
        "2026-08-03T05:00:00Z",
        "2026-08-03T05:00:00Z",
      ),
    /constraint/i,
    "UNKNOWN precision must reject invented dates",
  );

  console.log("market-event-schema: ok");
} finally {
  db.close();
}
