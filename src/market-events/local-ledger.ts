import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  MARKET_EVENT_SCHEMA_VERSION,
  assertIsoTimestamp,
  assertValidEventTime,
  validateMarketEventBundle,
  type DecisionSnapshot,
  type DeliveryOutboxItem,
  type EventRevision,
  type EventSource,
  type MarketEvent,
  type MarketEventBundle,
} from "./contracts.js";

export type MarketEventLedgerRecord =
  | { recordType: "MARKET_EVENT"; recordedAt: string; payload: MarketEvent }
  | { recordType: "EVENT_REVISION"; recordedAt: string; payload: EventRevision }
  | { recordType: "EVENT_SOURCE"; recordedAt: string; payload: EventSource }
  | { recordType: "DECISION_SNAPSHOT"; recordedAt: string; payload: DecisionSnapshot }
  | { recordType: "DELIVERY_OUTBOX"; recordedAt: string; payload: DeliveryOutboxItem };

export type LedgerReadResult = {
  records: MarketEventLedgerRecord[];
  parseErrors: Array<{ lineNumber: number; message: string; preview: string }>;
};

function assertSchemaVersion(value: number): void {
  if (value !== MARKET_EVENT_SCHEMA_VERSION) throw new Error(`Unsupported schemaVersion: ${value}`);
}

export function validateLedgerRecord(record: MarketEventLedgerRecord): void {
  assertSchemaVersion(record.payload.schemaVersion);
  assertIsoTimestamp(record.recordedAt, "recordedAt");

  switch (record.recordType) {
    case "MARKET_EVENT":
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.occurrenceKey.trim()) throw new Error("occurrenceKey is required");
      if (!record.payload.issuerName.trim()) throw new Error("issuerName is required");
      if (!record.payload.title.trim()) throw new Error("title is required");
      assertValidEventTime(record.payload.time);
      assertIsoTimestamp(record.payload.lastVerifiedAt, "lastVerifiedAt");
      if (record.payload.staleAfter !== null) assertIsoTimestamp(record.payload.staleAfter, "staleAfter");
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

    case "DECISION_SNAPSHOT":
      if (!record.payload.decisionSnapshotId.startsWith("dec_")) throw new Error("Invalid decisionSnapshotId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      assertIsoTimestamp(record.payload.createdAt, "decision createdAt");
      break;

    case "DELIVERY_OUTBOX":
      if (!record.payload.deliveryId.startsWith("dlv_")) throw new Error("Invalid deliveryId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      assertIsoTimestamp(record.payload.scheduledAt, "scheduledAt");
      assertIsoTimestamp(record.payload.createdAt, "delivery createdAt");
      assertIsoTimestamp(record.payload.updatedAt, "delivery updatedAt");
      if (!Number.isInteger(record.payload.attemptCount) || record.payload.attemptCount < 0) {
        throw new Error("attemptCount must be a non-negative integer");
      }
      break;
  }
}

export function recordsFromBundle(bundle: MarketEventBundle, recordedAt: string): MarketEventLedgerRecord[] {
  validateMarketEventBundle(bundle);
  assertIsoTimestamp(recordedAt, "recordedAt");
  return [
    { recordType: "MARKET_EVENT", recordedAt, payload: bundle.event },
    ...bundle.sources.map((payload): MarketEventLedgerRecord => ({ recordType: "EVENT_SOURCE", recordedAt, payload })),
    { recordType: "EVENT_REVISION", recordedAt, payload: bundle.revision },
    ...(bundle.decisionSnapshot
      ? [{ recordType: "DECISION_SNAPSHOT", recordedAt, payload: bundle.decisionSnapshot } as MarketEventLedgerRecord]
      : []),
    ...bundle.deliveries.map((payload): MarketEventLedgerRecord => ({ recordType: "DELIVERY_OUTBOX", recordedAt, payload })),
  ];
}

export function appendLedgerRecord(path: string, record: MarketEventLedgerRecord): void {
  validateLedgerRecord(record);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

/**
 * Appends a complete event bundle with one filesystem write. This is not a
 * substitute for a database transaction, but it prevents half-written bundles
 * caused by calling appendFileSync separately for each record.
 */
export function appendLedgerBundle(path: string, bundle: MarketEventBundle, recordedAt: string): void {
  const records = recordsFromBundle(bundle, recordedAt);
  for (const record of records) validateLedgerRecord(record);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${records.map(record => JSON.stringify(record)).join("\n")}\n`, "utf8");
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

export function rewriteLedgerAtomically(path: string, records: MarketEventLedgerRecord[]): void {
  for (const record of records) validateLedgerRecord(record);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, records.length ? `${records.map(record => JSON.stringify(record)).join("\n")}\n` : "", "utf8");
  renameSync(temporaryPath, path);
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

export function buildLatestRevisionProjection(records: MarketEventLedgerRecord[]): Map<string, EventRevision> {
  const projection = new Map<string, EventRevision>();
  for (const record of records) {
    if (record.recordType !== "EVENT_REVISION") continue;
    const existing = projection.get(record.payload.eventId);
    if (!existing || record.payload.revisionNumber > existing.revisionNumber) {
      projection.set(record.payload.eventId, record.payload);
    }
  }
  return projection;
}

export function findLedgerDuplicates(records: MarketEventLedgerRecord[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const record of records) {
    const id = record.recordType === "MARKET_EVENT"
      ? record.payload.eventId
      : record.recordType === "EVENT_REVISION"
        ? record.payload.revisionId
        : record.recordType === "EVENT_SOURCE"
          ? record.payload.sourceId
          : record.recordType === "DECISION_SNAPSHOT"
            ? record.payload.decisionSnapshotId
            : record.payload.deliveryId;
    const key = `${record.recordType}:${id}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}
