import { existsSync, readFileSync } from "fs";
import { addDaysJst } from "./date.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type IpoThemeWorldEventInput = {
  title?: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
};

export function readIpoThemeOutcomeInput<T>(path: string): {
  rows: T[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<T>(path);
  return {
    rows: result.rows,
    warning: formatReadOnlyJsonlParseWarning(path, result.parseErrors),
  };
}

function hasValidPublishedAt(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isWorldEventInput(value: unknown): value is IpoThemeWorldEventInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["title", "source", "snippet"].every(
    key => row[key] === undefined || typeof row[key] === "string",
  ) && hasValidPublishedAt(row.publishedAt);
}

export function readIpoThemeWorldEventInput(path: string): {
  rows: IpoThemeWorldEventInput[];
  warning: string | null;
} {
  if (!existsSync(path)) return { rows: [], warning: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return { rows: [], warning: `${path}: parse_error` };
  }

  if (!Array.isArray(parsed)) {
    return { rows: [], warning: `${path}: invalid_root expected_array` };
  }

  const rows: IpoThemeWorldEventInput[] = [];
  const invalidRows: number[] = [];
  parsed.forEach((row, index) => {
    if (isWorldEventInput(row)) rows.push(row);
    else invalidRows.push(index + 1);
  });

  if (invalidRows.length === 0) return { rows, warning: null };
  const shown = invalidRows.slice(0, 8).join(", ");
  const suffix = invalidRows.length > 8 ? ", …" : "";
  return {
    rows,
    warning: `${path}: invalid_rows ${invalidRows.length} (rows ${shown}${suffix})`,
  };
}
