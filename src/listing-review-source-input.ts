import { readListingEventReviewInput, type ListingEventReviewInputRow } from "./listing-event-review-input.js";

export type ListingReviewSourceInput = {
  events: ListingEventReviewInputRow[];
  warnings: string[];
};

export function readListingReviewSourceInput(path: string): ListingReviewSourceInput {
  const { rows, warnings } = readListingEventReviewInput(path);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  const duplicateIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();
  const events = duplicateIds.length === 0
    ? rows
    : rows.filter(row => counts.get(row.id) === 1);

  return {
    events,
    warnings: duplicateIds.length === 0
      ? warnings
      : [...warnings, `${path}: duplicate_ids=${duplicateIds.join(",")}`],
  };
}