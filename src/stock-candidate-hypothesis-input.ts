import { addDaysJst, todayJst } from "./date.js";
import type { StockCandidateHypothesis, UniverseCandidate } from "./universe.js";

export type StockCandidateHypothesisJsonlRead = {
  rows: StockCandidateHypothesis[];
  warnings: string[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isRealJstDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isUsableStockCandidateHypothesis(value: unknown): value is StockCandidateHypothesis {
  if (!isRecord(value)) return false;
  if (!isRealJstDate(value.detectedAt) || value.detectedAt > todayJst()) return false;
  if (!isRealJstDate(value.reviewDueAt) || value.reviewDueAt < value.detectedAt) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    value.code === value.code.trim() &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.reason === "string" &&
    (value.expectedTimeframe === "1w" || value.expectedTimeframe === "1m" || value.expectedTimeframe === "3m") &&
    (value.expectedDirection === "up" || value.expectedDirection === "down" || value.expectedDirection === "sideways" || value.expectedDirection === "unknown") &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    stringArray(value.invalidationSignals) &&
    stringArray(value.evidenceNeeded) &&
    stringArray(value.relatedWorldEventIds) &&
    stringArray(value.relatedDisclosureIds) &&
    (value.status === "open" || value.status === "closed") &&
    (value.label === "監視候補" || value.label === "検証候補" || value.label === "反証待ち")
  );
}

function hasCanonicalDuplicateIdentity(value: unknown): value is StockCandidateHypothesis {
  return isUsableStockCandidateHypothesis(value) && value.status === "open";
}

function openHypothesisIdentity(value: StockCandidateHypothesis): string | null {
  return value.status === "open" ? `${value.code}:${value.detectedAt}` : null;
}

export function hasExistingOpenStockCandidateHypothesis(
  existing: StockCandidateHypothesis[],
  code: string,
  detectedAt: string,
): boolean {
  return existing.some(
    hypothesis =>
      hasCanonicalDuplicateIdentity(hypothesis) &&
      hypothesis.code === code &&
      hypothesis.detectedAt === detectedAt,
  );
}

export function parseExistingStockCandidateHypothesesJsonl(
  text: string,
  sourceLabel = "data/hypothesis_predictions.jsonl",
): StockCandidateHypothesisJsonlRead {
  const rows: StockCandidateHypothesis[] = [];
  const malformedLineNumbers: number[] = [];
  const duplicateOpenLineNumbers: number[] = [];
  const seenOpenIdentities = new Set<string>();

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!isUsableStockCandidateHypothesis(parsed)) {
        malformedLineNumbers.push(index + 1);
        return;
      }
      const identity = openHypothesisIdentity(parsed);
      if (identity !== null && seenOpenIdentities.has(identity)) {
        duplicateOpenLineNumbers.push(index + 1);
        return;
      }
      if (identity !== null) seenOpenIdentities.add(identity);
      rows.push(parsed);
    } catch {
      malformedLineNumbers.push(index + 1);
    }
  });

  const warnings: string[] = [];
  if (malformedLineNumbers.length > 0) {
    warnings.push(
      `${sourceLabel}: ignored ${malformedLineNumbers.length} malformed JSONL row(s) at line(s) ${malformedLineNumbers.join(", ")}`,
    );
  }
  if (duplicateOpenLineNumbers.length > 0) {
    warnings.push(
      `${sourceLabel}: ignored ${duplicateOpenLineNumbers.length} duplicate open identity row(s) at line(s) ${duplicateOpenLineNumbers.join(", ")}`,
    );
  }

  return { rows, warnings };
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

export function normalizeStockCandidateUniverseRows(
  input: unknown,
  sourceLabel = "data/universe_candidates_latest.json",
): { candidates: UniverseCandidate[]; warnings: string[]; rootValid: boolean } {
  if (!isRecord(input) || !Array.isArray(input.candidates)) {
    return { candidates: [], warnings: [`${sourceLabel}: candidates root shape is invalid`], rootValid: false };
  }

  const candidates: UniverseCandidate[] = [];
  const warnings: string[] = [];
  input.candidates.forEach((row, index) => {
    if (
      !isRecord(row) ||
      typeof row.code !== "string" || !row.code.trim() || row.code !== row.code.trim() ||
      typeof row.name !== "string" || !row.name.trim() ||
      !isRealJstDate(row.detectedAt) || row.detectedAt > todayJst() ||
      !(row.sector === null || typeof row.sector === "string") ||
      !finiteOrNull(row.drawdownPct) ||
      !finiteOrNull(row.operatingProfitYoY) ||
      typeof row.screeningScore !== "number" || !Number.isFinite(row.screeningScore) ||
      row.screeningScore < 0 || row.screeningScore > 100 ||
      !stringArray(row.matchedWorldEventTags)
    ) {
      warnings.push(`${sourceLabel}: ignored malformed candidate row ${index + 1}`);
      return;
    }
    candidates.push(row as unknown as UniverseCandidate);
  });

  return { candidates, warnings, rootValid: true };
}