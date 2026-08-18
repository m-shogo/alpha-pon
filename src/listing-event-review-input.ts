import { readListingEventRows } from "./listing-event-alert-input.js";

export type ListingEventReviewInputRow = {
  id: string;
  code?: string;
  name: string;
  market?: string;
  eventType: string;
  eventDate?: string | null;
  source?: string;
  status?: string;
  notificationLevel?: "priority" | "morning_summary" | "log";
  whyWatch?: string;
  relatedPattern?: string;
  notes?: string[];
  evidenceToBackfill?: string[];
  publicPrice?: number | null;
  initialPrice?: number | null;
  reviewPrice?: number | null;
  topixRelativeReturn?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function isOptionalFiniteNumberOrNull(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isListingEventReviewInputRow(value: unknown): value is ListingEventReviewInputRow {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && value.id.trim().length > 0
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && typeof value.eventType === "string"
    && value.eventType.trim().length > 0
    && isOptionalString(value.code)
    && isOptionalString(value.market)
    && (value.eventDate === undefined || value.eventDate === null || typeof value.eventDate === "string")
    && isOptionalString(value.source)
    && isOptionalString(value.status)
    && (value.notificationLevel === undefined
      || value.notificationLevel === "priority"
      || value.notificationLevel === "morning_summary"
      || value.notificationLevel === "log")
    && isOptionalString(value.whyWatch)
    && isOptionalString(value.relatedPattern)
    && isOptionalStringArray(value.notes)
    && isOptionalStringArray(value.evidenceToBackfill)
    && isOptionalFiniteNumberOrNull(value.publicPrice)
    && isOptionalFiniteNumberOrNull(value.initialPrice)
    && isOptionalFiniteNumberOrNull(value.reviewPrice)
    && isOptionalFiniteNumberOrNull(value.topixRelativeReturn);
}

export function readListingEventReviewInput(path: string): {
  rows: ListingEventReviewInputRow[];
  warnings: string[];
} {
  return readListingEventRows<ListingEventReviewInputRow>(path, isListingEventReviewInputRow);
}
