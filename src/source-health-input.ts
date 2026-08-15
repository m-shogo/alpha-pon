export function normalizeSourceHealthScoreRows<T>(value: unknown): { rows: T[]; valid: boolean } {
  if (!Array.isArray(value)) return { rows: [], valid: false };
  return { rows: value as T[], valid: true };
}

export function normalizeSourceHealthObject<T extends object>(value: unknown): { value: T | null; valid: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value: null, valid: false };
  }
  return { value: value as T, valid: true };
}
