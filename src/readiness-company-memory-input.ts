import { existsSync, readFileSync } from "node:fs";
import { normalizeSourceHealthArray } from "./source-health-input.js";

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}

function readGeneratedObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const generated = readJson(path);
  if (typeof generated !== "object" || generated === null || Array.isArray(generated)) {
    throw new Error(`${path}: generated root must be an object`);
  }
  return generated as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertReadinessCompanyMemoryInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
  reportPath = "reports/company_memory_latest.json",
): void {
  const generated = readGeneratedObject(generatedPath);
  if (generated) {
    const companyMemory = generated.companyMemory;
    if (companyMemory !== undefined && !normalizeSourceHealthArray(companyMemory).valid) {
      throw new Error(`${generatedPath}: companyMemory must be an array when present`);
    }
  }

  if (!existsSync(reportPath)) return;
  const report = readJson(reportPath);
  if (!normalizeSourceHealthArray(report).valid) {
    throw new Error(`${reportPath}: company-memory root must be an array`);
  }
}

export function assertReadinessHypothesisPredictionInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
): void {
  const generated = readGeneratedObject(generatedPath);
  if (!generated || generated.hypothesisPredictions === undefined) return;
  if (!normalizeSourceHealthArray(generated.hypothesisPredictions).valid) {
    throw new Error(`${generatedPath}: hypothesisPredictions must be an array when present`);
  }
}

export function assertReadinessPrimaryDisclosureReviewInput(
  generatedPath = "apps/web/public/generated/alpha-pon-data.json",
): void {
  const generated = readGeneratedObject(generatedPath);
  if (!generated || generated.primaryDisclosureReviews === undefined) return;
  if (!isRecord(generated.primaryDisclosureReviews)) {
    throw new Error(`${generatedPath}: primaryDisclosureReviews must be an object when present`);
  }
  for (const [code, review] of Object.entries(generated.primaryDisclosureReviews)) {
    if (!isRecord(review)) {
      throw new Error(`${generatedPath}: primaryDisclosureReviews.${code} must be an object`);
    }
  }
}

if (process.argv[1]?.endsWith("readiness-company-memory-input.ts")) {
  assertReadinessCompanyMemoryInput();
  assertReadinessHypothesisPredictionInput();
  assertReadinessPrimaryDisclosureReviewInput();
}
