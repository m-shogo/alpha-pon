import { existsSync, readFileSync } from "node:fs";
import { normalizeSourceHealthArray } from "./source-health-input.js";

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}

export function assertReadinessCompanyMemoryInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
  reportPath = "reports/company_memory_latest.json",
): void {
  if (existsSync(generatedPath)) {
    const generated = readJson(generatedPath);
    if (typeof generated !== "object" || generated === null || Array.isArray(generated)) {
      throw new Error(`${generatedPath}: generated root must be an object`);
    }
    const companyMemory = (generated as Record<string, unknown>).companyMemory;
    if (companyMemory !== undefined) {
      if (!normalizeSourceHealthArray(companyMemory).valid) {
        throw new Error(`${generatedPath}: companyMemory must be an array when present`);
      }
      return;
    }
  }

  if (!existsSync(reportPath)) return;
  const report = readJson(reportPath);
  if (!normalizeSourceHealthArray(report).valid) {
    throw new Error(`${reportPath}: company-memory root must be an array`);
  }
}

if (process.argv[1]?.endsWith("readiness-company-memory-input.ts")) {
  assertReadinessCompanyMemoryInput();
}
