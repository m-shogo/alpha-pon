import type { WorldEventForHypothesis } from "./world-theme-candidate-hypotheses.js";

export type WorldThemeCandidateEventInputResult =
  | { status: "ok"; events: WorldEventForHypothesis[] }
  | { status: "invalid_root" | "invalid_rows"; events: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function isImpact(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isOptionalString(value.category)) return false;
  for (const key of ["impactedTags", "possibleBeneficiaries", "possibleRisks", "watchQuestions", "primaryChecks"] as const) {
    if (!isOptionalStringArray(value[key])) return false;
  }
  return true;
}

function isWorldEvent(value: unknown): value is WorldEventForHypothesis {
  if (!isRecord(value)) return false;
  if (typeof value.title !== "string" || value.title.trim().length === 0) return false;
  if (!isOptionalString(value.source) || !isOptionalString(value.publishedAt)) return false;
  if (value.totalImpactScore !== undefined && (typeof value.totalImpactScore !== "number" || !Number.isFinite(value.totalImpactScore))) return false;
  if (value.impacts !== undefined && (!Array.isArray(value.impacts) || !value.impacts.every(isImpact))) return false;
  return true;
}

/**
 * Fail closed on malformed generated input before the hypothesis runner mutates
 * its latest/history outputs. Rejecting the whole snapshot avoids publishing a
 * partial "latest" artifact when one generated event row is structurally broken.
 */
export function normalizeWorldThemeCandidateEventInput(raw: unknown): WorldThemeCandidateEventInputResult {
  if (!Array.isArray(raw)) {
    return { status: "invalid_root", events: [] };
  }
  if (!raw.every(isWorldEvent)) {
    return { status: "invalid_rows", events: [] };
  }
  return { status: "ok", events: raw };
}
