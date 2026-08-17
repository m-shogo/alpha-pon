import { addDaysJst, formatJstDate } from "./date.js";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./research/iso-instant.js";

type PipelineResult = {
  name: string;
  status: "ok" | "skip" | "fail";
};

export function hasUsableSourceHealthText(value: string): boolean {
  return value.trim().length > 0;
}

export function sourceHealthHistoryState(fileExists: boolean): "ok" | "missing" {
  return fileExists ? "ok" : "missing";
}

function canonicalPipelineDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return addDaysJst(value, 0) === value ? value : null;
  } catch {
    return null;
  }
}

function hasCanonicalGeneratedAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parseExplicitIso8601Instant(value, "pipeline generatedAt");
    return true;
  } catch {
    return false;
  }
}

function canonicalPipelineResults(value: unknown): PipelineResult[] | null {
  if (!Array.isArray(value)) return null;
  const results: PipelineResult[] = [];
  const seenNames = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const candidate = row as Record<string, unknown>;
    if (
      typeof candidate.name !== "string"
      || candidate.name.trim().length === 0
      || candidate.name !== candidate.name.trim()
      || seenNames.has(candidate.name)
      || (candidate.status !== "ok" && candidate.status !== "skip" && candidate.status !== "fail")
    ) {
      return null;
    }
    seenNames.add(candidate.name);
    results.push({ name: candidate.name, status: candidate.status });
  }
  return results;
}

function canonicalFailedSteps(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const failedSteps: string[] = [];
  for (const step of value) {
    if (typeof step !== "string" || step.trim().length === 0 || step !== step.trim()) return null;
    failedSteps.push(step);
  }
  return failedSteps;
}

export function hasCanonicalPipelineStatus(
  value: Record<string, unknown> | null,
  asOf?: string,
  asOfInstant?: string,
): boolean {
  if (!value) return false;
  const pipelineDate = canonicalPipelineDate(value.date);
  if (!pipelineDate) return false;
  if (asOf !== undefined) {
    const cutoff = canonicalPipelineDate(asOf);
    if (!cutoff || pipelineDate > cutoff) return false;
  }

  const generatedAt = value.generatedAt;
  if (!hasCanonicalGeneratedAt(generatedAt)) return false;
  if (formatJstDate(new Date(generatedAt)) !== pipelineDate) return false;
  if (asOfInstant !== undefined) {
    try {
      if (compareExplicitIso8601Instants(generatedAt, asOfInstant, "pipeline generatedAt", "pipeline health asOfInstant") > 0) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const results = canonicalPipelineResults(value.results);
  const failedSteps = canonicalFailedSteps(value.failedSteps);
  if (!results || !failedSteps) return false;

  const derivedFailedSteps = results.filter(result => result.status === "fail").map(result => result.name);
  if (failedSteps.length !== derivedFailedSteps.length) return false;
  if (!failedSteps.every((step, index) => step === derivedFailedSteps[index])) return false;
  if (value.status === "ok" && derivedFailedSteps.length !== 0) return false;
  if (value.status === "partial_failed" && derivedFailedSteps.length === 0) return false;

  return value.app === "alpha-pon"
    && value.runType === "daily"
    && (value.status === "ok" || value.status === "partial_failed");
}
