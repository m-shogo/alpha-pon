import { createHash } from "node:crypto";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../research/iso-instant.js";

export const MARKET_EVENT_SCHEMA_VERSION = 1 as const;

export const MARKET_EVENT_TYPES = [
  "EARNINGS_RELEASE",
  "EARNINGS_BRIEFING",
  "PRESS_CONFERENCE",
  "SHAREHOLDER_MEETING",
  "CONTINUED_SHAREHOLDER_MEETING",
  "INVESTIGATION_UPDATE",
  "THIRD_PARTY_COMMITTEE_REPORT",
  "REGULATORY_ACTION",
  "AUDIT_OPINION",
  "CORRECTED_DISCLOSURE",
  "JPX_REMEDIATION_REPORT",
  "JPX_REMEDIATION_STATUS_REPORT",
  "TOB_DEADLINE",
  "CORPORATE_ACTION",
  "CERTIFICATION_OR_APPROVAL",
  "PROCUREMENT_OR_AWARD",
  "CAPACITY_OR_PRODUCTION_START",
  "REVIEW_CHECKPOINT",
  "OTHER",
] as const;

export type MarketEventType = (typeof MARKET_EVENT_TYPES)[number];

export const MARKET_EVENT_STATUSES = [
  "TENTATIVE",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "POSTPONED",
  "CANCELLED",
  "UNKNOWN_DATE",
] as const;

export type MarketEventStatus = (typeof MARKET_EVENT_STATUSES)[number];

export const MARKET_EVENT_PRIORITIES = ["S0", "S1", "S2", "S3"] as const;
export type MarketEventPriority = (typeof MARKET_EVENT_PRIORITIES)[number];

export const DECISION_STATES = ["BUY_WATCH", "WAIT", "BLOCK", "ABSTAIN", "INFO"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export const CONFIDENCE_STATES = ["CONFIRMED", "PARTIAL", "UNKNOWN"] as const;
export type ConfidenceState = (typeof CONFIDENCE_STATES)[number];

export const DELIVERY_CHANNELS = ["LINE", "WEB_PUSH", "GOOGLE_CALENDAR", "ICS_FEED", "IN_APP"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export const DELIVERY_STATES = ["PENDING", "PROCESSING", "DELIVERED", "FAILED", "DEAD_LETTER"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const SOURCE_TYPES = ["IR", "TDNET", "JPX", "EDINET", "REGULATOR", "COURT", "MAJOR_MEDIA", "OTHER"] as const;
export type EventSourceType = (typeof SOURCE_TYPES)[number];

export const STORAGE_CLASSES = [
  "METADATA_ONLY",
  "PUBLIC_OFFICIAL_DOCUMENT_PRIVATE_COPY",
  "LICENSED_LOCAL_ONLY",
  "LICENSED_CLOUD_PRIVATE_ALLOWED",
  "NO_PERSISTENCE",
] as const;
export type StorageClass = (typeof STORAGE_CLASSES)[number];

export const EVENT_CHANGE_TYPES = ["CREATED", "UPDATED", "POSTPONED", "CANCELLED", "COMPLETED"] as const;
export type EventChangeType = (typeof EVENT_CHANGE_TYPES)[number];

export const EVENT_TIME_PRECISIONS = ["EXACT", "DATE_ONLY", "WINDOW", "UNKNOWN"] as const;
export type EventTimePrecision = (typeof EVENT_TIME_PRECISIONS)[number];

export type EventTime = {
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  timezone: string;
  precision: EventTimePrecision;
  windowStart: string | null;
  windowEnd: string | null;
};

export type MarketEventIdentityInput = {
  issuerCode: string | null;
  issuerName: string;
  eventType: MarketEventType;
  /**
   * A stable occurrence label such as `FY2026-Q1` or
   * `third-party-committee-final-report-2026`. It must not change when the
   * scheduled date, issuer display name, or discovery source changes.
   */
  occurrenceKey: string;
};

export type MarketEvent = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  eventId: string;
  occurrenceKey: string;
  issuerCode: string | null;
  issuerName: string;
  eventType: MarketEventType;
  title: string;
  status: MarketEventStatus;
  priority: MarketEventPriority;
  time: EventTime;
  edgeTypes: string[];
  currentDecisionState: DecisionState;
  whyItMatters: string;
  checksBefore: string[];
  checksAfter: string[];
  relatedEventIds: string[];
  lastVerifiedAt: string;
  staleAfter: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventRevision = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  revisionId: string;
  eventId: string;
  revisionNumber: number;
  observedAt: string;
  publishedAt: string | null;
  effectiveAt: string | null;
  firstExecutableAt: string | null;
  changeType: EventChangeType;
  facts: Record<string, unknown>;
  sourceIds: string[];
  previousRevisionId: string | null;
};

export type EventSource = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  sourceId: string;
  eventId: string;
  authority: string;
  sourceType: EventSourceType;
  url: string;
  title: string;
  publishedAt: string | null;
  retrievedAt: string;
  contentHash: string;
  storageClass: StorageClass;
  objectKey: string | null;
};

export type DecisionSnapshot = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  decisionSnapshotId: string;
  eventId: string;
  revisionId: string;
  decisionState: DecisionState;
  confidenceState: ConfidenceState;
  reasons: string[];
  invalidationConditions: string[];
  createdAt: string;
};

export type DeliveryOutboxItem = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  deliveryId: string;
  deliveryKey: string;
  eventId: string;
  revisionId: string;
  channel: DeliveryChannel;
  state: DeliveryState;
  payload: Record<string, unknown>;
  scheduledAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketEventBundle = {
  event: MarketEvent;
  revision: EventRevision;
  sources: EventSource[];
  decisionSnapshot: DecisionSnapshot | null;
  deliveries: DeliveryOutboxItem[];
};

function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeOccurrenceKey(value: string): string {
  return normalizeIdentityText(value).toLocaleLowerCase("en-US");
}

function normalizeIssuerCode(value: string): string {
  return normalizeIdentityText(value).toUpperCase();
}
function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  const sorted = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) => {
    const keyOrder = ak.localeCompare(bk);
    return keyOrder !== 0 ? keyOrder : av.localeCompare(bv);
  });
  url.search = "";
  for (const [key, child] of sorted) url.searchParams.append(key, child);
  return url.toString();
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) throw new Error("Stable ID input must not contain undefined");

  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Stable ID input must contain finite numbers only");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error(`Unsupported stable ID value type: ${typeof value}`);
  }

  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Stable ID input must contain plain objects only");
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`);
  return `{${entries.join(",")}}`;
}

function stableId(prefix: string, value: unknown): string {
  const digest = createHash("sha256").update(canonicalize(value)).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

export function buildEventId(input: MarketEventIdentityInput): string {
  const issuerCode = input.issuerCode ? normalizeIssuerCode(input.issuerCode) : null;
  const issuerName = normalizeIdentityText(input.issuerName);
  const occurrenceKey = normalizeOccurrenceKey(input.occurrenceKey);
  if (!issuerCode && !issuerName) throw new Error("issuerCode or issuerName is required");
  if (!occurrenceKey) throw new Error("occurrenceKey is required for stable event identity");

  return stableId("evt", {
    issuerIdentity: issuerCode ? `code:${issuerCode}` : `name:${issuerName}`,
    eventType: input.eventType,
    occurrenceKey,
  });
}

export function buildRevisionId(input: {
  eventId: string;
  revisionNumber: number;
  facts: Record<string, unknown>;
  sourceIds: string[];
}): string {
  if (!Number.isInteger(input.revisionNumber) || input.revisionNumber < 1) {
    throw new Error("revisionNumber must be a positive integer");
  }
  return stableId("rev", {
    eventId: input.eventId,
    revisionNumber: input.revisionNumber,
    facts: input.facts,
    sourceIds: [...new Set(input.sourceIds)].sort(),
  });
}

export function buildSourceId(input: {
  authority: string;
  url: string;
  publishedAt: string | null;
  contentHash: string;
}): string {
  return stableId("src", {
    authority: normalizeIdentityText(input.authority).toUpperCase(),
    url: normalizeUrl(input.url),
    publishedAt: input.publishedAt,
    contentHash: input.contentHash.trim().toLowerCase(),
  });
}

export function buildDecisionSnapshotId(input: {
  eventId: string;
  revisionId: string;
  decisionState: DecisionState;
  confidenceState: ConfidenceState;
  createdAt: string;
}): string {
  return stableId("dec", input);
}

export function buildDeliveryId(input: {
  eventId: string;
  revisionId: string;
  channel: DeliveryChannel;
  deliveryKey: string;
  scheduledAt: string;
}): string {
  return stableId("dlv", {
    ...input,
    deliveryKey: normalizeOccurrenceKey(input.deliveryKey),
  });
}

export function buildReviewTaskId(input: {
  eventId: string;
  taskType: string;
  dueAt: string;
}): string {
  return stableId("tsk", {
    eventId: input.eventId,
    taskType: normalizeOccurrenceKey(input.taskType),
    dueAt: input.dueAt,
  });
}

function assertKnownValue<const T extends readonly string[]>(values: T, value: string, fieldName: string): asserts value is T[number] {
  if (!(values as readonly string[]).includes(value)) {
    throw new Error(`Unknown ${fieldName}: ${value}`);
  }
}

export function assertKnownMarketEventType(value: string): asserts value is MarketEventType {
  assertKnownValue(MARKET_EVENT_TYPES, value, "market event type");
}

function assertDateOnly(value: string, fieldName: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${fieldName} must be YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a real date`);
  }
}

export function assertIsoTimestamp(value: string, fieldName: string): void {
  try {
    parseExplicitIso8601Instant(value, fieldName);
  } catch {
    throw new Error(`${fieldName} must be a strict ISO timestamp with an explicit timezone offset or Z`);
  }
}

function assertExactTimestamp(value: string, fieldName: string): void {
  try {
    parseExplicitIso8601Instant(value, fieldName);
  } catch {
    throw new Error(`${fieldName} must be a strict ISO timestamp with an explicit timezone offset or Z`);
  }
}

export function assertValidEventTime(time: EventTime): void {
  if (!time.timezone.trim()) throw new Error("event timezone is required");
  assertKnownValue(EVENT_TIME_PRECISIONS, time.precision, "event time precision");

  if (time.precision === "UNKNOWN") {
    if (time.startAt !== null || time.endAt !== null || time.windowStart !== null || time.windowEnd !== null) {
      throw new Error("UNKNOWN event time must not contain invented dates");
    }
    if (time.allDay) throw new Error("UNKNOWN event time cannot be all-day");
    return;
  }

  if (time.precision === "WINDOW") {
    if (!time.windowStart || !time.windowEnd) throw new Error("WINDOW event time requires windowStart and windowEnd");
    assertDateOnly(time.windowStart, "windowStart");
    assertDateOnly(time.windowEnd, "windowEnd");
    if (time.windowStart > time.windowEnd) throw new Error("windowStart must be on or before windowEnd");
    if (time.startAt !== null || time.endAt !== null) {
      throw new Error("WINDOW event time must not pretend to have an exact start/end");
    }
    if (!time.allDay) throw new Error("WINDOW event time must be all-day");
    return;
  }

  if (time.windowStart !== null || time.windowEnd !== null) {
    throw new Error(`${time.precision} event time must not contain window dates`);
  }
  if (!time.startAt) throw new Error(`${time.precision} event time requires startAt`);

  if (time.precision === "DATE_ONLY") {
    assertDateOnly(time.startAt, "startAt");
    if (time.endAt !== null) assertDateOnly(time.endAt, "endAt");
    if (!time.allDay) throw new Error("DATE_ONLY event time must be all-day");
    if (time.endAt && time.endAt < time.startAt) throw new Error("endAt must be on or after startAt");
    return;
  }

  assertExactTimestamp(time.startAt, "startAt");
  if (time.endAt !== null) {
    assertExactTimestamp(time.endAt, "endAt");
    if (
      compareExplicitIso8601Instants(
        time.endAt,
        time.startAt,
        "endAt",
        "startAt",
      ) < 0
    ) {
      throw new Error("endAt must be on or after startAt");
    }
  }
  if (time.allDay) throw new Error("EXACT event time cannot be all-day");
}

export function validateMarketEventBundle(bundle: MarketEventBundle): void {
  const { event, revision, sources, decisionSnapshot, deliveries } = bundle;
  if (event.schemaVersion !== MARKET_EVENT_SCHEMA_VERSION) throw new Error("Unsupported event schemaVersion");
  if (!event.eventId.startsWith("evt_")) throw new Error("Invalid eventId");
  if (!event.occurrenceKey.trim()) throw new Error("occurrenceKey is required");
  if (!event.issuerName.trim()) throw new Error("issuerName is required");
  if (!event.title.trim()) throw new Error("title is required");
  assertKnownValue(MARKET_EVENT_TYPES, event.eventType, "eventType");
  assertKnownValue(MARKET_EVENT_STATUSES, event.status, "event status");
  assertKnownValue(MARKET_EVENT_PRIORITIES, event.priority, "event priority");
  assertKnownValue(DECISION_STATES, event.currentDecisionState, "decision state");
  assertValidEventTime(event.time);
  assertIsoTimestamp(event.lastVerifiedAt, "lastVerifiedAt");
  if (event.staleAfter !== null) assertIsoTimestamp(event.staleAfter, "staleAfter");
  assertIsoTimestamp(event.createdAt, "createdAt");
  assertIsoTimestamp(event.updatedAt, "updatedAt");

  if (revision.eventId !== event.eventId) throw new Error("revision eventId does not match event");
  if (!revision.revisionId.startsWith("rev_")) throw new Error("Invalid revisionId");
  if (!Number.isInteger(revision.revisionNumber) || revision.revisionNumber < 1) {
    throw new Error("revisionNumber must be a positive integer");
  }
  assertKnownValue(EVENT_CHANGE_TYPES, revision.changeType, "event change type");
  assertIsoTimestamp(revision.observedAt, "observedAt");
  for (const [fieldName, value] of [
    ["publishedAt", revision.publishedAt],
    ["effectiveAt", revision.effectiveAt],
    ["firstExecutableAt", revision.firstExecutableAt],
  ] as const) {
    if (value !== null) assertIsoTimestamp(value, fieldName);
  }

  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (source.eventId !== event.eventId) throw new Error("source eventId does not match event");
    if (!source.sourceId.startsWith("src_")) throw new Error("Invalid sourceId");
    if (sourceIds.has(source.sourceId)) throw new Error(`Duplicate sourceId in bundle: ${source.sourceId}`);
    sourceIds.add(source.sourceId);
    assertKnownValue(SOURCE_TYPES, source.sourceType, "source type");
    assertKnownValue(STORAGE_CLASSES, source.storageClass, "storage class");
    if (!source.url.startsWith("https://")) throw new Error("Source URL must use https");
    assertIsoTimestamp(source.retrievedAt, "retrievedAt");
    if (source.publishedAt !== null) assertIsoTimestamp(source.publishedAt, "publishedAt");
  }
  for (const sourceId of revision.sourceIds) {
    if (!sourceIds.has(sourceId)) throw new Error(`revision references a missing source: ${sourceId}`);
  }

  if (decisionSnapshot) {
    if (!decisionSnapshot.decisionSnapshotId.startsWith("dec_")) throw new Error("Invalid decisionSnapshotId");
    if (decisionSnapshot.eventId !== event.eventId || decisionSnapshot.revisionId !== revision.revisionId) {
      throw new Error("decision snapshot references the wrong event or revision");
    }
    assertKnownValue(DECISION_STATES, decisionSnapshot.decisionState, "decision state");
    assertKnownValue(CONFIDENCE_STATES, decisionSnapshot.confidenceState, "confidence state");
    assertIsoTimestamp(decisionSnapshot.createdAt, "decision createdAt");
  }

  const deliveryIds = new Set<string>();
  for (const delivery of deliveries) {
    if (!delivery.deliveryId.startsWith("dlv_")) throw new Error("Invalid deliveryId");
    if (deliveryIds.has(delivery.deliveryId)) throw new Error(`Duplicate deliveryId: ${delivery.deliveryId}`);
    deliveryIds.add(delivery.deliveryId);
    if (delivery.eventId !== event.eventId || delivery.revisionId !== revision.revisionId) {
      throw new Error("delivery references the wrong event or revision");
    }
    assertKnownValue(DELIVERY_CHANNELS, delivery.channel, "delivery channel");
    assertKnownValue(DELIVERY_STATES, delivery.state, "delivery state");
    if (!delivery.deliveryKey.trim()) throw new Error("deliveryKey is required");
    if (!Number.isInteger(delivery.attemptCount) || delivery.attemptCount < 0) {
      throw new Error("attemptCount must be a non-negative integer");
    }
    assertIsoTimestamp(delivery.scheduledAt, "scheduledAt");
    assertIsoTimestamp(delivery.createdAt, "delivery createdAt");
    assertIsoTimestamp(delivery.updatedAt, "delivery updatedAt");
    for (const [fieldName, value] of [
      ["lastAttemptAt", delivery.lastAttemptAt],
      ["deliveredAt", delivery.deliveredAt],
      ["leaseExpiresAt", delivery.leaseExpiresAt],
    ] as const) {
      if (value !== null) assertIsoTimestamp(value, fieldName);
    }
  }
}