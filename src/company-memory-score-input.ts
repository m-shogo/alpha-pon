import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSourceHealthScoreRows } from "./source-health-input.js";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function assertCompanyMemoryScoreRow(value: unknown, rowLabel: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${rowLabel} must be an object`);
  }

  const row = value as Record<string, unknown>;
  for (const field of ["code", "name", "createdAt"] as const) {
    if (typeof row[field] !== "string" || row[field].trim() === "") {
      throw new Error(`${rowLabel} ${field} must be a non-empty string`);
    }
  }

  for (const field of ["tags", "rules", "reasons", "negativeReasons", "warnings"] as const) {
    if (row[field] !== undefined && !isStringArray(row[field])) {
      throw new Error(`${rowLabel} ${field} must be a string array when present`);
    }
  }
}

export function assertCompanyMemoryScoreInputs(reportsDir = "reports"): void {
  if (!existsSync(reportsDir)) return;

  for (const file of readdirSync(reportsDir).filter((name) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
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

    normalized.rows.forEach((row, index) => assertCompanyMemoryScoreRow(row, `${file} row ${index + 1}`));
  }
}
