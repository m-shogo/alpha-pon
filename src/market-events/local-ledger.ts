import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  MARKET_EVENT_SCHEMA_VERSION,
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

function assertIsoTimestamp(value: string, fieldName: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
}

export function validateLedgerRecord(record: MarketEventLedgerRecord): void {
  if (record.payload.schemaVersion !== MARKET_EVENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported schemaVersion: ${record.payload.schemaVersion}`);
  }
  assertIsoTimestamp(record.recordedAt, "recordedAt");

  switch (record.recordType) {
    case "MARKET_EVENT":
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.issuerName.trim()) throw new Error("issuerName is required");
      if (!record.payload.title.trim()) throw new Error("title is required");
      assertValidEventTime(record.payload.time);
      assertIsoTimestamp(record.payload.createdAt, "createdAt");
      assertIsoTimestamp(record.payload.updatedAt, "updatedAt");
      break;

    case "EVENT_REVISION":
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!Number.isInteger(record.payload.revisionNumber) || record.payload.revisionNumber < 1) {
        throw new Error("revisionNumber must be a positive integer");
      }
      assertIsoTimestamp(record.payload.observedAt, "observedAt");
      break;

    case "EVENT_SOURCE":
      if (!record.payload.sourceId.startsWith("src_")) throw new Error("Invalid sourceId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.url.startsWith("https://")) throw new Error("Source URL must use https");
      assertIsoTimestamp(record.payload.retrievedAt, "retrievedAt");
      break;

    case "DELIVERY_OUTBOX":
      if (!record.payload.deliveryId.startsWith("dlv_")) throw new Error("Invalid deliveryId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      assertIsoTimestamp(record.payload.scheduledAt, "scheduledAt");
      if (!Number.isInteger(record.payload.attemptCount) || record.payload.attemptCount < 0) {
        throw new Error("attemptCount must be a non-negative integer");
      }
      break;
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
