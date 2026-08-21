import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RULE_DIAGNOSES = new Set([
  "delete_candidate",
  "weaken_candidate",
  "condition_required",
  "needs_more_data",
  "keep_monitoring",
]);
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
    && RULE_DIAGNOSES.has(row.diagnosis)
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

  const ruleCounts = new Map<string, number>();
  for (const row of parsed) {
    const rule = (row as { rule: string }).rule;
    ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
  }
  const duplicateRules = new Set(
    [...ruleCounts.entries()].filter(([, count]) => count > 1).map(([rule]) => rule),
  );
  if (duplicateRules.size > 0) {
    const duplicateRows = parsed
      .map((row, index) => duplicateRules.has((row as { rule: string }).rule) ? index + 1 : null)
      .filter((row): row is number => row !== null);
    throw new Error(`${path}: duplicate proposal rule diagnostic identity at row(s) ${duplicateRows.join(", ")}`);
  }

  return parsed as T[];
}

export function readCurrentProposalRuleDiagnostics<T>(reportsDir: string, asOf: string): T[] {
  const path = join(reportsDir, `rule_diagnostics_${asOf}.json`);
  if (!existsSync(path)) {
    throw new Error(`${path}: current proposal rule diagnostics snapshot is missing`);
  }
  return readProposalRuleDiagnostics<T>(path);
}

export function isWeakProposalRuleDiagnosis(value: string): boolean {
  return WEAK_DIAGNOSES.has(value);
}
