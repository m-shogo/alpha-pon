import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addDaysJst, todayJst } from "./date.js";
import { readReadOnlyJsonArrayFile } from "./read-only-json-file.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function assertCanonicalAsOf(asOf: string): void {
  if (!isRealJstDate(asOf)) {
    throw new Error("valuation score asOf must be a real canonical YYYY-MM-DD date");
  }
}

function isCanonicalScoreDirectory(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export function latestValuationScoreFile(
  reportsDir = "reports",
  asOf = todayJst(),
): string | null {
  assertCanonicalAsOf(asOf);
  if (!existsSync(reportsDir)) return null;
  if (!isCanonicalScoreDirectory(reportsDir)) {
    throw new Error(`${reportsDir}: valuation score root must be a real directory`);
  }
  const files = readdirSync(reportsDir)
    .flatMap((file) => {
      const match = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
      if (!match || !isRealJstDate(match[1]) || match[1] > asOf) return [];
      return [{ file, date: match[1] }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = files.at(-1);
  return latest ? join(reportsDir, latest.file) : null;
}

export function loadLatestValuationScoreRows<T>(
  reportsDir = "reports",
  asOf = todayJst(),
  isRow?: (value: unknown) => value is T,
): T[] {
  const path = latestValuationScoreFile(reportsDir, asOf);
  if (!path) return [];
  const loaded = readReadOnlyJsonArrayFile<T>(path);
  if (loaded.parseError) {
    throw new Error(`${path}: parse_error`);
  }
  if (loaded.invalidRoot) {
    throw new Error(`${path}: invalid_root (expected array)`);
  }
  if (isRow && loaded.rows.some((row) => !isRow(row))) {
    throw new Error(`${path}: invalid_row`);
  }

  const codes = loaded.rows.map((row) => isRecord(row) ? row.code : undefined);
  if (codes.some((code) => typeof code !== "string" || code.length === 0 || code !== code.trim())) {
    throw new Error(`${path}: invalid_code_identity`);
  }
  if (new Set(codes).size !== codes.length) {
    throw new Error(`${path}: duplicate_code_identity`);
  }

  return loaded.rows;
}
