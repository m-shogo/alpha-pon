const DEFAULT_JSONL_MAX_BYTES = 10 * 1024 * 1024;
const MAX_JSONL_MAX_BYTES = 1024 * 1024 * 1024;

export function parseMaintenanceJsonlMaxBytes(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_JSONL_MAX_BYTES;

  const value = raw.trim();
  if (!/^\d+$/.test(value)) return DEFAULT_JSONL_MAX_BYTES;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return DEFAULT_JSONL_MAX_BYTES;

  return Math.min(parsed, MAX_JSONL_MAX_BYTES);
}
