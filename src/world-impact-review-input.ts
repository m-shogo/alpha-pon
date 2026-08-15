import {
  normalizeReadOnlyJsonArray,
  normalizeReadOnlyJsonObjectArrayField,
} from "./read-only-json.js";

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
    reflections: reflections.rows,
    candidates: candidates.rows,
    universeCandidates: universeCandidates.rows,
    generatedCompanyRules: generatedCompanyRules.rows,
    warnings: [...warnings],
  };
}
