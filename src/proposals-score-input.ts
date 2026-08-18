import { readFileSync } from "node:fs";
import { todayJst } from "./date.js";
import { latestValuationScoreFile } from "./valuation-range-input.js";

function hasSafeWarnings(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
  const warnings = (value as Record<string, unknown>).warnings;
  return warnings == null || (Array.isArray(warnings) && warnings.every(item => typeof item === "string"));
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

    return { rows: parsed as T[], sourceFile };
  } catch (error) {
    if (error instanceof Error && error.message.includes("proposal score warning shape is invalid")) throw error;
    return { rows: [], sourceFile };
  }
}
