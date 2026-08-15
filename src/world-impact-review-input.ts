import { addDaysJst } from "./date.js";
import {
  normalizeReadOnlyJsonArray,
  normalizeReadOnlyJsonObjectArrayField,
} from "./read-only-json.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isRealJstDate(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isReflectionRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.eventId)
    && isRealJstDate(value.createdAt)
    && isNonEmptyString(value.title)
    && typeof value.urgencyScore === "number"
    && Number.isFinite(value.urgencyScore)
    && isStringArray(value.categories)
    && isStringArray(value.impactedTags)
    && isNonEmptyString(value.thesis)
    && isStringArray(value.chainOfImpact)
    && isStringArray(value.possibleBeneficiaries)
    && isStringArray(value.possibleRisks)
    && isStringArray(value.evidenceNeeded)
    && isStringArray(value.invalidationSignals);
}

function isCandidateRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.code)
    && isNonEmptyString(value.name)
    && isOptionalStringArray(value.tags)
    && isOptionalStringArray(value.reasons)
    && isOptionalStringArray(value.negativeReasons)
    && isOptionalStringArray(value.nextToSee)
    && isOptionalStringArray(value.matchedWorldEventTags)
    && isOptionalStringArray(value.warnings)
    && (value.sector === undefined || value.sector === null || typeof value.sector === "string");
}

function isCompanyRuleRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.code === undefined || typeof value.code === "string")
    && (value.name === undefined || typeof value.name === "string")
    && isOptionalStringArray(value.thesis)
    && isOptionalStringArray(value.reasons)
    && isOptionalStringArray(value.risks)
    && isOptionalStringArray(value.evidenceNeeded);
}

function normalizeRows<T>(
  rows: T[],
  path: string,
  warnings: Set<string>,
  validator: (row: unknown) => boolean,
): T[] {
  const valid = rows.filter(row => validator(row));
  const dropped = rows.length - valid.length;
  if (dropped > 0) {
    warnings.add(`${path}: invalid_rows (expected compatible object rows; dropped ${dropped})`);
  }
  return valid;
}

export function normalizeWorldImpactReviewInputs<R, C, U, G>(
  reflectionsRaw: unknown,
  alphaRaw: unknown,
): {
  reflections: R[];
  candidates: C[];
  universeCandidates: U[];
  generatedCompanyRules: G[];
  warnings: string[];
} {
  const reflections = normalizeReadOnlyJsonArray<R>(reflectionsRaw);
  const candidates = normalizeReadOnlyJsonObjectArrayField<C>(alphaRaw, "candidates");
  const universeCandidates = normalizeReadOnlyJsonObjectArrayField<U>(alphaRaw, "universeCandidates");
  const generatedCompanyRules = normalizeReadOnlyJsonObjectArrayField<G>(alphaRaw, "generatedCompanyRules");

  const warnings = new Set<string>();
  if (reflections.invalidRoot) {
    warnings.add("data/world_event_reflections_latest.json: invalid_root (expected array)");
  }
  if (candidates.invalidRoot || universeCandidates.invalidRoot || generatedCompanyRules.invalidRoot) {
    warnings.add("apps/web/public/generated/alpha-pon-data.json: invalid_root (expected object)");
  }
  if (candidates.invalidField) {
    warnings.add("apps/web/public/generated/alpha-pon-data.json.candidates: invalid_field (expected array)");
  }
  if (universeCandidates.invalidField) {
    warnings.add("apps/web/public/generated/alpha-pon-data.json.universeCandidates: invalid_field (expected array)");
  }
  if (generatedCompanyRules.invalidField) {
    warnings.add("apps/web/public/generated/alpha-pon-data.json.generatedCompanyRules: invalid_field (expected array)");
  }

  return {
    reflections: normalizeRows(
      reflections.rows,
      "data/world_event_reflections_latest.json",
      warnings,
      isReflectionRow,
    ),
    candidates: normalizeRows(
      candidates.rows,
      "apps/web/public/generated/alpha-pon-data.json.candidates",
      warnings,
      isCandidateRow,
    ),
    universeCandidates: normalizeRows(
      universeCandidates.rows,
      "apps/web/public/generated/alpha-pon-data.json.universeCandidates",
      warnings,
      isCandidateRow,
    ),
    generatedCompanyRules: normalizeRows(
      generatedCompanyRules.rows,
      "apps/web/public/generated/alpha-pon-data.json.generatedCompanyRules",
      warnings,
      isCompanyRuleRow,
    ),
    warnings: [...warnings],
  };
}
