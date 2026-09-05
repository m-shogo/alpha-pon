import {
  assertIsoTimestamp,
  assertKnownMarketEventType,
  assertValidEventTime,
  type EventTime,
  type MarketEventType,
} from "./contracts.js";
import type { TdnetMarketEventCandidate } from "./tdnet-event-candidates.js";
import { compareExplicitIso8601Instants } from "../research/iso-instant.js";

export const TDNET_PRIMARY_REVIEW_OUTCOMES = [
  "FUTURE_EVENT_CONFIRMED",
  "NOT_A_FUTURE_EVENT",
  "INSUFFICIENT_EVIDENCE",
] as const;

export type TdnetPrimaryReviewOutcome = (typeof TDNET_PRIMARY_REVIEW_OUTCOMES)[number];

export const TDNET_PRIMARY_REVIEW_BLOCKERS = [
  "primary_review_not_confirmed",
  "event_type_missing",
  "stable_occurrence_key_missing",
  "future_event_time_missing",
  "source_content_hash_missing",
  "source_retrieved_at_missing",
] as const;

export type TdnetPrimaryReviewBlocker = (typeof TDNET_PRIMARY_REVIEW_BLOCKERS)[number];

export type TdnetPrimaryReviewDecision = {
  candidateId: string;
  reviewedAt: string;
  outcome: TdnetPrimaryReviewOutcome;
  eventType: MarketEventType | null;
  occurrenceKey: string | null;
  time: EventTime | null;
  sourceContentHash: string | null;
  sourceRetrievedAt: string | null;
  notes: string[];
};

export type TdnetPrimaryReviewAssessment = {
  candidateId: string;
  outcome: TdnetPrimaryReviewOutcome;
  registrationPreviewReady: boolean;
  blockers: TdnetPrimaryReviewBlocker[];
  warnings: string[];
  normalized: TdnetPrimaryReviewDecision;
};

function normalizeNotes(notes: string[]): string[] {
  return [...new Set(notes.map(note => note.trim()).filter(Boolean))];
}

function hasRegistrationFacts(decision: TdnetPrimaryReviewDecision): boolean {
  return decision.eventType !== null
    || decision.occurrenceKey !== null
    || decision.time !== null
    || decision.sourceContentHash !== null
    || decision.sourceRetrievedAt !== null;
}

function normalizeDecision(decision: TdnetPrimaryReviewDecision): TdnetPrimaryReviewDecision {
  if (!decision.candidateId) throw new Error("candidateId is required");
  if (decision.candidateId.trim() !== decision.candidateId) {
    throw new Error("candidateId must be canonical without surrounding whitespace");
  }
  if (!(TDNET_PRIMARY_REVIEW_OUTCOMES as readonly string[]).includes(decision.outcome)) {
    throw new Error(`Unknown TDnet primary review outcome: ${decision.outcome}`);
  }
  assertIsoTimestamp(decision.reviewedAt, "reviewedAt");

  const eventType = decision.eventType;
  if (eventType !== null) assertKnownMarketEventType(eventType);

  const occurrenceKey = decision.occurrenceKey?.trim() || null;
  const sourceContentHash = decision.sourceContentHash;
  const sourceRetrievedAt = decision.sourceRetrievedAt;
  if (sourceRetrievedAt !== null) assertIsoTimestamp(sourceRetrievedAt, "sourceRetrievedAt");
  if (decision.time !== null) assertValidEventTime(decision.time);

  return {
    ...decision,
    candidateId: decision.candidateId,
    eventType,
    occurrenceKey,
    sourceContentHash,
    sourceRetrievedAt,
    notes: normalizeNotes(decision.notes),
  };
}

function dateAtTimezone(instant: string, timezone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(instant));
  } catch {
    throw new Error(`Invalid EventTime timezone: ${timezone}`);
  }
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not derive reviewedAt calendar date");
  return `${year}-${month}-${day}`;
}

function assertConfirmedEventHasFutureHorizon(decision: TdnetPrimaryReviewDecision): void {
  if (decision.outcome !== "FUTURE_EVENT_CONFIRMED" || decision.time === null) return;

  const time = decision.time;
  const reviewedDate = dateAtTimezone(decision.reviewedAt, time.timezone);
  if (time.precision === "EXACT" && time.startAt !== null) {
    if (
      compareExplicitIso8601Instants(
        time.startAt,
        decision.reviewedAt,
        "time.startAt",
        "reviewedAt",
      ) <= 0
    ) {
      throw new Error("FUTURE_EVENT_CONFIRMED exact EventTime must be after reviewedAt");
    }
    return;
  }

  if (time.precision === "DATE_ONLY" && time.startAt !== null) {
    if (time.startAt <= reviewedDate) {
      throw new Error("FUTURE_EVENT_CONFIRMED DATE_ONLY EventTime must start after reviewedAt date");
    }
    return;
  }

  if (time.precision === "WINDOW" && time.windowStart !== null) {
    if (time.windowStart <= reviewedDate) {
      throw new Error("FUTURE_EVENT_CONFIRMED WINDOW EventTime must start after reviewedAt date");
    }
  }
}

export function assessTdnetPrimaryReview(
  candidate: TdnetMarketEventCandidate,
  input: TdnetPrimaryReviewDecision,
): TdnetPrimaryReviewAssessment {
  const decision = normalizeDecision(input);
  if (decision.candidateId !== candidate.candidateId) {
    throw new Error(`TDnet review candidateId mismatch: expected ${candidate.candidateId}`);
  }

  assertIsoTimestamp(candidate.disclosurePublishedAt, "candidate.disclosurePublishedAt");
  if (
    compareExplicitIso8601Instants(
      decision.reviewedAt,
      candidate.disclosurePublishedAt,
      "reviewedAt",
      "candidate.disclosurePublishedAt",
    ) < 0
  ) {
    throw new Error("reviewedAt must be on or after disclosurePublishedAt");
  }

  if (decision.sourceRetrievedAt !== null) {
    if (
      compareExplicitIso8601Instants(
        decision.sourceRetrievedAt,
        candidate.disclosurePublishedAt,
        "sourceRetrievedAt",
        "candidate.disclosurePublishedAt",
      ) < 0
    ) {
      throw new Error("sourceRetrievedAt must be on or after disclosurePublishedAt");
    }
    if (
      compareExplicitIso8601Instants(
        decision.reviewedAt,
        decision.sourceRetrievedAt,
        "reviewedAt",
        "sourceRetrievedAt",
      ) < 0
    ) {
      throw new Error("reviewedAt must be on or after sourceRetrievedAt");
    }
  }

  if (decision.outcome !== "FUTURE_EVENT_CONFIRMED") {
    if (hasRegistrationFacts(decision)) {
      throw new Error(`${decision.outcome} must not carry registration facts`);
    }
    return {
      candidateId: candidate.candidateId,
      outcome: decision.outcome,
      registrationPreviewReady: false,
      blockers: ["primary_review_not_confirmed"],
      warnings: [],
      normalized: decision,
    };
  }

  assertConfirmedEventHasFutureHorizon(decision);

  const blockers: TdnetPrimaryReviewBlocker[] = [];
  if (decision.eventType === null) blockers.push("event_type_missing");
  if (decision.occurrenceKey === null) blockers.push("stable_occurrence_key_missing");
  if (decision.time === null || decision.time.precision === "UNKNOWN") blockers.push("future_event_time_missing");
  if (decision.sourceContentHash === null) blockers.push("source_content_hash_missing");
  if (decision.sourceRetrievedAt === null) blockers.push("source_retrieved_at_missing");

  if (decision.sourceContentHash !== null && !/^[0-9a-f]{64}$/.test(decision.sourceContentHash)) {
    throw new Error("sourceContentHash must be a 64-character lowercase hex SHA-256");
  }

  const warnings: string[] = [];
  if (
    candidate.eventTypeHint !== null
    && decision.eventType !== null
    && candidate.eventTypeHint !== decision.eventType
  ) {
    warnings.push(`review eventType ${decision.eventType} differs from advisory title hint ${candidate.eventTypeHint}`);
  }

  return {
    candidateId: candidate.candidateId,
    outcome: decision.outcome,
    registrationPreviewReady: blockers.length === 0,
    blockers,
    warnings,
    normalized: decision,
  };
}
