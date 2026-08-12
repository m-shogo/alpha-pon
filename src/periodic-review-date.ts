import { addDaysJst } from "./date.js";

export type PeriodicReviewPeriod = "weekly" | "monthly";

export function periodicReviewStart(date: string, period: PeriodicReviewPeriod): string {
  return addDaysJst(date, period === "weekly" ? -7 : -30);
}
