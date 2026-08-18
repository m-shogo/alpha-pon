import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { addDaysJst, todayJst } from "./date.js";

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function isUsableProScoreRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.code !== "string" || value.code.length === 0 || value.code !== value.code.trim()) return false;
  if (typeof value.name !== "string" || value.name.trim().length === 0) return false;
  return isOptionalStringArray(value.reasons)
    && isOptionalStringArray(value.negativeReasons)
    && isOptionalStringArray(value.warnings);
}

export type LatestProScoreLoad<T> = {
  rows: T[];
  sourceFile: string | null;
  warnings: string[];
};

export function readLatestProScores<T>(reportsDir = "reports", asOf = todayJst()): LatestProScoreLoad<T> {
  if (!existsSync(reportsDir)) return { rows: [], sourceFile: null, warnings: [] };

  const scoreFiles = readdirSync(reportsDir)
    .filter((file) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  for (const file of scoreFiles) {
    const date = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1] ?? "";
    if (!isRealJstDate(date)) {
      throw new Error(`${file}: score snapshot filename must contain a real Gregorian date`);
    }
    if (date > asOf) {
      throw new Error(`${file}: score snapshot filename must not be later than pro-score as-of date ${asOf}`);
    }
  }

  const latest = scoreFiles.at(-1);
  if (!latest) return { rows: [], sourceFile: null, warnings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(reportsDir, latest), "utf-8")) as unknown;
  } catch {
    throw new Error(`${latest}: score snapshot must contain valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${latest}: score snapshot root must be an array`);
  }

  const usableRows: Array<{ row: T; index: number; code: string }> = [];
  const invalidRows: number[] = [];
  parsed.forEach((row, index) => {
    if (isUsableProScoreRow(row)) usableRows.push({ row: row as T, index: index + 1, code: row.code });
    else invalidRows.push(index + 1);
  });

  const codeCounts = new Map<string, number>();
  for (const item of usableRows) {
    codeCounts.set(item.code, (codeCounts.get(item.code) ?? 0) + 1);
  }
  const duplicateRows = usableRows
    .filter(item => (codeCounts.get(item.code) ?? 0) > 1)
    .map(item => item.index);
  const rows = usableRows
    .filter(item => (codeCounts.get(item.code) ?? 0) === 1)
    .map(item => item.row);

  const warnings: string[] = [];
  if (invalidRows.length > 0) {
    warnings.push(`${latest}: ${invalidRows.length} malformed score row(s) isolated at row(s) ${invalidRows.join(", ")}`);
  }
  if (duplicateRows.length > 0) {
    warnings.push(`${latest}: ${duplicateRows.length} duplicate-identity score row(s) isolated at row(s) ${duplicateRows.join(", ")}`);
  }

  return { rows, sourceFile: latest, warnings };
}
