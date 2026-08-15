export function normalizeSourceHealthScoreRows<T>(value: unknown): { rows: T[]; valid: boolean } {
  if (!Array.isArray(value)) return { rows: [], valid: false };
  return { rows: value as T[], valid: true };
}
