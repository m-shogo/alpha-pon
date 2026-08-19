import type { UniverseCandidate } from "./universe.js";

export const STALE_FALLBACK_WARNING = "[STALE] J-Quants取得が全滅したため前回候補を暫定保持";

function appendUniqueWarning(warnings: string[] | undefined, warning: string): string[] {
  const current = warnings ?? [];
  return current.includes(warning) ? current : [...current, warning];
}

function isStrictGregorianDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function hasCanonicalIdentity(candidate: UniverseCandidate): boolean {
  return typeof candidate.code === "string"
    && candidate.code.length > 0
    && candidate.code === candidate.code.trim()
    && typeof candidate.name === "string"
    && candidate.name.trim().length > 0;
}

function hasInvalidStaleLineage(candidate: UniverseCandidate, fallbackAsOf: string): boolean {
  return [candidate.staleAsOf, candidate.carriedForwardAt, candidate.fallbackAsOf].some(
    value => value != null && (
      !isStrictGregorianDate(value)
      || value < candidate.detectedAt
      || value > fallbackAsOf
    ),
  );
}

export function carryForwardStaleCandidate(candidate: UniverseCandidate, fallbackAsOf: string): UniverseCandidate {
  if (!hasCanonicalIdentity(candidate)) {
    throw new RangeError("stale fallback candidate identity is invalid");
  }
  if (candidate.dataSource !== "jquants") {
    throw new RangeError("stale fallback source provenance is invalid");
  }
  if (
    !isStrictGregorianDate(candidate.detectedAt)
    || !isStrictGregorianDate(fallbackAsOf)
    || candidate.detectedAt > fallbackAsOf
    || hasInvalidStaleLineage(candidate, fallbackAsOf)
  ) {
    throw new RangeError("stale fallback chronology is invalid");
  }

  return {
    ...candidate,
    staleAsOf: fallbackAsOf,
    carriedForwardAt: fallbackAsOf,
    fallbackAsOf,
    warnings: appendUniqueWarning(candidate.warnings, STALE_FALLBACK_WARNING),
  };
}

export function carryForwardValidStaleCandidates(
  input: unknown,
  fallbackAsOf: string,
): { candidates: UniverseCandidate[]; invalidRowCount: number } {
  if (!Array.isArray(input)) {
    return { candidates: [], invalidRowCount: input == null ? 0 : 1 };
  }

  const candidates: UniverseCandidate[] = [];
  let invalidRowCount = 0;
  for (const candidate of input) {
    try {
      candidates.push(carryForwardStaleCandidate(candidate as UniverseCandidate, fallbackAsOf));
    } catch {
      invalidRowCount += 1;
    }
  }
  return { candidates, invalidRowCount };
}
