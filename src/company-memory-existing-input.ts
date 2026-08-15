import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const REQUIRED_STRING_ARRAY_FIELDS = [
  "watchReason",
  "knownRisks",
  "strongRules",
  "weakRules",
  "recurringWarnings",
  "notes",
] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function assertExistingCompanyMemoryShape(value: unknown, file: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${file}: company-memory root must be an object`);
  }

  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error(`${file}: schemaVersion must be 1`);
  }

  for (const field of ["code", "name", "firstSeenAt", "lastReviewedAt"] as const) {
    if (typeof record[field] !== "string" || record[field].trim() === "") {
      throw new Error(`${file}: ${field} must be a non-empty string`);
    }
  }

  const expectedCode = basename(file, ".json");
  if (record.code !== expectedCode) {
    throw new Error(`${file}: code must match filename (${expectedCode})`);
  }

  for (const field of REQUIRED_STRING_ARRAY_FIELDS) {
    if (!isStringArray(record[field])) {
      throw new Error(`${file}: ${field} must be a string array`);
    }
  }

  if (!Array.isArray(record.recentOutcomes)) {
    throw new Error(`${file}: recentOutcomes must be an array`);
  }
}

export function assertExistingCompanyMemoryInputs(dir = join("data", "company_memory")): void {
  if (!existsSync(dir)) return;

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      throw new Error(`${file}: invalid company-memory JSON`);
    }

    assertExistingCompanyMemoryShape(parsed, file);
  }
}
