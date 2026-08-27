import { addDaysJst } from "./date.js";
import { listingPerformanceReviewDate } from "./listing-performance-date.js";

export type ListingReviewTargetEvent = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate?: string | null;
  publicPrice?: number | null;
  initialPrice?: number | null;
};

export type ListingReviewTarget<T extends ListingReviewTargetEvent> = {
  event: T;
  horizon: "30d" | "90d";
  reviewDate: string;
};

export function listingReviewTargetsDueBy<T extends ListingReviewTargetEvent>(
  events: T[],
  asOf: string,
): ListingReviewTarget<T>[] {
  if (addDaysJst(asOf, 0) !== asOf) {
    throw new Error("listing review asOf must be a real YYYY-MM-DD date");
  }

  const targets: ListingReviewTarget<T>[] = [];
  for (const event of events) {
    if (event.eventType !== "listing_day" || !event.code || !event.eventDate) continue;
    for (const days of [30, 90] as const) {
      const reviewDate = listingPerformanceReviewDate(event.eventDate, days);
      if (!reviewDate || reviewDate > asOf) continue;
      targets.push({ event, horizon: `${days}d`, reviewDate });
    }
  }
  return targets;
}
