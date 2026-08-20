import { existsSync, readFileSync } from "node:fs";

const WEAK_DIAGNOSES = new Set(["delete_candidate", "condition_required", "weaken_candidate"]);

function isFiniteNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isUsableRuleDiagnostic(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.rule === "string"
    && row.rule.length > 0
    && row.rule === row.rule.trim()
    && typeof row.diagnosis === "string"
    && typeof row.directionExpectation === "number"
    && Number.isFinite(row.directionExpectation)
    && isFiniteNumberOrNull(row.avgRelativeReturnPct)
    && isFiniteNumberOrNull(row.avgLossRelativeReturnPct);
}

export function readProposalRuleDiagnostics<T>(path: string): T[] {
  if (!existsSync(path)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${path}: proposal rule diagnostics must contain valid JSON`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${path}: proposal rule diagnostics root must be an array`);
  }

  const unsafeRows = parsed
    .map((row, index) => isUsableRuleDiagnostic(row) ? null : index + 1)
    .filter((row): row is number => row !== null);
  if (unsafeRows.length > 0) {
    throw new Error(`${path}: proposal rule diagnostic shape is invalid at row(s) ${unsafeRows.join(", ")}`);
  }

  return parsed as T[];
}

export function isWeakProposalRuleDiagnosis(value: string): boolean {
  return WEAK_DIAGNOSES.has(value);
}
