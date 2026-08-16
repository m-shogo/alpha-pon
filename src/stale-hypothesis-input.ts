import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export function readStaleHypothesisJsonl<T>(path: string): {
  rows: T[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<T>(path);
  return {
    rows: result.rows,
    warning: formatReadOnlyJsonlParseWarning(path, result.parseErrors),
  };
}
