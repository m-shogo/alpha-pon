export const D1_SYNC_TABLES = [
  "market_events",
  "event_sources",
  "event_revisions",
  "decision_snapshots",
] as const;

export type D1SyncTable = (typeof D1_SYNC_TABLES)[number];
export type D1SyncRow = Record<string, string | number | null>;

export type D1SyncSnapshot = {
  market_events: D1SyncRow[];
  event_sources: D1SyncRow[];
  event_revisions: D1SyncRow[];
  decision_snapshots: D1SyncRow[];
  triggers: number;
  legacyGuardMarker: number;
};

export type D1SyncTablePlan = {
  added: string[];
  updated: string[];
  unchanged: string[];
  removedCandidates: string[];
  collisions: string[];
};

export type D1SyncPlan = {
  status: "ready" | "blocked";
  tables: Record<D1SyncTable, D1SyncTablePlan>;
  validationErrors: string[];
  blockers: string[];
  summary: {
    added: number;
    updated: number;
    unchanged: number;
    removedCandidates: number;
    collisions: number;
  };
};

export const D1_SYNC_COLUMNS: Record<D1SyncTable, readonly string[]> = {
  market_events: [
    "event_id", "schema_version", "occurrence_key", "issuer_code", "issuer_name",
    "event_type", "title", "status", "priority", "start_at", "end_at", "all_day",
    "timezone", "time_precision", "window_start", "window_end", "edge_types_json",
    "current_decision_state", "why_it_matters", "checks_before_json", "checks_after_json",
    "related_event_ids_json", "current_revision_id", "last_verified_at", "stale_after",
    "created_at", "updated_at",
  ],
  event_sources: [
    "source_id", "event_id", "schema_version", "authority", "source_type", "url", "title",
    "published_at", "retrieved_at", "content_hash", "storage_class", "object_key",
  ],
  event_revisions: [
    "revision_id", "event_id", "schema_version", "revision_number", "observed_at",
    "published_at", "effective_at", "first_executable_at", "change_type", "facts_json",
    "source_ids_json", "previous_revision_id",
  ],
  decision_snapshots: [
    "decision_snapshot_id", "event_id", "revision_id", "schema_version", "decision_state",
    "confidence_state", "reasons_json", "invalidation_conditions_json", "created_at",
  ],
};

const PRIMARY_KEYS: Record<D1SyncTable, string> = {
  market_events: "event_id",
  event_sources: "source_id",
  event_revisions: "revision_id",
  decision_snapshots: "decision_snapshot_id",
};

const JSON_FIELDS: Partial<Record<D1SyncTable, readonly string[]>> = {
  market_events: ["edge_types_json", "checks_before_json", "checks_after_json", "related_event_ids_json"],
  event_revisions: ["facts_json", "source_ids_json"],
  decision_snapshots: ["reasons_json", "invalidation_conditions_json"],
};

function valueKey(value: unknown): string {
  if (value === undefined || value === null) return "null";
  return typeof value === "number" ? `number:${value}` : `string:${String(value)}`;
}

function rowKey(table: D1SyncTable, row: D1SyncRow): string {
  const key = row[PRIMARY_KEYS[table]];
  if (typeof key !== "string" || !key) throw new Error(`${table} row is missing ${PRIMARY_KEYS[table]}`);
  return key;
}

function rowsEqual(table: D1SyncTable, left: D1SyncRow, right: D1SyncRow): boolean {
  return D1_SYNC_COLUMNS[table].every(column => valueKey(left[column]) === valueKey(right[column]));
}

function indexRows(table: D1SyncTable, rows: D1SyncRow[], errors: string[]): Map<string, D1SyncRow> {
  const indexed = new Map<string, D1SyncRow>();
  for (const row of rows) {
    let key: string;
    try {
      key = rowKey(table, row);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (indexed.has(key)) errors.push(`${table} contains duplicate primary key ${key}`);
    indexed.set(key, row);
  }
  return indexed;
}

function validateJsonFields(table: D1SyncTable, rows: D1SyncRow[], errors: string[]): void {
  for (const row of rows) {
    const key = String(row[PRIMARY_KEYS[table]] ?? "<missing>");
    for (const field of JSON_FIELDS[table] ?? []) {
      const value = row[field];
      if (typeof value !== "string") {
        errors.push(`${table}.${field} must be a JSON string for ${key}`);
        continue;
      }
      try {
        JSON.parse(value);
      } catch (error) {
        errors.push(`${table}.${field} is malformed for ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

export function validateD1SyncSnapshot(snapshot: D1SyncSnapshot, label: string): string[] {
  const errors: string[] = [];
  const indexes = Object.fromEntries(
    D1_SYNC_TABLES.map(table => [table, indexRows(table, snapshot[table], errors)]),
  ) as Record<D1SyncTable, Map<string, D1SyncRow>>;

  for (const table of D1_SYNC_TABLES) validateJsonFields(table, snapshot[table], errors);

  for (const source of snapshot.event_sources) {
    const sourceId = String(source.source_id ?? "<missing>");
    if (!indexes.market_events.has(String(source.event_id))) {
      errors.push(`${label}: source ${sourceId} references missing event ${String(source.event_id)}`);
    }
  }

  const revisionsByEvent = new Map<string, D1SyncRow[]>();
  for (const revision of snapshot.event_revisions) {
    const revisionId = String(revision.revision_id ?? "<missing>");
    const eventId = String(revision.event_id ?? "");
    if (!indexes.market_events.has(eventId)) {
      errors.push(`${label}: revision ${revisionId} references missing event ${eventId}`);
    }
    const rows = revisionsByEvent.get(eventId) ?? [];
    rows.push(revision);
    revisionsByEvent.set(eventId, rows);
  }

  for (const [eventId, revisions] of revisionsByEvent) {
    revisions.sort((left, right) => Number(left.revision_number) - Number(right.revision_number));
    for (let index = 0; index < revisions.length; index += 1) {
      const revision = revisions[index];
      const expectedNumber = index + 1;
      const actualNumber = Number(revision.revision_number);
      if (actualNumber !== expectedNumber) {
        errors.push(`${label}: ${eventId} revision continuity expected ${expectedNumber}, found ${actualNumber}`);
      }
      const expectedPrevious = index === 0 ? null : revisions[index - 1].revision_id;
      if (valueKey(revision.previous_revision_id) !== valueKey(expectedPrevious)) {
        errors.push(`${label}: ${String(revision.revision_id)} previous_revision_id mismatch`);
      }
    }
  }

  for (const event of snapshot.market_events) {
    const eventId = String(event.event_id ?? "<missing>");
    const revisionId = event.current_revision_id;
    if (typeof revisionId !== "string" || !revisionId) {
      errors.push(`${label}: event ${eventId} has no current_revision_id`);
      continue;
    }
    const revision = indexes.event_revisions.get(revisionId);
    if (!revision || revision.event_id !== eventId) {
      errors.push(`${label}: event ${eventId} current_revision_id ${revisionId} is invalid`);
    }
  }

  for (const decision of snapshot.decision_snapshots) {
    const decisionId = String(decision.decision_snapshot_id ?? "<missing>");
    const eventId = String(decision.event_id ?? "");
    const revisionId = String(decision.revision_id ?? "");
    const revision = indexes.event_revisions.get(revisionId);
    if (!indexes.market_events.has(eventId)) {
      errors.push(`${label}: decision ${decisionId} references missing event ${eventId}`);
    }
    if (!revision || revision.event_id !== eventId) {
      errors.push(`${label}: decision ${decisionId} references invalid revision ${revisionId}`);
    }
  }

  if (!Number.isInteger(snapshot.triggers) || snapshot.triggers < 0) {
    errors.push(`${label}: trigger count is invalid`);
  }
  if (!Number.isInteger(snapshot.legacyGuardMarker) || snapshot.legacyGuardMarker < 0) {
    errors.push(`${label}: legacy marker count is invalid`);
  }
  return errors;
}

function planTable(
  table: D1SyncTable,
  canonicalRows: D1SyncRow[],
  remoteRows: D1SyncRow[],
): D1SyncTablePlan {
  const errors: string[] = [];
  const canonical = indexRows(table, canonicalRows, errors);
  const remote = indexRows(table, remoteRows, errors);
  if (errors.length) throw new Error(errors.join("; "));

  const added: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const collisions: string[] = [];
  for (const [key, row] of canonical) {
    const existing = remote.get(key);
    if (!existing) {
      added.push(key);
      continue;
    }
    if (rowsEqual(table, row, existing)) {
      unchanged.push(key);
      continue;
    }
    if (table === "market_events") updated.push(key);
    else collisions.push(key);
  }
  const removedCandidates = [...remote.keys()].filter(key => !canonical.has(key));
  return {
    added: added.sort(),
    updated: updated.sort(),
    unchanged: unchanged.sort(),
    removedCandidates: removedCandidates.sort(),
    collisions: collisions.sort(),
  };
}

export function buildD1SyncPlan(canonical: D1SyncSnapshot, remote: D1SyncSnapshot): D1SyncPlan {
  const validationErrors = [
    ...validateD1SyncSnapshot(canonical, "canonical"),
    ...validateD1SyncSnapshot(remote, "remote"),
  ];
  const tables = Object.fromEntries(
    D1_SYNC_TABLES.map(table => [table, planTable(table, canonical[table], remote[table])]),
  ) as Record<D1SyncTable, D1SyncTablePlan>;

  const blockers = [...validationErrors];
  if (remote.triggers !== 0) blockers.push(`remote D1 must have zero triggers, found ${remote.triggers}`);
  if (remote.legacyGuardMarker !== 0) {
    blockers.push(`legacy revision guard marker must be absent, found ${remote.legacyGuardMarker}`);
  }
  for (const table of D1_SYNC_TABLES) {
    for (const key of tables[table].collisions) blockers.push(`${table} immutable row collision: ${key}`);
  }
  for (const eventId of tables.market_events.updated) {
    const canonicalEvent = canonical.market_events.find(row => row.event_id === eventId);
    const remoteEvent = remote.market_events.find(row => row.event_id === eventId);
    if (canonicalEvent && remoteEvent && String(canonicalEvent.updated_at) < String(remoteEvent.updated_at)) {
      blockers.push(`canonical event ${eventId} is older than remote updated_at`);
    }
  }

  const summary = D1_SYNC_TABLES.reduce(
    (result, table) => {
      result.added += tables[table].added.length;
      result.updated += tables[table].updated.length;
      result.unchanged += tables[table].unchanged.length;
      result.removedCandidates += tables[table].removedCandidates.length;
      result.collisions += tables[table].collisions.length;
      return result;
    },
    { added: 0, updated: 0, unchanged: 0, removedCandidates: 0, collisions: 0 },
  );

  return { status: blockers.length ? "blocked" : "ready", tables, validationErrors, blockers, summary };
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot encode non-finite number in D1 sync SQL");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function insertSql(table: D1SyncTable, row: D1SyncRow): string {
  const columns = D1_SYNC_COLUMNS[table];
  const names = columns.map(quoteIdentifier).join(", ");
  const values = columns.map(column => quoteValue(row[column])).join(", ");
  if (table !== "market_events") {
    return `INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${names}) VALUES (${values});`;
  }
  const updateColumns = columns.filter(column => !["event_id", "schema_version", "created_at"].includes(column));
  const updates = updateColumns.map(column => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ");
  return `INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${values}) ON CONFLICT(event_id) DO UPDATE SET ${updates} WHERE excluded.updated_at >= market_events.updated_at;`;
}

export function buildD1SyncApplySql(canonical: D1SyncSnapshot): string {
  const lines = ["PRAGMA foreign_keys = ON;"];
  for (const table of D1_SYNC_TABLES) {
    const rows = [...canonical[table]].sort((left, right) => rowKey(table, left).localeCompare(rowKey(table, right)));
    for (const row of rows) lines.push(insertSql(table, row));
  }
  lines.push("");
  const sql = lines.join("\n");
  if (/\b(DELETE|DROP|ALTER|CREATE\s+TRIGGER)\b/i.test(sql)) {
    throw new Error("D1 sync SQL contains a destructive or trigger statement");
  }
  return sql;
}

export function emptyD1SyncSnapshot(): D1SyncSnapshot {
  return {
    market_events: [],
    event_sources: [],
    event_revisions: [],
    decision_snapshots: [],
    triggers: 0,
    legacyGuardMarker: 0,
  };
}
