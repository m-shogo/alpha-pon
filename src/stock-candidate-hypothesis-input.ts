import type { StockCandidateHypothesis } from "./universe.js";

export type StockCandidateHypothesisJsonlRead = {
  rows: StockCandidateHypothesis[];
  warnings: string[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseExistingStockCandidateHypothesesJsonl(
  text: string,
  sourceLabel = "data/hypothesis_predictions.jsonl",
): StockCandidateHypothesisJsonlRead {
  const rows: StockCandidateHypothesis[] = [];
  const malformedLineNumbers: number[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      rows.push(JSON.parse(line) as StockCandidateHypothesis);
    } catch {
      malformedLineNumbers.push(index + 1);
    }
  });

  return {
    rows,
    warnings:
      malformedLineNumbers.length === 0
        ? []
        : [
            `${sourceLabel}: ignored ${malformedLineNumbers.length} malformed JSONL row(s) at line(s) ${malformedLineNumbers.join(", ")}`,
          ],
  };
}

export function normalizeStockCandidateWatchlistCodes(
  input: unknown,
  sourceLabel = "config/watchlist.yml",
): { codes: Set<string>; warnings: string[] } {
  if (!isRecord(input)) {
    return { codes: new Set(), warnings: [`${sourceLabel}: root shape is invalid`] };
  }
  if (input.symbols === undefined) return { codes: new Set(), warnings: [] };
  if (!Array.isArray(input.symbols)) {
    return { codes: new Set(), warnings: [`${sourceLabel}: symbols shape is invalid`] };
  }

  const codes = new Set<string>();
  const warnings: string[] = [];
  input.symbols.forEach((row, index) => {
    if (!isRecord(row) || typeof row.code !== "string" || !row.code.trim()) {
      warnings.push(`${sourceLabel}: ignored malformed symbols row ${index + 1}`);
      return;
    }
    const code = row.code.trim();
    if (code !== row.code) {
      warnings.push(`${sourceLabel}: canonicalized symbols row ${index + 1} code whitespace`);
    }
    codes.add(code);
  });
  return { codes, warnings };
}
