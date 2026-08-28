import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { addDaysJst, todayJst } from "./date.js";

const REQUIRED_STRING_ARRAY_FIELDS = [
  "watchReason",
  "knownRisks",
  "strongRules",
  "weakRules",
  "recurringWarnings",
  "notes",
] as const;

function isCanonicalStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(
    (item) => typeof item === "string" && item.length > 0 && item.trim() === item,
  );
}

function assertStrictDate(value: unknown, field: string, file: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file}: ${field} must be a non-empty string`);
  }
  try {
    if (addDaysJst(value, 0) !== value) throw new Error("non-canonical");
  } catch {
    throw new Error(`${file}: ${field} must be a real YYYY-MM-DD date`);
  }
  return value;
}

function assertCompanyMemoryDirectory(dir: string): void {
  let stat;
  try {
    stat = lstatSync(dir);
  } catch {
    throw new Error(`${dir}: company-memory input root must be a readable directory`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${dir}: company-memory input root must be a real directory`);
  }
}

function assertStandaloneCompanyMemoryFile(path: string, file: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error(`${file}: company-memory input must be a readable standalone regular file`);
  }
  if (!stat.isFile() || stat.nlink !== 1) {
    throw new Error(`${file}: company-memory input must be a standalone regular file`);
  }
}

function assertExistingCompanyMemoryShape(value: unknown, file: string, asOf: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${file}: company-memory root must be an object`);
  }

  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error(`${file}: schemaVersion must be 1`);
  }

  for (const field of ["code", "name"] as const) {
    if (typeof record[field] !== "string" || record[field].trim() === "") {
      throw new Error(`${file}: ${field} must be a non-empty string`);
    }
  }

  if ((record.code as string).trim() !== record.code) {
    throw new Error(`${file}: code must not have surrounding whitespace`);
  }

  const firstSeenAt = assertStrictDate(record.firstSeenAt, "firstSeenAt", file);
  const lastReviewedAt = assertStrictDate(record.lastReviewedAt, "lastReviewedAt", file);
  if (lastReviewedAt < firstSeenAt) {
    throw new Error(`${file}: lastReviewedAt must be on or after firstSeenAt`);
  }
  if (lastReviewedAt > asOf) {
    throw new Error(`${file}: lastReviewedAt must not be later than company-memory as-of date ${asOf}`);
  }

  const expectedCode = basename(file, ".json");
  if (record.code !== expectedCode) {
    throw new Error(`${file}: code must match filename (${expectedCode})`);
  }

  for (const field of REQUIRED_STRING_ARRAY_FIELDS) {
    if (!isCanonicalStringArray(record[field])) {
      throw new Error(`${file}: ${field} must be a string array of canonical non-empty strings`);
    }
  }

  if (!Array.isArray(record.recentOutcomes)) {
    throw new Error(`${file}: recentOutcomes must be an array`);
  }
}

export function assertExistingCompanyMemoryInputs(
  dir = join("data", "company_memory"),
  asOf = todayJst(),
): void {
  assertStrictDate(asOf, "asOf", "company-memory input");
  if (!existsSync(dir)) return;
  assertCompanyMemoryDirectory(dir);

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, file);
    assertStandaloneCompanyMemoryFile(path, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      throw new Error(`${file}: invalid company-memory JSON`);
    }

    assertExistingCompanyMemoryShape(parsed, file, asOf);
  }
}
