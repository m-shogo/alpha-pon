import { addDaysJst } from "./date.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUsableProKnowledgeRegimeAsOf(value: unknown, today: string): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= today;
  } catch {
    return false;
  }
}

export function isUsableProKnowledgeActiveRegimes(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every(item => {
    if (!isRecord(item)) return false;
    if (typeof item.id !== "string" || item.id.trim() === "" || item.id !== item.id.trim()) return false;
    return item.level === undefined || typeof item.level === "string";
  });
}
