import { existsSync, readFileSync } from "fs";
import { addDaysJst } from "./date.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";
import type { HypothesisOutcome } from "./universe.js";

export type IpoThemeWorldEventInput = {
  title?: string;
  source?: string;
  publishedAt?: string;
  snippet?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isIpoThemeOutcomeInput(value: unknown): value is HypothesisOutcome {
  if (!isRecord(value) || typeof value.code !== "string" || !value.code.trim() || typeof value.name !== "string") {
    return false;
  }

  const hypothesis = value.hypothesis;
  if (!isRecord(hypothesis) || typeof hypothesis.reason !== "string") return false;
  for (const key of ["relatedWorldEventIds", "evidenceNeeded", "invalidationSignals"] as const) {
    if (!isStringArray(hypothesis[key])) return false;
  }

  if (!["watch", "log", "ignore"].includes(String(value.actionLabel))) return false;
  if (!["hit", "miss", "too_early", "invalidated", "unknown"].includes(String(value.result))) return false;

  for (const key of ["return1w", "return1m", "relativeToTopix1m", "maxDrawdownPct"] as const) {
    if (!isFiniteNumberOrNull(value[key])) return false;
  }

  return true;
}

export function readIpoThemeOutcomeInput<T>(
  path: string,
  isRow?: (value: unknown) => value is T,
): {
  rows: T[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  if (!isRow) {
    return {
      rows: result.rows as T[],
      warning: parseWarning,
    };
  }

  const rows = result.rows.filter(isRow);
  const invalidCount = result.rows.length - rows.length;
  const warnings = [
    parseWarning,
    invalidCount > 0 ? `${path}: invalid_rows ${invalidCount}` : null,
  ].filter((warning): warning is string => warning !== null);

  return {
    rows,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
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
