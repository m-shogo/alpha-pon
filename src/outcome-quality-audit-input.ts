import type { QualityHypothesisLike, QualityOutcomeLike } from "./outcome-quality-audit.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyOptionalStringFields(
  value: Record<string, unknown>,
  fields: string[],
): boolean {
  return fields.every(field => value[field] == null || typeof value[field] === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

export function isQualityHypothesisLike(value: unknown): value is QualityHypothesisLike {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.code)) return false;
  return hasOnlyOptionalStringFields(value, [
    "code",
    "name",
    "detectedAt",
    "reviewDueAt",
    "expectedTimeframe",
    "expectedDirection",
  ]);
}

export function isQualityOutcomeLike(value: unknown): value is QualityOutcomeLike {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.code)) return false;
  if (!hasOnlyOptionalStringFields(value, [
    "code",
    "name",
    "reviewHorizon",
    "result",
    "dataAvailability",
    "actualDirection",
    "notes",
  ])) return false;
  if (!isOptionalStringArray(value.whatMatched) || !isOptionalStringArray(value.missedSignals)) return false;
  return value.hypothesis == null || isQualityHypothesisLike(value.hypothesis);
}
