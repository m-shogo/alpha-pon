export function normalizeHealthArray<T = unknown>(value: unknown): T[] | null {
  return Array.isArray(value) ? value as T[] : null;
}
