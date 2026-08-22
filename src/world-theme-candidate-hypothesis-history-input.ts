export type WorldThemeCandidateHypothesisHistoryInputResult =
  | { status: "ok"; ids: Set<string> }
  | { status: "invalid_history"; ids: Set<string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the append-only world-theme hypothesis history without silently losing
 * identity information. If any non-empty line is malformed or lacks a canonical
 * hypothesisId, fail closed so the caller does not publish a new latest snapshot
 * or append duplicate history against an incomplete identity set.
 */
export function normalizeWorldThemeCandidateHypothesisHistory(raw: string): WorldThemeCandidateHypothesisHistoryInputResult {
  const ids = new Set<string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { status: "invalid_history", ids: new Set() };
    }

    if (!isRecord(parsed)) return { status: "invalid_history", ids: new Set() };
    const id = parsed.hypothesisId;
    if (typeof id !== "string" || id.trim().length === 0 || id !== id.trim()) {
      return { status: "invalid_history", ids: new Set() };
    }
    ids.add(id);
  }

  return { status: "ok", ids };
}
