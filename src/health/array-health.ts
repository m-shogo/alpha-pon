function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeHealthArray<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T[] | null {
  return Array.isArray(value) && value.every(isRecord) ? value as T[] : null;
}
