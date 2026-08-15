export function normalizeSourceHealthScoreRows<T>(value: unknown): { rows: T[]; valid: boolean } {
  if (!Array.isArray(value)) return { rows: [], valid: false };
  return { rows: value as T[], valid: true };
}

export function normalizeSourceHealthObject<T extends object>(value: unknown): { value: T | null; valid: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value: null, valid: false };
  }

  const object = value as Record<string, unknown>;
  for (const field of ["steps", "results", "completeWrapperFailedSteps"] as const) {
    if (object[field] !== undefined && !Array.isArray(object[field])) {
      return { value: null, valid: false };
    }
  }

  return { value: value as T, valid: true };
}
