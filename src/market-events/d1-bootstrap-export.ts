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
  // previous_revision_id is a self-reference. Earlier revisions must be emitted first.
  event_revisions: "event_id, revision_number, revision_id",
  decision_snapshots: "event_id, created_at, decision_snapshot_id",
  delivery_outbox: "event_id, scheduled_at, delivery_id",
  alert_deliveries: "delivery_id",
  calendar_sync_state: "event_id, calendar_provider, calendar_id",
  source_checkpoints: "source_key",
  review_tasks: "event_id, due_at, review_task_id",
};

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
  const rows = db.prepare(
    `SELECT ${select} FROM ${quoteIdentifier(table)} ORDER BY ${TABLE_ROW_ORDER[table]}`,
  ).all() as Record<string, SqlValue>[];

  if (table !== "market_events") return rows;

  // A fresh D1 bootstrap stores the latest materialized event fields first but
  // leaves the current pointer empty. Ordered event_revisions then rebuild the
  // append-only chain and the database trigger promotes only the revision whose
  // observed_at reaches the projection updated_at. This avoids treating older
  // history as a stale runtime write.
  return rows.map(row => ({ ...row, current_revision_id: null }));
}

export function buildD1BootstrapExport(
  db: MarketEventDatabase,
  options: { generatedAt?: string; sourceDatabase?: string } = {},
): D1BootstrapExport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const rowCounts: Record<string, number> = {};
  const lines: string[] = [
    "-- Alpha Pon Market Event D1 bootstrap",
    `-- generated_at: ${generatedAt}`,
    `-- source_database: ${options.sourceDatabase ?? "local"}`,
    "-- Safety: INSERT OR IGNORE only. This file never deletes or overwrites existing D1 rows.",
    "-- Intended for a newly migrated empty D1 database, not incremental synchronization.",
    "-- Rows are emitted in deterministic dependency-safe order.",
    "-- Apply every ordered migrations/[0-9]*.sql file before this file.",
    "PRAGMA foreign_keys = ON;",
    "BEGIN TRANSACTION;",
  ];

  for (const table of TABLE_ORDER) {
    const columns = tableColumns(db, table);
    const rows = tableRows(db, table, columns);
    rowCounts[table] = rows.length;
    lines.push("", `-- ${table}: ${rows.length} rows`);
    if (!rows.length) continue;
    const columnSql = columns.map(quoteIdentifier).join(", ");
    for (const row of rows) {
      const values = columns.map(column => quoteValue(row[column] ?? null)).join(", ");
      lines.push(`INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${values});`);
    }
  }

  lines.push("", "COMMIT;", "");
  const sql = lines.join("\n");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  return { sql, sha256, rowCounts };
}
