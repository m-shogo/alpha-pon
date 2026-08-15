function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSourceHealthScoreRows<T>(value: unknown): { rows: T[]; valid: boolean } {
  if (!Array.isArray(value) || value.some(row => !isRecord(row))) {
    return { rows: [], valid: false };
  }
  return { rows: value as T[], valid: true };
}

export function normalizeSourceHealthObject<T extends object>(value: unknown): { value: T | null; valid: boolean } {
  if (!isRecord(value)) {
    return { value: null, valid: false };
  }

  for (const field of ["steps", "results", "completeWrapperFailedSteps"] as const) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      return { value: null, valid: false };
    }
  }

  for (const field of ["steps", "results"] as const) {
    const rows = value[field];
    if (Array.isArray(rows) && rows.some(row => !isRecord(row))) {
      return { value: null, valid: false };
    }
  }

  const failedSteps = value.completeWrapperFailedSteps;
  if (Array.isArray(failedSteps) && failedSteps.some(step => typeof step !== "string")) {
    return { value: null, valid: false };
  }

  return { value: value as T, valid: true };
}