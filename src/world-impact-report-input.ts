import { addDaysJst } from "./date.js";
import {
  normalizeWorldImpactReview,
  type WorldImpactAudit,
  type WorldEventImpactReview,
} from "./world-impact.js";

export type WorldImpactLatestSnapshotInput =
  | { present: false }
  | { present: true; parsed: unknown }
  | { present: true; parseError: true };

export type WorldImpactReportInputResolution = {
  reviews: WorldEventImpactReview[];
  latestSnapshotError: boolean;
  jsonlFallbackError: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCanonicalIdentity(value: unknown): value is string {
  return isNonEmptyString(value) && value.trim() === value;
}

function isRealJstDate(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isNullableRealJstDate(value: unknown): boolean {
  return value == null || isRealJstDate(value);
}

function hasValidEvaluationChronology(nested: Record<string, unknown>): boolean {
  const priceStartDate = nested.priceStartDate as string | null | undefined;
  const priceEndDate = nested.priceEndDate as string | null | undefined;
  const evaluationAsOf = nested.evaluationAsOf as string | null | undefined;
  const evaluatedAt = nested.evaluatedAt as string | null | undefined;

  if (priceStartDate != null && priceEndDate != null && priceStartDate > priceEndDate) return false;
  if (priceEndDate != null && evaluationAsOf != null && priceEndDate > evaluationAsOf) return false;
  if (evaluationAsOf != null && evaluatedAt != null && evaluationAsOf > evaluatedAt) return false;
  return true;
}

function isNullableDateAtOrBefore(value: unknown, today: string): boolean {
  return value == null || (isRealJstDate(value) && value <= today);
}

function hasValidNestedReviewDates(row: Record<string, unknown>, today: string): boolean {
  if (row.reviewDueAt != null && !isRealJstDate(row.reviewDueAt)) return false;
  if (row.outcomes === undefined) return true;
  if (!Array.isArray(row.outcomes)) return false;
  return row.outcomes.every(outcome => {
    if (typeof outcome !== "object" || outcome === null || Array.isArray(outcome)) return false;
    const nested = outcome as Record<string, unknown>;
    return isRealJstDate(nested.dueAt)
      && isNullableDateAtOrBefore(nested.evaluatedAt, today)
      && isNullableDateAtOrBefore(nested.evaluationAsOf, today)
      && isNullableRealJstDate(nested.priceStartDate)
      && isNullableDateAtOrBefore(nested.priceEndDate, today)
      && hasValidEvaluationChronology(nested);
  });
}

function isWorldImpactReviewRow(value: unknown, today: string): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!isCanonicalIdentity(row.reviewKey)
    || !isCanonicalIdentity(row.eventId)
    || !isRealJstDate(row.eventDate)
    || !isRealJstDate(row.createdAt)
    || !isRealJstDate(row.updatedAt)
    || row.createdAt > today
    || row.updatedAt > today
    || !hasValidNestedReviewDates(row, today)) {
    return false;
  }
  return row.updatedAt >= row.createdAt;
}

function hasDuplicateReviewKeys(rows: ReadonlyArray<Record<string, unknown>>): boolean {
  const keys = rows.map(row => row.reviewKey as string);
  return new Set(keys).size !== keys.length;
}

export function resolveWorldImpactReportInput(
  latest: WorldImpactLatestSnapshotInput,
  jsonlReviews: WorldEventImpactReview[],
  today: string,
): WorldImpactReportInputResolution {
  if (!latest.present) {
    if (jsonlReviews.some(review => !isWorldImpactReviewRow(review, today))
      || hasDuplicateReviewKeys(jsonlReviews)) {
      return { reviews: [], latestSnapshotError: false, jsonlFallbackError: true };
    }
    return { reviews: jsonlReviews, latestSnapshotError: false, jsonlFallbackError: false };
  }

  if ("parseError" in latest || !Array.isArray(latest.parsed)) {
    return { reviews: [], latestSnapshotError: true, jsonlFallbackError: false };
  }

  if (latest.parsed.some(item => !isWorldImpactReviewRow(item, today))) {
    return { reviews: [], latestSnapshotError: true, jsonlFallbackError: false };
  }

  const rows = latest.parsed as Record<string, unknown>[];
  if (hasDuplicateReviewKeys(rows)) {
    return { reviews: [], latestSnapshotError: true, jsonlFallbackError: false };
  }

  return {
    reviews: rows.map(item => normalizeWorldImpactReview(item, today)),
    latestSnapshotError: false,
    jsonlFallbackError: false,
  };
}

export function applyWorldImpactLatestSnapshotError(
  audit: WorldImpactAudit,
  latestSnapshotError: boolean,
): void {
  if (!latestSnapshotError) return;
  audit.healthStatus = "action_required";
  audit.priorityIssues.unshift({
    severity: "urgent",
    category: "latest_snapshot",
    title: "world impact latest snapshot が不正です",
    detail: "data/world_event_impacts_latest.json を修復してから read-only output を正本として扱ってください。JSONL への silent fallback は行いません。",
  });
}

export function applyWorldImpactJsonlFallbackError(
  audit: WorldImpactAudit,
  jsonlFallbackError: boolean,
): void {
  if (!jsonlFallbackError) return;
  audit.healthStatus = "action_required";
  audit.priorityIssues.unshift({
    severity: "urgent",
    category: "jsonl_fallback",
    title: "world impact JSONL fallback が不正です",
    detail: "canonical latest が存在しない状態で data/world_event_impacts.jsonl に不正rowがあります。修復するまで read-only fallback を正本として扱いません。",
  });
}

export function assertWorldImpactLatestSnapshotHealthy(
  latestSnapshotError: boolean,
  consumer: string,
): void {
  if (!latestSnapshotError) return;
  throw new Error(
    `${consumer}: data/world_event_impacts_latest.json is malformed; refusing silent fallback`,
  );
}

export function assertWorldImpactJsonlFallbackHealthy(
  jsonlFallbackError: boolean,
  consumer: string,
): void {
  if (!jsonlFallbackError) return;
  throw new Error(
    `${consumer}: data/world_event_impacts.jsonl contains malformed fallback rows; refusing read-only fallback`,
  );
}
