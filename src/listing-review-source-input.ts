import { readListingEventReviewInput, type ListingEventReviewInputRow } from "./listing-event-review-input.js";

export type ListingReviewSourceInput = {
  events: ListingEventReviewInputRow[];
  warnings: string[];
};

export function readListingReviewSourceInput(path: string): ListingReviewSourceInput {
  const { rows, warnings } = readListingEventReviewInput(path);
  return { events: rows, warnings };
}
