import {
  isHistoricalReactionAnchorVerified,
  type HistoricalShockCaseContext,
} from "./idiosyncratic-shock-case-context.js";

function hasReplayableEvidenceSource(context?: HistoricalShockCaseContext | null): boolean {
  const sources = context?.reactionAnchorEvidenceSources ?? [];
  return sources.some(source => {
    if (!source.title?.trim() || !source.url?.trim()) return false;
    try {
      const parsed = new URL(source.url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  });
}

/**
 * Historical First Eligible Signalへ進めるreaction anchorの最終gate。
 * timing/dateだけでは足りず、後から第三者が再現できる証拠URLとprovenance noteも必須にする。
 */
export function isHistoricalReactionAnchorReplayReady(
  context?: HistoricalShockCaseContext | null,
): boolean {
  if (!isHistoricalReactionAnchorVerified(context)) return false;
  if (!context?.reactionAnchorNotes?.trim()) return false;
  return hasReplayableEvidenceSource(context);
}

export function historicalReactionAnchorReplayBlockers(
  context?: HistoricalShockCaseContext | null,
): string[] {
  const blockers: string[] = [];
  if (!isHistoricalReactionAnchorVerified(context)) blockers.push("timing/date anchor is not structurally verified");
  if (!context?.reactionAnchorNotes?.trim()) blockers.push("reactionAnchorNotes missing");
  if (!hasReplayableEvidenceSource(context)) blockers.push("reactionAnchorEvidenceSources missing or invalid");
  return blockers;
}
