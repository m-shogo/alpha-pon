import { createHash } from "node:crypto";

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

export const DECISION_STATES = [
  "BUY_WATCH",
  "WAIT",
  "BLOCK",
  "ABSTAIN",
  "INFO",
] as const;

export type DecisionState = (typeof DECISION_STATES)[number];

export const DELIVERY_CHANNELS = [
  "LINE",
  "WEB_PUSH",
  "GOOGLE_CALENDAR",
  "IN_APP",
] as const;

export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

export type EventTime = {
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  timezone: string;
  precision: "EXACT" | "DATE_ONLY" | "WINDOW" | "UNKNOWN";
  windowStart: string | null;
  windowEnd: string | null;
};

export type MarketEventIdentityInput = {
  issuerCode: string | null;
  issuerName: string;
  eventType: MarketEventType;
  externalAuthority: string;
  externalKey: string | null;
  /**
   * Stable occurrence label such as "FY2026-Q1" or
   * "third-party-committee-final-report-2026". It must not be replaced when
   * the scheduled date changes.
   */
  occurrenceKey: string;
};

export type MarketEvent = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  eventId: string;
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
  changeType: "CREATED" | "UPDATED" | "POSTPONED" | "CANCELLED" | "COMPLETED";
  facts: Record<string, unknown>;
  sourceIds: string[];
  previousRevisionId: string | null;
};

export type EventSource = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  sourceId: string;
  eventId: string;
  authority: string;
  sourceType: "IR" | "TDNET" | "JPX" | "EDINET" | "REGULATOR" | "COURT" | "MAJOR_MEDIA" | "OTHER";
  url: string;
  title: string;
  publishedAt: string | null;
  retrievedAt: string;
  contentHash: string;
  storageClass: "METADATA_ONLY" | "PUBLIC_OFFICIAL_DOCUMENT_PRIVATE_COPY" | "LICENSED_LOCAL_ONLY" | "NO_PERSISTENCE";
  objectKey: string | null;
};

export type DeliveryOutboxItem = {
  schemaVersion: typeof MARKET_EVENT_SCHEMA_VERSION;
  deliveryId: string;
  eventId: string;
  revisionId: string;
  channel: DeliveryChannel;
  state: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";
  scheduledAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

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
  const occurrenceKey = input.occurrenceKey.trim();
  if (!occurrenceKey) throw new Error("occurrenceKey is required for stable event identity");

  return stableId("evt", {
    issuerCode: input.issuerCode?.trim() || null,
    issuerName: input.issuerName.trim(),
    eventType: input.eventType,
    externalAuthority: input.externalAuthority.trim(),
    externalKey: input.externalKey?.trim() || null,
    occurrenceKey,
  });
}

export function buildRevisionId(input: {
  eventId: string;
  revisionNumber: number;
  facts: Record<string, unknown>;
  sourceIds: string[];
}): string {
  return stableId("rev", {
    eventId: input.eventId,
    revisionNumber: input.revisionNumber,
    facts: input.facts,
    sourceIds: [...input.sourceIds].sort(),
  });
}

export function buildSourceId(input: {
  authority: string;
  url: string;
  publishedAt: string | null;
  contentHash: string;
}): string {
  return stableId("src", input);
}

export function buildDeliveryId(input: {
  eventId: string;
  revisionId: string;
  channel: DeliveryChannel;
  scheduledAt: string;
}): string {
  return stableId("dlv", input);
}

export function assertKnownMarketEventType(value: string): asserts value is MarketEventType {
  if (!(MARKET_EVENT_TYPES as readonly string[]).includes(value)) {
    throw new Error(`Unknown market event type: ${value}`);
  }
}

export function assertValidEventTime(time: EventTime): void {
  if (time.precision === "UNKNOWN") {
    if (time.startAt !== null || time.endAt !== null || time.windowStart !== null || time.windowEnd !== null) {
      throw new Error("UNKNOWN event time must not contain invented dates");
    }
    return;
  }

  if (time.precision === "WINDOW") {
    if (!time.windowStart || !time.windowEnd) {
      throw new Error("WINDOW event time requires windowStart and windowEnd");
    }
    if (time.startAt !== null || time.endAt !== null) {
      throw new Error("WINDOW event time must not pretend to have an exact start/end");
    }
    return;
  }

  if (!time.startAt) throw new Error(`${time.precision} event time requires startAt`);
}
