import { addDaysJst } from "./date.js";

export function listingPerformanceReviewDate(
  date: string | null | undefined,
  days: number
): string | null {
  if (!date) return null;
  try {
    return addDaysJst(date, days);
  } catch {
    return null;
  }
}
