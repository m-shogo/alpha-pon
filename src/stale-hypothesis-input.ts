import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export function readStaleHypothesisJsonl<T>(
  path: string,
  isRow: (value: unknown) => value is T,
): {
  rows: T[];
  warning: string | null;
  invalidRowCount: number;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const rows = result.rows.filter(isRow);
  const invalidRowCount = result.rows.length - rows.length;
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  const invalidRowWarning = invalidRowCount > 0 ? `${path}: invalid_row ${invalidRowCount}` : null;

  return {
    rows,
    warning: [parseWarning, invalidRowWarning].filter(Boolean).join("; ") || null,
    invalidRowCount,
  };
}
