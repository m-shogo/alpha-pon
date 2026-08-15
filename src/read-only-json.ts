export function normalizeReadOnlyJsonArray<T>(value: unknown): {
  rows: T[];
  invalidRoot: boolean;
} {
  if (value === null || value === undefined) return { rows: [], invalidRoot: false };
  if (!Array.isArray(value)) return { rows: [], invalidRoot: true };
  return { rows: value as T[], invalidRoot: false };
}

export function normalizeReadOnlyJsonObjectArrayField<T>(
  value: unknown,
  field: string,
): {
  object: Record<string, unknown> | null;
  rows: T[];
  invalidRoot: boolean;
  invalidField: boolean;
} {
  if (value === null || value === undefined) {
    return { object: null, rows: [], invalidRoot: false, invalidField: false };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { object: null, rows: [], invalidRoot: true, invalidField: false };
  }
  const object = value as Record<string, unknown>;
  const rawField = object[field];
  if (rawField === undefined || rawField === null) {
    return { object, rows: [], invalidRoot: false, invalidField: false };
  }
  if (!Array.isArray(rawField)) {
    return { object, rows: [], invalidRoot: false, invalidField: true };
  }
  return { object, rows: rawField as T[], invalidRoot: false, invalidField: false };
}
