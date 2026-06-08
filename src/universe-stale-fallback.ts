import type { UniverseCandidate } from "./universe.js";

export const STALE_FALLBACK_WARNING = "[STALE] J-Quants取得が全滅したため前回候補を暫定保持";

function appendUniqueWarning(warnings: string[] | undefined, warning: string): string[] {
  const current = warnings ?? [];
  return current.includes(warning) ? current : [...current, warning];
}

export function carryForwardStaleCandidate(candidate: UniverseCandidate, fallbackAsOf: string): UniverseCandidate {
  return {
    ...candidate,
    staleAsOf: fallbackAsOf,
    carriedForwardAt: fallbackAsOf,
    fallbackAsOf,
    warnings: appendUniqueWarning(candidate.warnings, STALE_FALLBACK_WARNING),
  };
}
