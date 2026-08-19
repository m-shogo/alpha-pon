import type { QualityHypothesisLike, QualityOutcomeLike } from "./outcome-quality-audit.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalCode(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isGregorianDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
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
  if (!isCanonicalCode(value.code) || !isGregorianDate(value.detectedAt)) return false;
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
  if (!isCanonicalCode(value.code)) return false;
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
