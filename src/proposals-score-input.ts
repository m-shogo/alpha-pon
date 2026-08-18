import { readFileSync } from "node:fs";
import { todayJst } from "./date.js";
import { latestValuationScoreFile } from "./valuation-range-input.js";

function hasSafeWarnings(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
  const warnings = (value as Record<string, unknown>).warnings;
  return warnings == null || (Array.isArray(warnings) && warnings.every(item => typeof item === "string"));
}

function stableCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" && code.length > 0 && code === code.trim() ? code : null;
}

export type ProposalScoreLoad<T> = {
  rows: T[];
  sourceFile: string | null;
};

export function readProposalScores<T>(
  reportsDir = "reports",
  asOf = todayJst(),
): ProposalScoreLoad<T> {
  const sourceFile = latestValuationScoreFile(reportsDir, asOf);
  if (!sourceFile) return { rows: [], sourceFile: null };

  try {
    const parsed = JSON.parse(readFileSync(sourceFile, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) return { rows: [], sourceFile };

    const unsafeRows = parsed
      .map((row, index) => hasSafeWarnings(row) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (unsafeRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score warning shape is invalid at row(s) ${unsafeRows.join(", ")}`);
    }

    const invalidIdentityRows = parsed
      .map((row, index) => stableCode(row) === null ? index + 1 : null)
      .filter((row): row is number => row !== null);
    if (invalidIdentityRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score identity is invalid at row(s) ${invalidIdentityRows.join(", ")}`);
    }

    const codeRows = new Map<string, number[]>();
    parsed.forEach((row, index) => {
      const code = stableCode(row)!;
      const rows = codeRows.get(code) ?? [];
      rows.push(index + 1);
      codeRows.set(code, rows);
    });
    const duplicateRows = [...codeRows.values()]
      .filter(rows => rows.length > 1)
      .flat()
      .sort((a, b) => a - b);
    if (duplicateRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score identity is duplicated at row(s) ${duplicateRows.join(", ")}`);
    }

    return { rows: parsed as T[], sourceFile };
  } catch (error) {
    if (error instanceof Error && error.message.includes(": proposal score ")) throw error;
    return { rows: [], sourceFile };
  }
}
