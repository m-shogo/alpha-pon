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
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRealJstDate(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function hasValidNestedReviewDates(row: Record<string, unknown>): boolean {
  if (row.reviewDueAt != null && !isRealJstDate(row.reviewDueAt)) return false;
  if (row.outcomes === undefined) return true;
  if (!Array.isArray(row.outcomes)) return false;
  return row.outcomes.every(outcome => {
    if (typeof outcome !== "object" || outcome === null || Array.isArray(outcome)) return false;
    return isRealJstDate((outcome as Record<string, unknown>).dueAt);
  });
}

function isWorldImpactReviewRow(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!isNonEmptyString(row.reviewKey)
    || !isNonEmptyString(row.eventId)
    || !isRealJstDate(row.eventDate)
    || !isRealJstDate(row.createdAt)
    || !isRealJstDate(row.updatedAt)
    || !hasValidNestedReviewDates(row)) {
    return false;
  }
  return row.updatedAt >= row.createdAt;
}

export function resolveWorldImpactReportInput(
  latest: WorldImpactLatestSnapshotInput,
  jsonlReviews: WorldEventImpactReview[],
  today: string,
): WorldImpactReportInputResolution {
  if (!latest.present) {
    return { reviews: jsonlReviews, latestSnapshotError: false };
  }

  if ("parseError" in latest || !Array.isArray(latest.parsed)) {
    return { reviews: [], latestSnapshotError: true };
  }

  if (latest.parsed.some(item => !isWorldImpactReviewRow(item))) {
    return { reviews: [], latestSnapshotError: true };
  }

  return {
    reviews: latest.parsed.map(item => normalizeWorldImpactReview(item, today)),
    latestSnapshotError: false,
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

export function assertWorldImpactLatestSnapshotHealthy(
  latestSnapshotError: boolean,
  consumer: string,
): void {
  if (!latestSnapshotError) return;
  throw new Error(
    `${consumer}: data/world_event_impacts_latest.json is malformed; refusing silent fallback`,
  );
}
