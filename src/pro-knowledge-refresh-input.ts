import { addDaysJst } from "./date.js";

export function isUsableProKnowledgeRegimeAsOf(value: unknown, today: string): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= today;
  } catch {
    return false;
  }
}
