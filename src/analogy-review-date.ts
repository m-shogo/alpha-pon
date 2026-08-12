import { addDaysJst } from "./date.js";

export type AnalogyReviewTimeframe = "1d" | "1w" | "1m";

export function analogyReviewDueDate(date: string, timeframe: AnalogyReviewTimeframe): string {
  const days = timeframe === "1d" ? 1 : timeframe === "1w" ? 7 : 30;
  return addDaysJst(date, days);
}
