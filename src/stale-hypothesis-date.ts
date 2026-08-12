import { daysSinceJst } from "./date.js";

export function staleHypothesisAgeDays(dateText?: string): number | null {
  if (!dateText) return null;
  return daysSinceJst(dateText);
}
