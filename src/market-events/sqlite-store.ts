import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  validateMarketEventBundle,
  type DecisionSnapshot,
  type DeliveryOutboxItem,
  type EventRevision,
  type EventSource,
  type MarketEvent,
  type MarketEventBundle,
} from "./contracts.js";

export const DEFAULT_MARKET_EVENT_DB_PATH = "data/market-events.db";
export const DEFAULT_MARKET_EVENT_MIGRATION_DIR = "migrations";

export type MarketEventDatabase = DatabaseSync;

export type MarketEventAuditReport = {
  generatedAt: string;
  databasePath: string;
  counts: {
    events: number;
    revisions: number;
    sources: number;
    decisions: number;
    outbox: number;
    pendingDeliveries: number;
    reviewTasks: number;
  };
  foreignKeyErrors: unknown[];
  eventsWithoutRevision: string[];
  currentRevisionMismatches: string[];
  malformedJsonRows: Array<{ table: string; id: string; field: string; message: string }>;
  status: "ok" | "error";
};

type MarketEventRow = {
  event_id: string;
  schema_version: number;
  occurrence_key: string;
  issuer_code: string | null;
  issuer_name: string;
  event_type: MarketEvent["eventType"];
  title: string;
  status: MarketEvent["status"];
  priority: MarketEvent["priority"];
  start_at: string | null;
  end_at: string | null;
  all_day: number;
  timezone: string;
  time_precision: MarketEvent["time"]["precision"];
  window_start: string | null;
  window_end: string | null;
  edge_types_json: string;
  current_decision_state: MarketEvent["currentDecisionState"];
  why_it_matters: string;
  checks_before_json: string;
  checks_after_json: string;
  related_event_ids_json: string;
  current_revision_id: string | null;
  last_verified_at: string;
  stale_after: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapEventRow(row: MarketEventRow): MarketEvent {
  return {
    schemaVersion: 1,
    eventId: row.event_id,
    occurrenceKey: row.occurrence_key,
    issuerCode: row.issuer_code,
    issuerName: row.issuer_name,
    eventType: row.event_type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    time: {
      startAt: row.start_at,
      endAt: row.end_at,
      allDay: row.all_day === 1,
      timezone: row.timezone,
      precision: row.time_precision,
      windowStart: row.window_start,
      windowEnd: row.window_end,
    },
    edgeTypes: parseJson<string[]>(row.edge_types_json, []),
    currentDecisionState: row.current_decision_state,
    whyItMatters: row.why_it_matters,
    checksBefore: parseJson<string[]>(row.checks_before_json, []),
    checksAfter: parseJson<string[]>(row.checks_after_json, []),
    relatedEventIds: parseJson<string[]>(row.related_event_ids_json, []),
    lastVerifiedAt: row.last_verified_at,
    staleAfter: row.stale_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function migrationFiles(directory: string): string[] {
  if (!existsSync(directory)) throw new Error(`Migration directory not found: ${directory}`);
  return readdirSync(directory)
    .filter(name => /^\d+.*\.sql$/.test(name))
    .sort()
    .map(name => join(directory, name));
}

export function applyMarketEventMigrations(
  db: MarketEventDatabase,
  migrationDirectory = DEFAULT_MARKET_EVENT_MIGRATION_DIR,
): string[] {
  const applied: string[] = [];
  for (const path of migrationFiles(migrationDirectory)) {
    const sql = readFileSync(path, "utf8");
    db.exec(sql);
    applied.push(path);
  }
  return applied;
}

export function openMarketEventDatabase(options: {
  path?: string;
  migrationDirectory?: string;
  readonly?: boolean;
} = {}): MarketEventDatabase {
  const path = options.path ?? DEFAULT_MARKET_EVENT_DB_PATH;
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly: options.readonly ?? false });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (!options.readonly) {
    if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    applyMarketEventMigrations(db, options.migrationDirectory);
  }
  return db;
}

function upsertEvent(db: MarketEventDatabase, event: MarketEvent, revisionId: string): void {
  db.prepare(`
    INSERT INTO market_events (
      event_id, schema_version, occurrence_key, issuer_code, issuer_name,
      event_type, title, status, priority, start_at, end_at, all_day,
      timezone, time_precision, window_start, window_end, edge_types_json,
      current_decision_state, why_it_matters, checks_before_json,
      checks_after_json, related_event_ids_json, current_revision_id,
      last_verified_at, stale_after, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(event_id) DO UPDATE SET
      occurrence_key = excluded.occurrence_key,
      issuer_code = excluded.issuer_code,
      issuer_name = excluded.issuer_name,
      event_type = excluded.event_type,
      title = excluded.title,
      status = excluded.status,
      priority = excluded.priority,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      all_day = excluded.all_day,
      timezone = excluded.timezone,
      time_precision = excluded.time_precision,
      window_start = excluded.window_start,
      window_end = excluded.window_end,
      edge_types_json = excluded.edge_types_json,
      current_decision_state = excluded.current_decision_state,
      why_it_matters = excluded.why_it_matters,
      checks_before_json = excluded.checks_before_json,
      checks_after_json = excluded.checks_after_json,
      related_event_ids_json = excluded.related_event_ids_json,
      current_revision_id = excluded.current_revision_id,
      last_verified_at = excluded.last_verified_at,
      stale_after = excluded.stale_after,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= market_events.updated_at
  `).run(
    event.eventId,
    event.schemaVersion,
    event.occurrenceKey,
    event.issuerCode,
    event.issuerName,
    event.eventType,
    event.title,
    event.status,
    event.priority,
    event.time.startAt,
    event.time.endAt,
    event.time.allDay ? 1 : 0,
    event.time.timezone,
    event.time.precision,
    event.time.windowStart,
    event.time.windowEnd,
    JSON.stringify(event.edgeTypes),
    event.currentDecisionState,
    event.whyItMatters,
    JSON.stringify(event.checksBefore),
    JSON.stringify(event.checksAfter),
    JSON.stringify(event.relatedEventIds),
    revisionId,
    event.lastVerifiedAt,
    event.staleAfter,
    event.createdAt,
    event.updatedAt,
  );
}

function insertSources(db: MarketEventDatabase, sources: EventSource[]): void {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO event_sources (
      source_id, event_id, schema_version, authority, source_type, url,
      title, published_at, retrieved_at, content_hash, storage_class, object_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const source of sources) {
    statement.run(
      source.sourceId,
      source.eventId,
      source.schemaVersion,
      source.authority,
      source.sourceType,
      source.url,
      source.title,
      source.publishedAt,
      source.retrievedAt,
      source.contentHash,
      source.storageClass,
      source.objectKey,
    );
  }
}

function insertRevision(db: MarketEventDatabase, revision: EventRevision): void {
  const sameNumber = db.prepare(`
    SELECT revision_id AS revisionId
    FROM event_revisions
    WHERE event_id = ? AND revision_number = ?
  `).get(revision.eventId, revision.revisionNumber) as { revisionId: string } | undefined;
  if (sameNumber && sameNumber.revisionId !== revision.revisionId) {
    throw new Error(
      `Revision number collision for ${revision.eventId} #${revision.revisionNumber}: ${sameNumber.revisionId} != ${revision.revisionId}`,
    );
  }

  db.prepare(`
    INSERT OR IGNORE INTO event_revisions (
      revision_id, event_id, schema_version, revision_number, observed_at,
      published_at, effective_at, first_executable_at, change_type,
      facts_json, source_ids_json, previous_revision_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    revision.revisionId,
    revision.eventId,
    revision.schemaVersion,
    revision.revisionNumber,
    revision.observedAt,
    revision.publishedAt,
    revision.effectiveAt,
    revision.firstExecutableAt,
    revision.changeType,
    JSON.stringify(revision.facts),
    JSON.stringify(revision.sourceIds),
    revision.previousRevisionId,
  );
}

function insertDecision(db: MarketEventDatabase, decision: DecisionSnapshot | null): void {
  if (!decision) return;
  db.prepare(`
    INSERT OR IGNORE INTO decision_snapshots (
      decision_snapshot_id, event_id, revision_id, schema_version,
      decision_state, confidence_state, reasons_json,
      invalidation_conditions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    decision.decisionSnapshotId,
    decision.eventId,
    decision.revisionId,
    decision.schemaVersion,
    decision.decisionState,
    decision.confidenceState,
    JSON.stringify(decision.reasons),
    JSON.stringify(decision.invalidationConditions),
    decision.createdAt,
  );
}

function insertDeliveries(db: MarketEventDatabase, deliveries: DeliveryOutboxItem[]): void {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO delivery_outbox (
      delivery_id, delivery_key, event_id, revision_id, schema_version,
      channel, state, payload_json, scheduled_at, attempt_count,
      last_attempt_at, delivered_at, last_error, lease_expires_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const delivery of deliveries) {
    statement.run(
      delivery.deliveryId,
      delivery.deliveryKey,
      delivery.eventId,
      delivery.revisionId,
      delivery.schemaVersion,
      delivery.channel,
      delivery.state,
      JSON.stringify(delivery.payload),
      delivery.scheduledAt,
      delivery.attemptCount,
      delivery.lastAttemptAt,
      delivery.deliveredAt,
      delivery.lastError,
      delivery.leaseExpiresAt,
      delivery.createdAt,
      delivery.updatedAt,
    );
  }
}

export function registerMarketEventBundle(db: MarketEventDatabase, bundle: MarketEventBundle): void {
  validateMarketEventBundle(bundle);
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertEvent(db, bundle.event, bundle.revision.revisionId);
    insertSources(db, bundle.sources);
    insertRevision(db, bundle.revision);
    insertDecision(db, bundle.decisionSnapshot);
    insertDeliveries(db, bundle.deliveries);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getNextRevisionContext(db: MarketEventDatabase, eventId: string): {
  revisionNumber: number;
  previousRevisionId: string | null;
  existingCreatedAt: string | null;
} {
  const latest = db.prepare(`
    SELECT revision_id AS revisionId, revision_number AS revisionNumber
    FROM event_revisions
    WHERE event_id = ?
    ORDER BY revision_number DESC
    LIMIT 1
  `).get(eventId) as { revisionId: string; revisionNumber: number } | undefined;
  const event = db.prepare(`SELECT created_at AS createdAt FROM market_events WHERE event_id = ?`).get(eventId) as
    | { createdAt: string }
    | undefined;
  return {
    revisionNumber: (latest?.revisionNumber ?? 0) + 1,
    previousRevisionId: latest?.revisionId ?? null,
    existingCreatedAt: event?.createdAt ?? null,
  };
}

export function listMarketEvents(
  db: MarketEventDatabase,
  filters: {
    from?: string;
    to?: string;
    priorities?: MarketEvent["priority"][];
    decisionStates?: MarketEvent["currentDecisionState"][];
    includeCancelled?: boolean;
    limit?: number;
  } = {},
): MarketEvent[] {
  const clauses: string[] = [];
  const parameters: Array<string | number> = [];
  if (!filters.includeCancelled) clauses.push("status != 'CANCELLED'");
  if (filters.from) {
    clauses.push("COALESCE(start_at, window_end, '9999-12-31') >= ?");
    parameters.push(filters.from);
  }
  if (filters.to) {
    clauses.push("COALESCE(start_at, window_start, '9999-12-31') <= ?");
    parameters.push(filters.to);
  }
  if (filters.priorities?.length) {
    clauses.push(`priority IN (${filters.priorities.map(() => "?").join(",")})`);
    parameters.push(...filters.priorities);
  }
  if (filters.decisionStates?.length) {
    clauses.push(`current_decision_state IN (${filters.decisionStates.map(() => "?").join(",")})`);
    parameters.push(...filters.decisionStates);
  }
  const limit = Math.max(1, Math.min(filters.limit ?? 500, 5000));
  parameters.push(limit);
  const rows = db.prepare(`
    SELECT * FROM market_events
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY
      CASE priority WHEN 'S0' THEN 0 WHEN 'S1' THEN 1 WHEN 'S2' THEN 2 ELSE 3 END,
      CASE WHEN start_at IS NULL AND window_start IS NULL THEN 1 ELSE 0 END,
      COALESCE(start_at, window_start, '9999-12-31'),
      issuer_code,
      event_id
    LIMIT ?
  `).all(...parameters) as MarketEventRow[];
  return rows.map(mapEventRow);
}

export function getMarketEvent(db: MarketEventDatabase, eventId: string): MarketEvent | null {
  const row = db.prepare("SELECT * FROM market_events WHERE event_id = ?").get(eventId) as MarketEventRow | undefined;
  return row ? mapEventRow(row) : null;
}

export function listEventSources(db: MarketEventDatabase, eventId: string): EventSource[] {
  const rows = db.prepare(`
    SELECT
      source_id AS sourceId,
      event_id AS eventId,
      schema_version AS schemaVersion,
      authority,
      source_type AS sourceType,
      url,
      title,
      published_at AS publishedAt,
      retrieved_at AS retrievedAt,
      content_hash AS contentHash,
      storage_class AS storageClass,
      object_key AS objectKey
    FROM event_sources
    WHERE event_id = ?
    ORDER BY COALESCE(published_at, retrieved_at), source_id
  `).all(eventId) as EventSource[];
  return rows;
}

export function listPendingDeliveries(db: MarketEventDatabase, now: string, limit = 100): DeliveryOutboxItem[] {
  const rows = db.prepare(`
    SELECT
      delivery_id AS deliveryId,
      delivery_key AS deliveryKey,
      event_id AS eventId,
      revision_id AS revisionId,
      schema_version AS schemaVersion,
      channel,
      state,
      payload_json AS payloadJson,
      scheduled_at AS scheduledAt,
      attempt_count AS attemptCount,
      last_attempt_at AS lastAttemptAt,
      delivered_at AS deliveredAt,
      last_error AS lastError,
      lease_expires_at AS leaseExpiresAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM delivery_outbox
    WHERE state IN ('PENDING', 'FAILED')
      AND scheduled_at <= ?
      AND (lease_expires_at IS NULL OR lease_expires_at < ?)
    ORDER BY scheduled_at, delivery_id
    LIMIT ?
  `).all(now, now, Math.max(1, Math.min(limit, 1000))) as Array<
    Omit<DeliveryOutboxItem, "payload"> & { payloadJson: string }
  >;
  return rows.map(({ payloadJson, ...row }) => ({ ...row, payload: parseJson(payloadJson, {}) }));
}

export function auditMarketEventDatabase(db: MarketEventDatabase, databasePath: string): MarketEventAuditReport {
  const count = (table: string): number => (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total;
  const pendingDeliveries = (db.prepare(`
    SELECT COUNT(*) AS total FROM delivery_outbox WHERE state IN ('PENDING', 'FAILED', 'PROCESSING')
  `).get() as { total: number }).total;
  const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
  const eventsWithoutRevision = db.prepare(`
    SELECT event_id AS eventId FROM market_events WHERE current_revision_id IS NULL
  `).all().map(row => (row as { eventId: string }).eventId);
  const currentRevisionMismatches = db.prepare(`
    SELECT e.event_id AS eventId
    FROM market_events e
    LEFT JOIN event_revisions r ON r.revision_id = e.current_revision_id
    WHERE e.current_revision_id IS NOT NULL
      AND (r.revision_id IS NULL OR r.event_id != e.event_id)
  `).all().map(row => (row as { eventId: string }).eventId);
  const malformedJsonRows: MarketEventAuditReport["malformedJsonRows"] = [];
  const jsonChecks = [
    { table: "market_events", id: "event_id", fields: ["edge_types_json", "checks_before_json", "checks_after_json", "related_event_ids_json"] },
    { table: "event_revisions", id: "revision_id", fields: ["facts_json", "source_ids_json"] },
    { table: "decision_snapshots", id: "decision_snapshot_id", fields: ["reasons_json", "invalidation_conditions_json"] },
    { table: "delivery_outbox", id: "delivery_id", fields: ["payload_json"] },
  ];
  for (const check of jsonChecks) {
    const rows = db.prepare(`SELECT ${check.id} AS id, ${check.fields.join(", ")} FROM ${check.table}`).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      for (const field of check.fields) {
        try {
          JSON.parse(String(row[field]));
        } catch (error) {
          malformedJsonRows.push({
            table: check.table,
            id: String(row.id),
            field,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
  const status = foreignKeyErrors.length || eventsWithoutRevision.length || currentRevisionMismatches.length || malformedJsonRows.length
    ? "error"
    : "ok";
  return {
    generatedAt: new Date().toISOString(),
    databasePath,
    counts: {
      events: count("market_events"),
      revisions: count("event_revisions"),
      sources: count("event_sources"),
      decisions: count("decision_snapshots"),
      outbox: count("delivery_outbox"),
      pendingDeliveries,
      reviewTasks: count("review_tasks"),
    },
    foreignKeyErrors,
    eventsWithoutRevision,
    currentRevisionMismatches,
    malformedJsonRows,
    status,
  };
}
