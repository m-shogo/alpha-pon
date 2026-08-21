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
  return value == null || (
    Array.isArray(value)
    && value.every(item => typeof item === "string" && item.length > 0 && item === item.trim())
  );
}

function isOptionalEnum(value: unknown, allowed: readonly string[]): boolean {
  return value == null || (typeof value === "string" && allowed.includes(value));
}

function isRequiredEnum(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

const REVIEW_HORIZONS = ["1d", "1w", "1m", "3m"] as const;
const OUTCOME_RESULTS = ["hit", "miss", "too_early", "invalidated", "unknown"] as const;
const DATA_AVAILABILITY = ["ok", "partial", "missing"] as const;
const DIRECTIONS = ["up", "down", "sideways", "unknown"] as const;
const HYPOTHESIS_TIMEFRAMES = ["1w", "1m", "3m"] as const;

export function isQualityHypothesisLike(value: unknown): value is QualityHypothesisLike {
  if (!isRecord(value)) return false;
  if (!isCanonicalCode(value.code) || !isGregorianDate(value.detectedAt)) return false;
  if (!hasOnlyOptionalStringFields(value, [
    "code",
    "name",
    "detectedAt",
    "reviewDueAt",
    "expectedTimeframe",
    "expectedDirection",
  ])) return false;
  if (value.reviewDueAt != null && !isGregorianDate(value.reviewDueAt)) return false;
  if (!isOptionalEnum(value.expectedTimeframe, HYPOTHESIS_TIMEFRAMES)) return false;
  if (!isOptionalEnum(value.expectedDirection, DIRECTIONS)) return false;
  return true;
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
  if (!isRequiredEnum(value.reviewHorizon, REVIEW_HORIZONS)) return false;
  if (!isRequiredEnum(value.result, OUTCOME_RESULTS)) return false;
  if (!isRequiredEnum(value.dataAvailability, DATA_AVAILABILITY)) return false;
  if (!isRequiredEnum(value.actualDirection, DIRECTIONS)) return false;
  if (!isOptionalStringArray(value.whatMatched) || !isOptionalStringArray(value.missedSignals)) return false;
  if (!isQualityHypothesisLike(value.hypothesis)) return false;
  return value.hypothesis.code === value.code;
}
