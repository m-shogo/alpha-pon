import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  DECISION_STATES,
  DELIVERY_CHANNELS,
  MARKET_EVENT_PRIORITIES,
  MARKET_EVENT_SCHEMA_VERSION,
  MARKET_EVENT_STATUSES,
  MARKET_EVENT_TYPES,
  assertValidEventTime,
  type DeliveryOutboxItem,
  type EventRevision,
  type EventSource,
  type MarketEvent,
} from "./contracts.js";

export type MarketEventLedgerRecord =
  | { recordType: "MARKET_EVENT"; recordedAt: string; payload: MarketEvent }
  | { recordType: "EVENT_REVISION"; recordedAt: string; payload: EventRevision }
  | { recordType: "EVENT_SOURCE"; recordedAt: string; payload: EventSource }
  | { recordType: "DELIVERY_OUTBOX"; recordedAt: string; payload: DeliveryOutboxItem };

export type LedgerReadResult = {
  records: MarketEventLedgerRecord[];
  parseErrors: Array<{ lineNumber: number; message: string; preview: string }>;
};

const REVISION_CHANGE_TYPES = ["CREATED", "UPDATED", "POSTPONED", "CANCELLED", "COMPLETED"] as const;
const SOURCE_TYPES = ["IR", "TDNET", "JPX", "EDINET", "REGULATOR", "COURT", "MAJOR_MEDIA", "OTHER"] as const;
const STORAGE_CLASSES = [
  "METADATA_ONLY",
  "PUBLIC_OFFICIAL_DOCUMENT_PRIVATE_COPY",
  "LICENSED_LOCAL_ONLY",
  "NO_PERSISTENCE",
] as const;
const DELIVERY_STATES = ["PENDING", "PROCESSING", "DELIVERED", "FAILED", "DEAD_LETTER"] as const;

function assertIsoTimestamp(value: string, fieldName: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
}

function assertNullableIsoTimestamp(value: string | null, fieldName: string): void {
  if (value !== null) assertIsoTimestamp(value, fieldName);
}

function assertEnum(value: string, allowed: readonly string[], fieldName: string): void {
  if (!allowed.includes(value)) throw new Error(`Unknown ${fieldName}: ${value}`);
}

function assertId(value: string, prefix: "evt" | "rev" | "src" | "dlv", fieldName: string): void {
  if (!new RegExp(`^${prefix}_[0-9a-f]{24}$`).test(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
}

export function validateLedgerRecord(record: MarketEventLedgerRecord): void {
  if (!record || typeof record !== "object") throw new Error("Ledger record must be an object");
  if (record.payload.schemaVersion !== MARKET_EVENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${record.payload.schemaVersion}`);
  }
  assertIsoTimestamp(record.recordedAt, "recordedAt");

  switch (record.recordType) {
    case "MARKET_EVENT":
      assertId(record.payload.eventId, "evt", "eventId");
      if (!record.payload.issuerName.trim()) throw new Error("issuerName is required");
      if (!record.payload.title.trim()) throw new Error("title is required");
      assertEnum(record.payload.eventType, MARKET_EVENT_TYPES, "eventType");
      assertEnum(record.payload.status, MARKET_EVENT_STATUSES, "event status");
      assertEnum(record.payload.priority, MARKET_EVENT_PRIORITIES, "event priority");
      assertEnum(record.payload.currentDecisionState, DECISION_STATES, "decision state");
      assertValidEventTime(record.payload.time);
      assertIsoTimestamp(record.payload.createdAt, "createdAt");
      assertIsoTimestamp(record.payload.updatedAt, "updatedAt");
      break;

    case "EVENT_REVISION":
      assertId(record.payload.revisionId, "rev", "revisionId");
      assertId(record.payload.eventId, "evt", "eventId");
      if (!Number.isInteger(record.payload.revisionNumber) || record.payload.revisionNumber < 1) {
        throw new Error("revisionNumber must be a positive integer");
      }
      assertEnum(record.payload.changeType, REVISION_CHANGE_TYPES, "revision change type");
      assertIsoTimestamp(record.payload.observedAt, "observedAt");
      assertNullableIsoTimestamp(record.payload.publishedAt, "publishedAt");
      assertNullableIsoTimestamp(record.payload.effectiveAt, "effectiveAt");
      assertNullableIsoTimestamp(record.payload.firstExecutableAt, "firstExecutableAt");
      if (record.payload.previousRevisionId !== null) {
        assertId(record.payload.previousRevisionId, "rev", "previousRevisionId");
      }
      record.payload.sourceIds.forEach((sourceId) => assertId(sourceId, "src", "sourceId"));
      break;

    case "EVENT_SOURCE":
      assertId(record.payload.sourceId, "src", "sourceId");
      assertId(record.payload.eventId, "evt", "eventId");
      assertEnum(record.payload.sourceType, SOURCE_TYPES, "sourceType");
      assertEnum(record.payload.storageClass, STORAGE_CLASSES, "storageClass");
      if (!record.payload.authority.trim()) throw new Error("authority is required");
      if (!record.payload.title.trim()) throw new Error("source title is required");
      if (!record.payload.url.startsWith("https://")) throw new Error("Source URL must use https");
      if (!/^[0-9a-f]{64}$/i.test(record.payload.contentHash)) {
        throw new Error("contentHash must be a SHA-256 hex digest");
      }
      assertNullableIsoTimestamp(record.payload.publishedAt, "publishedAt");
      assertIsoTimestamp(record.payload.retrievedAt, "retrievedAt");
      break;

    case "DELIVERY_OUTBOX":
      assertId(record.payload.deliveryId, "dlv", "deliveryId");
      assertId(record.payload.eventId, "evt", "eventId");
      assertId(record.payload.revisionId, "rev", "revisionId");
      assertEnum(record.payload.channel, DELIVERY_CHANNELS, "delivery channel");
      assertEnum(record.payload.state, DELIVERY_STATES, "delivery state");
      assertIsoTimestamp(record.payload.scheduledAt, "scheduledAt");
      assertNullableIsoTimestamp(record.payload.lastAttemptAt, "lastAttemptAt");
      assertNullableIsoTimestamp(record.payload.deliveredAt, "deliveredAt");
      if (!Number.isInteger(record.payload.attemptCount) || record.payload.attemptCount < 0) {
        throw new Error("attemptCount must be a non-negative integer");
      }
      break;

    default: {
      const exhaustive: never = record;
      throw new Error(`Unknown recordType: ${String(exhaustive)}`);
    }
  }
}

export function appendLedgerRecord(path: string, record: MarketEventLedgerRecord): void {
  validateLedgerRecord(record);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

export function readLedger(path: string): LedgerReadResult {
  if (!existsSync(path)) return { records: [], parseErrors: [] };

  const records: MarketEventLedgerRecord[] = [];
  const parseErrors: LedgerReadResult["parseErrors"] = [];
  const lines = readFileSync(path, "utf8").split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as MarketEventLedgerRecord;
      validateLedgerRecord(parsed);
      records.push(parsed);
    } catch (error) {
      parseErrors.push({
        lineNumber: index + 1,
        message: error instanceof Error ? error.message : String(error),
        preview: trimmed.slice(0, 160),
      });
    }
  });

  return { records, parseErrors };
}

export function buildLatestEventProjection(records: MarketEventLedgerRecord[]): Map<string, MarketEvent> {
  const projection = new Map<string, MarketEvent>();
  for (const record of records) {
    if (record.recordType !== "MARKET_EVENT") continue;
    const existing = projection.get(record.payload.eventId);
    if (!existing || Date.parse(record.payload.updatedAt) >= Date.parse(existing.updatedAt)) {
      projection.set(record.payload.eventId, record.payload);
    }
  }
  return projection;
}
