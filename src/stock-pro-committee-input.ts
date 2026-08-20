function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function isStockProCommitteeDecision(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isCanonicalText(value.code)
    && isCanonicalText(value.name)
    && isCanonicalText(value.finalLabel)
    && typeof value.finalScore === "number"
    && Number.isFinite(value.finalScore)
    && (value.originalFinalLabel === undefined || value.originalFinalLabel === null || isCanonicalText(value.originalFinalLabel));
}
