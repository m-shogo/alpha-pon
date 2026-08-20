import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export function readKnowledgeReviewJsonl<T>(
  path: string,
  isUsable?: (value: unknown) => value is T,
): {
  rows: T[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const rows = isUsable ? result.rows.filter(isUsable) : (result.rows as T[]);
  const warnings: string[] = [];
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  if (parseWarning) warnings.push(parseWarning);
  if (isUsable) {
    const invalidRows = result.rows.length - rows.length;
    if (invalidRows > 0) warnings.push(`${path}: invalid_shape ${invalidRows}`);
  }
  return {
    rows,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
  };
}
