export function normalizeReadOnlyJsonArray<T>(value: unknown): {
  rows: T[];
  invalidRoot: boolean;
} {
  if (value === null || value === undefined) return { rows: [], invalidRoot: false };
  if (!Array.isArray(value)) return { rows: [], invalidRoot: true };
  return { rows: value as T[], invalidRoot: false };
}
