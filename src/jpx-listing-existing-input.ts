import { readListingEventReviewInput, type ListingEventReviewInputRow } from "./listing-event-review-input.js";

export type JpxListingExistingInput = ListingEventReviewInputRow;

export function readJpxListingExistingInput(path: string): {
  rows: JpxListingExistingInput[];
  warnings: string[];
} {
  return readListingEventReviewInput(path);
}
