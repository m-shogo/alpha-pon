import type { OpsAlphaDataLike } from "./ops-dashboard.js";

const INVALID_WARNINGS_MESSAGE = "alpha-pon-data.json meta.warnings の形式が不正です";

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
