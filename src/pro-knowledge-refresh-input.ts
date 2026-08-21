import { addDaysJst } from "./date.js";
import { normalizeRegimeHistoryActiveRegimes } from "./regime-history-input.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) return null;
  return value as string[];
}

export type ProKnowledgeRefreshDomain = {
  id: string;
  label: string;
  reviewCadence: string;
  why: string;
  affectedAgents: string[];
  watchExamples: string[];
  mustUpdateWhen: string[];
};

export type ProKnowledgeRefreshConfig = {
  refreshDomains: ProKnowledgeRefreshDomain[];
  refreshRules: string[];
  outputRequirements: string[];
};

export function normalizeProKnowledgeRefreshConfig(value: unknown): ProKnowledgeRefreshConfig | null {
  if (!isRecord(value)) return null;
  const rawDomains = value.refreshDomains ?? [];
  if (!Array.isArray(rawDomains)) return null;

  const refreshDomains: ProKnowledgeRefreshDomain[] = [];
  const domainIds = new Set<string>();
  for (const rawDomain of rawDomains) {
    if (!isRecord(rawDomain)) return null;
    if (
      typeof rawDomain.id !== "string"
      || rawDomain.id.trim().length === 0
      || rawDomain.id.trim() !== rawDomain.id
    ) return null;
    if (domainIds.has(rawDomain.id)) return null;
    domainIds.add(rawDomain.id);
    if (typeof rawDomain.label !== "string" || rawDomain.label.trim().length === 0) return null;
    if (typeof rawDomain.reviewCadence !== "string" || rawDomain.reviewCadence.trim().length === 0) return null;
    if (typeof rawDomain.why !== "string" || rawDomain.why.trim().length === 0) return null;
    const affectedAgents = stringArray(rawDomain.affectedAgents);
    const watchExamples = stringArray(rawDomain.watchExamples);
    const mustUpdateWhen = stringArray(rawDomain.mustUpdateWhen);
    if (!affectedAgents || !watchExamples || !mustUpdateWhen) return null;
    refreshDomains.push({
      id: rawDomain.id,
      label: rawDomain.label,
      reviewCadence: rawDomain.reviewCadence,
      why: rawDomain.why,
      affectedAgents,
      watchExamples,
      mustUpdateWhen,
    });
  }

  const refreshRules = stringArray(value.refreshRules);
  const outputRequirements = stringArray(value.outputRequirements);
  if (!refreshRules || !outputRequirements) return null;
  return { refreshDomains, refreshRules, outputRequirements };
}

export function isUsableProKnowledgeRegimeAsOf(value: unknown, today: string): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= today;
  } catch {
    return false;
  }
}

export function isUsableProKnowledgeRegime(value: unknown, today: string): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (!isUsableProKnowledgeRegimeAsOf(value.asOf, today)) return false;
  if (value.summary !== undefined && typeof value.summary !== "string") return false;
  try {
    normalizeRegimeHistoryActiveRegimes(value.activeRegimes);
    return true;
  } catch {
    return false;
  }
}
