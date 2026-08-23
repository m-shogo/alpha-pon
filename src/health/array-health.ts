import { isStockProCommitteeDecision } from "../stock-pro-committee-input.js";

export function normalizeHealthArray<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T[] | null {
  return Array.isArray(value) && value.every(isStockProCommitteeDecision) ? value as T[] : null;
}
