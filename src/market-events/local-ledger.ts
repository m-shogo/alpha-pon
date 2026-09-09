import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { dirname, resolve, sep } from "node:path";
import { compareExplicitIso8601Instants } from "../research/iso-instant.js";
import {
  MARKET_EVENT_SCHEMA_VERSION,
  SOURCE_TYPES,
  STORAGE_CLASSES,
  assertIsoTimestamp,
  assertValidEventTime,
  buildDecisionSnapshotId,
  buildDeliveryId,
  buildEventId,
  buildRevisionId,
  buildSourceId,
  validateMarketEventBundle,
  type DecisionSnapshot,
  type DeliveryOutboxItem,
  type EventRevision,
  type EventSource,
  type MarketEvent,
  type MarketEventBundle,
} from "./contracts.js";
import { validateMarketEventRevisionChronology } from "./revision-chronology.js";

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

function ledgerFileError(message: string): LedgerReadResult {
  return { records: [], parseErrors: [{ lineNumber: 0, message, preview: "" }] };
}

function hasSymlinkedAncestorWithinCwd(path: string): boolean {
  const root = resolve(process.cwd());
  let current = dirname(resolve(path));
  if (current !== root && !current.startsWith(`${root}${sep}`)) return false;

  while (current !== root) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  return false;
}

export function validateLedgerRecord(record: MarketEventLedgerRecord): void {
  assertSchemaVersion(record.payload.schemaVersion);
  assertIsoTimestamp(record.recordedAt, "recordedAt");

  switch (record.recordType) {
    case "MARKET_EVENT": {
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      const canonicalOccurrenceKey = record.payload.occurrenceKey.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
      if (!canonicalOccurrenceKey || record.payload.occurrenceKey !== canonicalOccurrenceKey) {
        throw new Error("occurrenceKey must be canonical NFKC lowercase text without surrounding or repeated whitespace");
      }
      if (record.payload.issuerCode !== null) {
        const canonicalIssuerCode = record.payload.issuerCode.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
        if (!canonicalIssuerCode || record.payload.issuerCode !== canonicalIssuerCode) {
          throw new Error("issuerCode must be canonical NFKC uppercase text without surrounding or repeated whitespace");
        }
      }
      if (!record.payload.issuerName.trim()) throw new Error("issuerName is required");
      if (!record.payload.title.trim()) throw new Error("title is required");
      const expectedEventId = buildEventId({
        issuerCode: record.payload.issuerCode,
        issuerName: record.payload.issuerName,
        eventType: record.payload.eventType,
        occurrenceKey: record.payload.occurrenceKey,
      });
      if (record.payload.eventId !== expectedEventId) {
        throw new Error(`Event ${record.payload.eventId} does not match canonical event identity ${expectedEventId}`);
      }
      assertValidEventTime(record.payload.time);
      assertIsoTimestamp(record.payload.lastVerifiedAt, "lastVerifiedAt");
      if (record.payload.staleAfter !== null) assertIsoTimestamp(record.payload.staleAfter, "staleAfter");
      assertIsoTimestamp(record.payload.createdAt, "createdAt");
      assertIsoTimestamp(record.payload.updatedAt, "updatedAt");
      if (
        compareExplicitIso8601Instants(
          record.payload.updatedAt,
          record.payload.createdAt,
          "updatedAt",
          "createdAt",
        ) < 0
      ) {
        throw new Error("updatedAt must be on or after createdAt");
      }
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.createdAt,
          "recordedAt",
          "createdAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after createdAt");
      }
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.updatedAt,
          "recordedAt",
          "updatedAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after updatedAt");
      }
      break;
    }

    case "EVENT_REVISION": {
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!Number.isInteger(record.payload.revisionNumber) || record.payload.revisionNumber < 1) {
        throw new Error("revisionNumber must be a positive integer");
      }
      const expectedRevisionId = buildRevisionId({
        eventId: record.payload.eventId,
        revisionNumber: record.payload.revisionNumber,
        facts: record.payload.facts,
        sourceIds: record.payload.sourceIds,
      });
      if (record.payload.revisionId !== expectedRevisionId) {
        throw new Error(`Revision ${record.payload.revisionId} does not match canonical revision identity ${expectedRevisionId}`);
      }
      assertIsoTimestamp(record.payload.observedAt, "observedAt");
      for (const [fieldName, value] of [
        ["publishedAt", record.payload.publishedAt],
        ["effectiveAt", record.payload.effectiveAt],
        ["firstExecutableAt", record.payload.firstExecutableAt],
      ] as const) {
        if (value !== null) assertIsoTimestamp(value, fieldName);
      }
      validateMarketEventRevisionChronology(record.payload);
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.observedAt,
          "recordedAt",
          "observedAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after observedAt");
      }
      break;
    }

    case "EVENT_SOURCE": {
      if (!record.payload.sourceId.startsWith("src_")) throw new Error("Invalid sourceId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      const canonicalAuthority = record.payload.authority.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
      if (!canonicalAuthority || record.payload.authority !== canonicalAuthority) {
        throw new Error("Source authority must be canonical uppercase text without surrounding or repeated whitespace");
      }
      if (!(SOURCE_TYPES as readonly string[]).includes(record.payload.sourceType)) throw new Error(`Unknown source type: ${record.payload.sourceType}`);
      if (!(STORAGE_CLASSES as readonly string[]).includes(record.payload.storageClass)) throw new Error(`Unknown storage class: ${record.payload.storageClass}`);
      let sourceUrl: URL;
      try {
        sourceUrl = new URL(record.payload.url);
      } catch {
        throw new Error("Source URL must be a valid absolute URL");
      }
      if (sourceUrl.protocol !== "https:") throw new Error("Source URL must use https");
      if (sourceUrl.hash !== "") {
        throw new Error("Source URL must not contain a fragment because source identity ignores URL fragments");
      }
      if (record.payload.url !== sourceUrl.toString()) {
        throw new Error("Source URL must use the canonical URL serialization used by source identity");
      }
      if (!/^[a-f0-9]{64}$/.test(record.payload.contentHash)) {
        throw new Error("source contentHash must be a lowercase SHA-256 hash");
      }
      const expectedSourceId = buildSourceId({
        authority: record.payload.authority,
        url: record.payload.url,
        publishedAt: record.payload.publishedAt,
        contentHash: record.payload.contentHash,
      });
      if (record.payload.sourceId !== expectedSourceId) {
        throw new Error(`Source ${record.payload.sourceId} does not match canonical source identity ${expectedSourceId}`);
      }
      assertIsoTimestamp(record.payload.retrievedAt, "retrievedAt");
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.retrievedAt,
          "recordedAt",
          "retrievedAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after retrievedAt");
      }
      if (record.payload.publishedAt !== null) {
        assertIsoTimestamp(record.payload.publishedAt, "publishedAt");
        if (
          compareExplicitIso8601Instants(
            record.payload.publishedAt,
            record.payload.retrievedAt,
            "publishedAt",
            "retrievedAt",
          ) > 0
        ) {
          throw new Error("publishedAt must be on or before retrievedAt");
        }
      }
      break;
    }

    case "DECISION_SNAPSHOT": {
      if (!record.payload.decisionSnapshotId.startsWith("dec_")) throw new Error("Invalid decisionSnapshotId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      assertIsoTimestamp(record.payload.createdAt, "decision createdAt");
      const expectedDecisionSnapshotId = buildDecisionSnapshotId({
        eventId: record.payload.eventId,
        revisionId: record.payload.revisionId,
        decisionState: record.payload.decisionState,
        confidenceState: record.payload.confidenceState,
        createdAt: record.payload.createdAt,
      });
      if (record.payload.decisionSnapshotId !== expectedDecisionSnapshotId) {
        throw new Error(`Decision snapshot ${record.payload.decisionSnapshotId} does not match canonical decision identity ${expectedDecisionSnapshotId}`);
      }
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.createdAt,
          "recordedAt",
          "decision createdAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after decision createdAt");
      }
      break;
    }

    case "DELIVERY_OUTBOX": {
      if (!record.payload.deliveryId.startsWith("dlv_")) throw new Error("Invalid deliveryId");
      if (!record.payload.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
      if (!record.payload.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
      const canonicalDeliveryKey = record.payload.deliveryKey.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
      if (!canonicalDeliveryKey || record.payload.deliveryKey !== canonicalDeliveryKey) {
        throw new Error("deliveryKey must be canonical NFKC lowercase text without surrounding or repeated whitespace");
      }
      assertIsoTimestamp(record.payload.scheduledAt, "scheduledAt");
      const expectedDeliveryId = buildDeliveryId({
        eventId: record.payload.eventId,
        revisionId: record.payload.revisionId,
        channel: record.payload.channel,
        deliveryKey: record.payload.deliveryKey,
        scheduledAt: record.payload.scheduledAt,
      });
      if (record.payload.deliveryId !== expectedDeliveryId) {
        throw new Error(`Delivery ${record.payload.deliveryId} does not match canonical delivery identity ${expectedDeliveryId}`);
      }
      assertIsoTimestamp(record.payload.createdAt, "delivery createdAt");
      assertIsoTimestamp(record.payload.updatedAt, "delivery updatedAt");
      for (const [fieldName, value] of [
        ["delivery lastAttemptAt", record.payload.lastAttemptAt],
        ["delivery deliveredAt", record.payload.deliveredAt],
        ["delivery leaseExpiresAt", record.payload.leaseExpiresAt],
      ] as const) {
        if (value !== null) assertIsoTimestamp(value, fieldName);
      }
      if (
        compareExplicitIso8601Instants(
          record.payload.updatedAt,
          record.payload.createdAt,
          "delivery updatedAt",
          "delivery createdAt",
        ) < 0
      ) {
        throw new Error("delivery updatedAt must be on or after delivery createdAt");
      }
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.createdAt,
          "recordedAt",
          "delivery createdAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after delivery createdAt");
      }
      if (
        compareExplicitIso8601Instants(
          record.recordedAt,
          record.payload.updatedAt,
          "recordedAt",
          "delivery updatedAt",
        ) < 0
      ) {
        throw new Error("recordedAt must be on or after delivery updatedAt");
      }
      if (!Number.isInteger(record.payload.attemptCount) || record.payload.attemptCount < 0) {
        throw new Error("attemptCount must be a non-negative integer");
      }
      break;
    }
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

  let contents: string;
  try {
    if (hasSymlinkedAncestorWithinCwd(path)) return ledgerFileError("non_regular_file");
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return ledgerFileError("non_regular_file");
    contents = readFileSync(path, "utf8");
  } catch {
    return ledgerFileError("read_error");
  }

  const records: MarketEventLedgerRecord[] = [];
  const parseErrors: LedgerReadResult["parseErrors"] = [];
  const lines = contents.split("\n");

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
    if (!existing) {
      projection.set(record.payload.eventId, record.payload);
      continue;
    }

    const updatedAtComparison = compareExplicitIso8601Instants(
      record.payload.updatedAt,
      existing.updatedAt,
      "market event updatedAt",
      "existing market event updatedAt",
    );
    if (updatedAtComparison > 0) {
      projection.set(record.payload.eventId, record.payload);
      continue;
    }
    if (updatedAtComparison === 0 && !isDeepStrictEqual(existing, record.payload)) {
      throw new Error(
        `Conflicting market event replay for ${record.payload.eventId} at ${record.payload.updatedAt}`,
      );
    }
  }
  return projection;
}

export function buildLatestRevisionProjection(records: MarketEventLedgerRecord[]): Map<string, EventRevision> {
  const projection = new Map<string, EventRevision>();
  const revisionsByEventAndNumber = new Map<string, Map<number, EventRevision>>();
  for (const record of records) {
    if (record.recordType !== "EVENT_REVISION") continue;

    let revisionsByNumber = revisionsByEventAndNumber.get(record.payload.eventId);
    if (!revisionsByNumber) {
      revisionsByNumber = new Map<number, EventRevision>();
      revisionsByEventAndNumber.set(record.payload.eventId, revisionsByNumber);
    }
    const replayedRevision = revisionsByNumber.get(record.payload.revisionNumber);
    if (replayedRevision && !isDeepStrictEqual(replayedRevision, record.payload)) {
      throw new Error(
        `Conflicting revision replay for ${record.payload.eventId} revision ${record.payload.revisionNumber}`,
      );
    }
    if (!replayedRevision) {
      revisionsByNumber.set(record.payload.revisionNumber, record.payload);
    }

    const existing = projection.get(record.payload.eventId);
    if (!existing || record.payload.revisionNumber > existing.revisionNumber) {
      projection.set(record.payload.eventId, record.payload);
    }
  }

  for (const [eventId, revisionsByNumber] of revisionsByEventAndNumber) {
    const revisions = [...revisionsByNumber.values()].sort((left, right) => left.revisionNumber - right.revisionNumber);
    for (let index = 0; index < revisions.length; index += 1) {
      const revision = revisions[index];
      const expectedNumber = index + 1;
      if (revision.revisionNumber !== expectedNumber) {
        throw new Error(
          `Revision continuity for ${eventId} expected ${expectedNumber}, found ${revision.revisionNumber}`,
        );
      }
      const expectedPrevious = index === 0 ? null : revisions[index - 1].revisionId;
      if (revision.previousRevisionId !== expectedPrevious) {
        throw new Error(`Revision ${revision.revisionId} previousRevisionId mismatch`);
      }
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
