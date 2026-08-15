import { addDaysJst } from "./date.js";
import type { WorldEventImpactReview } from "./world-impact.js";

function isRealJstDate(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function assertOptionalRealDate(row: Record<string, unknown>, field: string, rowLabel: string): void {
  const value = row[field];
  if (value === undefined || value === null) return;
  if (!isRealJstDate(value)) {
    throw new Error(`${rowLabel} ${field} must be a real YYYY-MM-DD date`);
  }
}

function assertOptionalEvaluationProvenance(row: Record<string, unknown>, rowLabel: string): void {
  for (const field of ["eventDate", "createdAt", "updatedAt", "reviewDueAt"]) {
    assertOptionalRealDate(row, field, rowLabel);
  }

  const createdAt = row.createdAt;
  const updatedAt = row.updatedAt;
  if (typeof createdAt === "string" && typeof updatedAt === "string" && updatedAt < createdAt) {
    throw new Error(`${rowLabel} updatedAt must not precede createdAt`);
  }

  if (row.outcomes === undefined || row.outcomes === null) return;
  if (!Array.isArray(row.outcomes)) {
    throw new Error(`${rowLabel} outcomes must be an array when present`);
  }

  const seenHorizons = new Set<string>();
  row.outcomes.forEach((value, outcomeIndex) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${rowLabel} outcome ${outcomeIndex + 1} must be an object`);
    }
    const outcome = value as Record<string, unknown>;
    const horizon = outcome.horizon;
    if (horizon === "1d" || horizon === "1w" || horizon === "1m") {
      if (seenHorizons.has(horizon)) {
        throw new Error(`${rowLabel} duplicate outcome horizon: ${horizon}`);
      }
      seenHorizons.add(horizon);
    }
    for (const field of ["dueAt", "evaluatedAt", "evaluationAsOf", "priceStartDate", "priceEndDate"]) {
      assertOptionalRealDate(outcome, field, `${rowLabel} outcome ${outcomeIndex + 1}`);
    }

    const priceStartDate = outcome.priceStartDate;
    const priceEndDate = outcome.priceEndDate;
    const evaluationAsOf = outcome.evaluationAsOf;
    const evaluatedAt = outcome.evaluatedAt;
    if (typeof priceStartDate === "string" && typeof priceEndDate === "string" && priceStartDate > priceEndDate) {
      throw new Error(`${rowLabel} outcome ${outcomeIndex + 1} priceStartDate must not follow priceEndDate`);
    }
    if (typeof priceEndDate === "string" && typeof evaluationAsOf === "string" && priceEndDate > evaluationAsOf) {
      throw new Error(`${rowLabel} outcome ${outcomeIndex + 1} priceEndDate must not follow evaluationAsOf`);
    }
    if (typeof evaluationAsOf === "string" && typeof evaluatedAt === "string" && evaluationAsOf > evaluatedAt) {
      throw new Error(`${rowLabel} outcome ${outcomeIndex + 1} evaluationAsOf must not follow evaluatedAt`);
    }
  });
}

export function parseWorldImpactLatestSnapshot(raw: string): WorldEventImpactReview[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`World Impact latest snapshot is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("World Impact latest snapshot root must be an array");
  }

  const seenReviewKeys = new Set<string>();
  parsed.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`World Impact latest snapshot row ${index + 1} must be an object`);
    }
    const row = item as Record<string, unknown>;
    const reviewKey = row.reviewKey;
    if (typeof reviewKey !== "string" || reviewKey.trim() === "") {
      throw new Error(`World Impact latest snapshot row ${index + 1} requires reviewKey`);
    }
    if (seenReviewKeys.has(reviewKey)) {
      throw new Error(`World Impact latest snapshot duplicate reviewKey: ${reviewKey}`);
    }
    seenReviewKeys.add(reviewKey);
    assertOptionalEvaluationProvenance(row, `World Impact latest snapshot row ${index + 1}`);
  });

  return parsed as WorldEventImpactReview[];
}
