import { createHash } from "node:crypto";
import { compareExplicitIso8601Instants } from "../research/iso-instant.js";
import { assertIsoTimestamp, assertValidEventTime } from "./contracts.js";
import type { MarketEventDatabase } from "./sqlite-store.js";

export type D1BootstrapExport = {
  sql: string;
  sha256: string;
  rowCounts: Record<string, number>;
};

const TABLE_ORDER = [
  "market_events",
  "event_sources",
  "event_revisions",
  "decision_snapshots",
  "delivery_outbox",
  "alert_deliveries",
  "calendar_sync_state",
  "source_checkpoints",
  "review_tasks",
] as const;

const TABLE_ROW_ORDER: Record<(typeof TABLE_ORDER)[number], string> = {
  market_events: "event_id",
  event_sources: "event_id, source_id",
  event_revisions: "event_id, revision_number, revision_id",
  decision_snapshots: "event_id, created_at, decision_snapshot_id",
  delivery_outbox: "event_id, scheduled_at, delivery_id",
  alert_deliveries: "delivery_id",
  calendar_sync_state: "event_id, calendar_provider, calendar_id",
  source_checkpoints: "source_key",
  review_tasks: "event_id, due_at, review_task_id",
};

const SCHEMA_VERSION_TABLES = [
  { table: "market_events", id: "event_id" },
  { table: "event_revisions", id: "revision_id" },
  { table: "event_sources", id: "source_id" },
  { table: "decision_snapshots", id: "decision_snapshot_id" },
  { table: "delivery_outbox", id: "delivery_id" },
] as const;

type SqlValue = string | number | bigint | Uint8Array | null;

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteValue(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("D1 bootstrap cannot encode non-finite numbers");
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  return `'${value.replace(/'/g, "''")}'`;
}

function tableColumns(db: MarketEventDatabase, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>;
  if (!rows.length) throw new Error(`Missing table for D1 bootstrap: ${table}`);
  return rows.map(row => row.name);
}

function tableRows(
  db: MarketEventDatabase,
  table: (typeof TABLE_ORDER)[number],
  columns: string[],
): Record<string, SqlValue>[] {
  const select = columns.map(quoteIdentifier).join(", ");
  return db.prepare(
    `SELECT ${select} FROM ${quoteIdentifier(table)} ORDER BY ${TABLE_ROW_ORDER[table]}`,
  ).all() as Record<string, SqlValue>[];
}

function assertSupportedSchemaVersions(db: MarketEventDatabase): void {
  const unsupported: Array<{ table: string; id: string; schemaVersion: number }> = [];
  for (const check of SCHEMA_VERSION_TABLES) {
    const rows = db.prepare(`
      SELECT ${check.id} AS id, schema_version AS schemaVersion
      FROM ${check.table}
      WHERE schema_version != 1
      ORDER BY ${check.id}
    `).all() as Array<{ id: string; schemaVersion: number }>;
    unsupported.push(...rows.map(row => ({ table: check.table, ...row })));
  }
  if (unsupported.length > 0) {
    throw new Error(`D1 bootstrap rejects unsupported persisted schema versions: ${JSON.stringify(unsupported)}`);
  }
}

function assertCurrentRevisionPointersAreLatest(db: MarketEventDatabase): void {
  const invalidPointers = db.prepare(`
    SELECT
      e.event_id AS eventId,
      e.current_revision_id AS currentRevisionId,
      current.event_id AS currentRevisionEventId,
      current.revision_number AS currentRevisionNumber,
      latest.latest_revision_number AS latestRevisionNumber
    FROM market_events e
    LEFT JOIN event_revisions current
      ON current.revision_id = e.current_revision_id
    LEFT JOIN (
      SELECT event_id, MAX(revision_number) AS latest_revision_number
      FROM event_revisions
      GROUP BY event_id
    ) latest
      ON latest.event_id = e.event_id
    WHERE
      (e.current_revision_id IS NULL AND latest.latest_revision_number IS NOT NULL)
      OR (
        e.current_revision_id IS NOT NULL
        AND (
          current.revision_id IS NULL
          OR current.event_id != e.event_id
          OR latest.latest_revision_number IS NULL
          OR current.revision_number != latest.latest_revision_number
        )
      )
    ORDER BY e.event_id
  `).all() as Array<{
    eventId: string;
    currentRevisionId: string | null;
    currentRevisionEventId: string | null;
    currentRevisionNumber: number | null;
    latestRevisionNumber: number | null;
  }>;

  if (invalidPointers.length > 0) {
    throw new Error(`D1 bootstrap requires current_revision_id to reference the latest revision for the same event: ${JSON.stringify(invalidPointers)}`);
  }
}

function assertPersistedEventTimesAreValid(db: MarketEventDatabase): void {
  const rows = db.prepare(`
    SELECT
      event_id AS eventId,
      start_at AS startAt,
      end_at AS endAt,
      all_day AS allDay,
      timezone,
      time_precision AS precision,
      window_start AS windowStart,
      window_end AS windowEnd
    FROM market_events
    ORDER BY event_id
  `).all() as Array<{
    eventId: string;
    startAt: string | null;
    endAt: string | null;
    allDay: number;
    timezone: string;
    precision: "EXACT" | "DATE_ONLY" | "WINDOW" | "UNKNOWN";
    windowStart: string | null;
    windowEnd: string | null;
  }>;

  for (const row of rows) {
    try {
      if (row.allDay !== 0 && row.allDay !== 1) {
        throw new Error(`all_day must be stored as 0 or 1, got ${row.allDay}`);
      }
      assertValidEventTime({
        startAt: row.startAt,
        endAt: row.endAt,
        allDay: row.allDay === 1,
        timezone: row.timezone,
        precision: row.precision,
        windowStart: row.windowStart,
        windowEnd: row.windowEnd,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1 bootstrap rejects invalid persisted EventTime for ${row.eventId}: ${message}`);
    }
  }
}

function assertPersistedSourceProvenanceIsValid(db: MarketEventDatabase): void {
  const rows = db.prepare(`
    SELECT
      source_id AS sourceId,
      event_id AS eventId,
      url,
      published_at AS publishedAt,
      retrieved_at AS retrievedAt,
      content_hash AS contentHash
    FROM event_sources
    ORDER BY event_id, source_id
  `).all() as Array<{
    sourceId: string;
    eventId: string;
    url: string;
    publishedAt: string | null;
    retrievedAt: string;
    contentHash: string;
  }>;

  for (const row of rows) {
    try {
      if (!row.sourceId.startsWith("src_")) throw new Error("source_id must start with src_");
      if (!row.eventId.startsWith("evt_")) throw new Error("event_id must start with evt_");
      let sourceUrl: URL;
      try {
        sourceUrl = new URL(row.url);
      } catch {
        throw new Error("url must be a valid absolute URL");
      }
      if (sourceUrl.protocol !== "https:") throw new Error("url must use https");
      if (sourceUrl.hash !== "") {
        throw new Error("url must not contain a fragment because source identity ignores URL fragments");
      }
      if (!/^[a-f0-9]{64}$/.test(row.contentHash)) {
        throw new Error("content_hash must be a lowercase SHA-256 hash");
      }
      assertIsoTimestamp(row.retrievedAt, `event source ${row.sourceId} retrievedAt`);
      if (row.publishedAt !== null) {
        assertIsoTimestamp(row.publishedAt, `event source ${row.sourceId} publishedAt`);
        if (
          compareExplicitIso8601Instants(
            row.publishedAt,
            row.retrievedAt,
            `event source ${row.sourceId} publishedAt`,
            `event source ${row.sourceId} retrievedAt`,
          ) > 0
        ) {
          throw new Error("published_at must be on or before retrieved_at");
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`D1 bootstrap rejects invalid persisted source provenance for ${row.sourceId}: ${message}`);
    }
  }
}

export function buildD1BootstrapExport(
  db: MarketEventDatabase,
  options: { generatedAt?: string; sourceDatabase?: string } = {},
): D1BootstrapExport {
  void options.generatedAt;
  void options.sourceDatabase;
  assertSupportedSchemaVersions(db);
  assertCurrentRevisionPointersAreLatest(db);
  assertPersistedEventTimesAreValid(db);
  assertPersistedSourceProvenanceIsValid(db);
  const rowCounts: Record<string, number> = {};
  const lines: string[] = ["PRAGMA foreign_keys = ON;"];

  for (const table of TABLE_ORDER) {
    const columns = tableColumns(db, table);
    const rows = tableRows(db, table, columns);
    rowCounts[table] = rows.length;
    if (!rows.length) continue;
    const columnSql = columns.map(quoteIdentifier).join(", ");
    for (const row of rows) {
      const values = columns.map(column => quoteValue(row[column] ?? null)).join(", ");
      lines.push(`INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${values});`);
    }
  }

  lines.push("");
  const sql = lines.join("\n");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  return { sql, sha256, rowCounts };
}
