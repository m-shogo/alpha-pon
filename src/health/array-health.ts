function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

export function normalizeHealthArray<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T[] | null {
  return Array.isArray(value) && value.every(isNonEmptyRecord) ? value as T[] : null;
}
