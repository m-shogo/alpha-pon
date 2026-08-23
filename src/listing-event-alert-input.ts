import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

function hasCanonicalListingEventIdentity(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("id" in value)) return true;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.trim().length > 0 && id.trim() === id;
}

export function readListingEventRows<T>(
  path: string,
  isUsableRow: (value: unknown) => value is T = ((value: unknown): value is T => true),
): {
  rows: T[];
  warnings: string[];
} {
  const { rows: parsedRows, parseErrors } = readJsonlWithErrors<unknown>(path);
  const rows: T[] = [];
  let invalidRows = 0;
  for (const row of parsedRows) {
    if (hasCanonicalListingEventIdentity(row) && isUsableRow(row)) rows.push(row);
    else invalidRows += 1;
  }

  const warnings: string[] = [];
  const parseWarning = formatReadOnlyJsonlParseWarning(path, parseErrors);
  if (parseWarning) warnings.push(parseWarning);
  if (invalidRows > 0) warnings.push(`${path}: invalid_rows=${invalidRows}`);
  return { rows, warnings };
}
