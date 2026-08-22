import type { WorldEventForHypothesis } from "./world-theme-candidate-hypotheses.js";

export type WorldThemeCandidateEventInputResult =
  | { status: "ok"; events: WorldEventForHypothesis[] }
  | { status: "invalid_root"; events: [] };

/**
 * Fail closed on malformed generated input before the hypothesis runner mutates
 * its latest/history outputs. Row-level semantics remain owned by the canonical
 * world-event producer; this boundary only enforces the array-root contract that
 * buildWorldThemeCandidateHypotheses requires.
 */
export function normalizeWorldThemeCandidateEventInput(raw: unknown): WorldThemeCandidateEventInputResult {
  if (!Array.isArray(raw)) {
    return { status: "invalid_root", events: [] };
  }
  return { status: "ok", events: raw as WorldEventForHypothesis[] };
}
