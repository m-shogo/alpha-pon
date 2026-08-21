import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type NonMoveHistoryInput = {
  code?: string;
  nonMoveReasons?: string[];
  outcome?: string;
};

function isNonMoveHistoryInput(value: unknown): value is NonMoveHistoryInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.code !== undefined && (typeof row.code !== "string" || row.code.trim() !== row.code || row.code.length === 0)) return false;
  if (row.outcome !== undefined && typeof row.outcome !== "string") return false;
  if (row.nonMoveReasons !== undefined) {
    if (!Array.isArray(row.nonMoveReasons)) return false;
    if (row.nonMoveReasons.some(reason => typeof reason !== "string" || reason.trim() !== reason || reason.length === 0)) return false;
  }
  return true;
}

export function readStaleHypothesisJsonl<T>(
  path: string,
  isRow?: (value: unknown) => value is T,
): {
  rows: T[];
  warning: string | null;
  invalidRowCount: number;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const validator = isRow ?? ((value: unknown): value is T => typeof value === "object" && value !== null && !Array.isArray(value));
  const rows = result.rows.filter(validator);
  const invalidRowCount = result.rows.length - rows.length;
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  const invalidRowWarning = invalidRowCount > 0 ? `${path}: invalid_row ${invalidRowCount}` : null;

  return {
    rows,
    warning: [parseWarning, invalidRowWarning].filter(Boolean).join("; ") || null,
    invalidRowCount,
  };
}

export function readNonMoveHistoryJsonl(path: string) {
  return readStaleHypothesisJsonl(path, isNonMoveHistoryInput);
}
