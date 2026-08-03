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

function tableRows(db: MarketEventDatabase, table: string, columns: string[]): Record<string, SqlValue>[] {
  const select = columns.map(quoteIdentifier).join(", ");
  return db.prepare(`SELECT ${select} FROM ${quoteIdentifier(table)}`).all() as Record<string, SqlValue>[];
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
    "-- Apply migrations/0001_market_event_foundation.sql before this file.",
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
