import type { OpsAlphaDataLike } from "./ops-dashboard.js";

const INVALID_WARNINGS_MESSAGE = "alpha-pon-data.json meta.warnings の形式が不正です";
const INVALID_DATA_QUALITY_WARNINGS_MESSAGE = "alpha-pon-data.json dataQualityByCode warnings の形式が不正です";
const INVALID_DATA_QUALITY_LEVEL_MESSAGE = "alpha-pon-data.json dataQualityByCode quality.level の形式が不正です";
const INVALID_UNIVERSE_SCAN_MESSAGE = "alpha-pon-data.json universeScan の形式が不正です";

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
  if (!alphaData) return alphaData;

  let normalizedAlpha = alphaData;
  const rawUniverseScan = alphaData.universeScan as unknown;
  if (rawUniverseScan !== undefined && rawUniverseScan !== null) {
    let validUniverseScan = false;
    if (typeof rawUniverseScan === "object" && !Array.isArray(rawUniverseScan)) {
      const scan = rawUniverseScan as { scanStatus?: unknown; fallbackReason?: unknown };
      const scanStatus = scan.scanStatus;
      const fallbackReason = scan.fallbackReason ?? null;
      validUniverseScan =
        (scanStatus === "fresh" && fallbackReason === null)
        || (scanStatus === "mock" && fallbackReason === null)
        || (scanStatus === "stale_fallback" && fallbackReason === "jquants_zero_candidates");
    }
    if (!validUniverseScan) {
      const warnings = [...(alphaData.meta?.warnings ?? []), INVALID_UNIVERSE_SCAN_MESSAGE];
      normalizedAlpha = { ...alphaData, meta: { warnings }, universeScan: null };
    }
  }

  if (normalizedAlpha.dataQualityByCode == null) return normalizedAlpha;

  const rawEntries = normalizedAlpha.dataQualityByCode as unknown;
  if (typeof rawEntries !== "object" || Array.isArray(rawEntries)) {
    const warnings = [...(normalizedAlpha.meta?.warnings ?? []), INVALID_DATA_QUALITY_WARNINGS_MESSAGE];
    return { ...normalizedAlpha, meta: { warnings }, dataQualityByCode: {} };
  }

  let malformedWarningsCount = 0;
  let malformedLevelCount = 0;
  let changedCount = 0;
  const normalizedEntries: NonNullable<OpsAlphaDataLike["dataQualityByCode"]> = {};
  for (const [code, rawEntry] of Object.entries(rawEntries as Record<string, unknown>)) {
    if (code.trim() === "" || code !== code.trim()) {
      malformedWarningsCount += 1;
      continue;
    }
    if (rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      normalizedEntries[code] = {};
      malformedWarningsCount += 1;
      continue;
    }

    const entry = rawEntry as NonNullable<OpsAlphaDataLike["dataQualityByCode"]>[string] & { warnings?: unknown };
    let nextEntry = entry as NonNullable<OpsAlphaDataLike["dataQualityByCode"]>[string];

    const rawQuality = entry.quality as unknown;
    if (rawQuality !== undefined && (rawQuality === null || typeof rawQuality !== "object" || Array.isArray(rawQuality))) {
      nextEntry = { ...nextEntry, quality: undefined };
      malformedLevelCount += 1;
      changedCount += 1;
    } else {
      const rawLevel = (rawQuality as { level?: unknown } | undefined)?.level;
      if (rawLevel !== undefined) {
        if (rawLevel === "full") {
          nextEntry = { ...nextEntry, quality: { ...nextEntry.quality, level: "ok" } };
          changedCount += 1;
        } else if (rawLevel !== "partial" && rawLevel !== "low" && rawLevel !== "ok") {
          nextEntry = { ...nextEntry, quality: undefined };
          malformedLevelCount += 1;
          changedCount += 1;
        }
      }
    }

    if (entry.warnings !== undefined && !(Array.isArray(entry.warnings) && entry.warnings.every(item => typeof item === "string"))) {
      nextEntry = { ...nextEntry, warnings: [] };
      malformedWarningsCount += 1;
      changedCount += 1;
    }

    normalizedEntries[code] = nextEntry;
  }

  if (malformedWarningsCount === 0 && malformedLevelCount === 0 && changedCount === 0) return normalizedAlpha;
  const warnings = [...(normalizedAlpha.meta?.warnings ?? [])];
  if (malformedWarningsCount > 0) {
    warnings.push(`${INVALID_DATA_QUALITY_WARNINGS_MESSAGE}（${malformedWarningsCount}件）`);
  }
  if (malformedLevelCount > 0) {
    warnings.push(`${INVALID_DATA_QUALITY_LEVEL_MESSAGE}（${malformedLevelCount}件）`);
  }
  return { ...normalizedAlpha, meta: { warnings }, dataQualityByCode: normalizedEntries };
}
