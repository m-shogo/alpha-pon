import { createHash } from "node:crypto";
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
  const stalePointers = db.prepare(`
    SELECT
      e.event_id AS eventId,
      e.current_revision_id AS currentRevisionId,
      latest.revision_id AS latestRevisionId
    FROM market_events e
    JOIN event_revisions current
      ON current.revision_id = e.current_revision_id
      AND current.event_id = e.event_id
    JOIN event_revisions latest
      ON latest.event_id = e.event_id
    WHERE latest.revision_number = (
      SELECT MAX(candidate.revision_number)
      FROM event_revisions candidate
      WHERE candidate.event_id = e.event_id
    )
      AND current.revision_id != latest.revision_id
    ORDER BY e.event_id
  `).all() as Array<{
    eventId: string;
    currentRevisionId: string;
    latestRevisionId: string;
  }>;

  if (stalePointers.length > 0) {
    throw new Error(`D1 bootstrap requires current_revision_id to reference the latest revision: ${JSON.stringify(stalePointers)}`);
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
