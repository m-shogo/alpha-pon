import { addDaysJst } from "./date.js";

export function isValidWorldThemeReviewDueDate(date: string | null | undefined): date is string {
  if (!date) return false;
  try {
    return addDaysJst(date, 0) === date;
  } catch {
    return false;
  }
}
