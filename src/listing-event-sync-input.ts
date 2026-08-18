import {
  readListingEventReviewInput,
  type ListingEventReviewInputRow,
} from "./listing-event-review-input.js";

export type ListingEventSyncExistingRow = ListingEventReviewInputRow;

export function readListingEventSyncExistingInput(path: string): {
  rows: ListingEventSyncExistingRow[];
  warnings: string[];
} {
  return readListingEventReviewInput(path);
}
