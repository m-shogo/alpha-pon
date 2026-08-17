import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addDaysJst, todayJst } from "./date.js";
import { normalizeSourceHealthScoreRows } from "./source-health-input.js";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function assertCompanyMemoryScoreRow(value: unknown, rowLabel: string, asOf: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${rowLabel} must be an object`);
  }

  const row = value as Record<string, unknown>;
  for (const field of ["code", "name", "createdAt"] as const) {
    if (typeof row[field] !== "string" || row[field].trim() === "") {
      throw new Error(`${rowLabel} ${field} must be a non-empty string`);
    }
  }
  if (!isRealJstDate(row.createdAt as string)) {
    throw new Error(`${rowLabel} createdAt must be a real Gregorian JST date`);
  }
  if ((row.createdAt as string) > asOf) {
    throw new Error(`${rowLabel} createdAt must not be later than company-memory as-of date ${asOf}`);
  }

  for (const field of ["tags", "rules", "reasons", "negativeReasons", "warnings"] as const) {
    if (row[field] !== undefined && !isStringArray(row[field])) {
      throw new Error(`${rowLabel} ${field} must be a string array when present`);
    }
  }
}

export function assertCompanyMemoryScoreInputs(reportsDir = "reports", asOf = todayJst()): void {
  if (!existsSync(reportsDir)) return;

  for (const file of readdirSync(reportsDir).filter((name) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
    const match = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
    const snapshotDate = match?.[1] ?? "";
    if (!isRealJstDate(snapshotDate)) {
      throw new Error(`${file}: score snapshot filename must contain a real Gregorian date`);
    }
    if (snapshotDate > asOf) {
      throw new Error(`${file}: score snapshot filename must not be later than company-memory as-of date ${asOf}`);
    }

    const path = join(reportsDir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    } catch (error) {
      throw new Error(`${file}: invalid score JSON (${error instanceof Error ? error.message : String(error)})`);
    }

    const normalized = normalizeSourceHealthScoreRows<unknown>(parsed);
    if (!normalized.valid) {
      throw new Error(`${file}: score root must be an array`);
    }

    normalized.rows.forEach((row, index) => assertCompanyMemoryScoreRow(row, `${file} row ${index + 1}`, asOf));
  }
}
