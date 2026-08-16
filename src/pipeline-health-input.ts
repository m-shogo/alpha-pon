import { addDaysJst } from "./date.js";
import { parseExplicitIso8601Instant } from "./research/iso-instant.js";

export function hasUsableSourceHealthText(value: string): boolean {
  return value.trim().length > 0;
}

export function sourceHealthHistoryState(fileExists: boolean): "ok" | "missing" {
  return fileExists ? "ok" : "missing";
}

function hasCanonicalPipelineDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
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

export function hasCanonicalPipelineStatus(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  return value.app === "alpha-pon"
    && hasCanonicalPipelineDate(value.date)
    && value.runType === "daily"
    && (value.status === "ok" || value.status === "partial_failed")
    && Array.isArray(value.results)
    && Array.isArray(value.failedSteps)
    && hasCanonicalGeneratedAt(value.generatedAt);
}
