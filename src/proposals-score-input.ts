import { readFileSync } from "node:fs";
import { todayJst } from "./date.js";
import { latestValuationScoreFile } from "./valuation-range-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSafeWarnings(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const warnings = value.warnings;
  return warnings == null || (Array.isArray(warnings) && warnings.every(item => typeof item === "string"));
}

function hasSafePrimaryDisclosureReview(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const review = value.primaryDisclosureReview;
  if (review === undefined) return true;
  if (!isRecord(review) || !["confirmed", "caution", "block", "missing"].includes(String(review.decision))) return false;
  if (!isRecord(review.sourceCoverage)) return false;
  const fetchErrorCount = review.sourceCoverage.fetchErrorCount;
  return fetchErrorCount === undefined
    || (Number.isSafeInteger(fetchErrorCount) && Number(fetchErrorCount) >= 0);
}

function stableCode(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const code = value.code;
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
    if (!Array.isArray(parsed)) {
      throw new Error(`${sourceFile}: proposal score root must be an array`);
    }

    const unsafeRows = parsed
      .map((row, index) => hasSafeWarnings(row) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (unsafeRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score warning shape is invalid at row(s) ${unsafeRows.join(", ")}`);
    }

    const unsafePrimaryReviewRows = parsed
      .map((row, index) => hasSafePrimaryDisclosureReview(row) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (unsafePrimaryReviewRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score primary disclosure review shape is invalid at row(s) ${unsafePrimaryReviewRows.join(", ")}`);
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
    throw new Error(`${sourceFile}: proposal score snapshot must contain valid JSON`);
  }
}
