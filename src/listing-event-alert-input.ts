import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export function readListingEventRows<T>(path: string): {
  rows: T[];
  warnings: string[];
} {
  const { rows, parseErrors } = readJsonlWithErrors<T>(path);
  const warning = formatReadOnlyJsonlParseWarning(path, parseErrors);
  return {
    rows,
    warnings: warning ? [warning] : [],
  };
}
