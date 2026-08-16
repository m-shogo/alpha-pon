import type { OpsAlphaDataLike } from "./ops-dashboard.js";

const INVALID_WARNINGS_MESSAGE = "alpha-pon-data.json meta.warnings の形式が不正です";
const INVALID_DATA_QUALITY_WARNINGS_MESSAGE = "alpha-pon-data.json dataQualityByCode warnings の形式が不正です";

export function normalizeOpsAlphaWarningsInput(
  alphaData: OpsAlphaDataLike | null,
): OpsAlphaDataLike | null {
  if (!alphaData) return null;

  const rawMeta = alphaData.meta as unknown;
  if (rawMeta === undefined || rawMeta === null) return alphaData;
  if (typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
    return { ...alphaData, meta: { warnings: [INVALID_WARNINGS_MESSAGE] } };
  }

  const rawWarnings = (rawMeta as { warnings?: unknown }).warnings;
  if (rawWarnings === undefined) return alphaData;
  if (Array.isArray(rawWarnings) && rawWarnings.every(item => typeof item === "string")) {
    return alphaData;
  }

  return { ...alphaData, meta: { warnings: [INVALID_WARNINGS_MESSAGE] } };
}

export function normalizeOpsAlphaDataQualityWarningsInput(
  alphaData: OpsAlphaDataLike | null,
): OpsAlphaDataLike | null {
  if (!alphaData || alphaData.dataQualityByCode == null) return alphaData;

  const rawEntries = alphaData.dataQualityByCode as unknown;
  if (typeof rawEntries !== "object" || Array.isArray(rawEntries)) {
    const warnings = [...(alphaData.meta?.warnings ?? []), INVALID_DATA_QUALITY_WARNINGS_MESSAGE];
    return { ...alphaData, meta: { warnings }, dataQualityByCode: {} };
  }

  let malformedCount = 0;
  const normalizedEntries: NonNullable<OpsAlphaDataLike["dataQualityByCode"]> = {};
  for (const [code, rawEntry] of Object.entries(rawEntries as Record<string, unknown>)) {
    if (rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      normalizedEntries[code] = {};
      malformedCount += 1;
      continue;
    }

    const entry = rawEntry as NonNullable<OpsAlphaDataLike["dataQualityByCode"]>[string] & { warnings?: unknown };
    if (entry.warnings === undefined || (Array.isArray(entry.warnings) && entry.warnings.every(item => typeof item === "string"))) {
      normalizedEntries[code] = entry as NonNullable<OpsAlphaDataLike["dataQualityByCode"]>[string];
      continue;
    }

    normalizedEntries[code] = { ...entry, warnings: [] };
    malformedCount += 1;
  }

  if (malformedCount === 0) return alphaData;
  const warnings = [...(alphaData.meta?.warnings ?? []), `${INVALID_DATA_QUALITY_WARNINGS_MESSAGE}（${malformedCount}件）`];
  return { ...alphaData, meta: { warnings }, dataQualityByCode: normalizedEntries };
}
