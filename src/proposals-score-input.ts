import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { todayJst } from "./date.js";
import { latestValuationScoreFile } from "./valuation-range-input.js";

const DATA_QUALITIES = new Set(["ok", "partial", "missing"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasSafeWarnings(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const warnings = value.warnings;
  return warnings == null || (Array.isArray(warnings) && warnings.every(item => typeof item === "string"));
}

function hasSafeDataQuality(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const dataQuality = value.dataQuality;
  return dataQuality === undefined
    || (typeof dataQuality === "string" && DATA_QUALITIES.has(dataQuality));
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

function snapshotDateFromPath(path: string): string | null {
  return /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(basename(path))?.[1] ?? null;
}

function hasConsistentCreatedAt(value: unknown, snapshotDate: string): boolean {
  if (!isRecord(value)) return true;
  const createdAt = value.createdAt;
  return createdAt === undefined || createdAt === snapshotDate;
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

    const snapshotDate = snapshotDateFromPath(sourceFile);
    if (snapshotDate === null) {
      throw new Error(`${sourceFile}: proposal score snapshot filename is invalid`);
    }

    const unsafeRows = parsed
      .map((row, index) => hasSafeWarnings(row) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (unsafeRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score warning shape is invalid at row(s) ${unsafeRows.join(", ")}`);
    }

    const unsafeDataQualityRows = parsed
      .map((row, index) => hasSafeDataQuality(row) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (unsafeDataQualityRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score data quality is invalid at row(s) ${unsafeDataQualityRows.join(", ")}`);
    }

    const unsafePrimaryReviewRows = parsed
      .map((row, index) => hasSafePrimaryDisclosureReview(row) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (unsafePrimaryReviewRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score primary disclosure review shape is invalid at row(s) ${unsafePrimaryReviewRows.join(", ")}`);
    }

    const inconsistentCreatedAtRows = parsed
      .map((row, index) => hasConsistentCreatedAt(row, snapshotDate) ? null : index + 1)
      .filter((row): row is number => row !== null);
    if (inconsistentCreatedAtRows.length > 0) {
      throw new Error(`${sourceFile}: proposal score createdAt is inconsistent with snapshot at row(s) ${inconsistentCreatedAtRows.join(", ")}`);
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
