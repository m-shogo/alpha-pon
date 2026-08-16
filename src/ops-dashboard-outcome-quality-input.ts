import type { OpsOutcomeQualityLike } from "./ops-dashboard.js";

const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);
const CHECK_KEYS = [
  "reviewMissing",
  "horizonGaps",
  "judgedWithLimitedData",
  "unknownMatchedAsHit",
  "pendingWithSignals",
  "emptyReviewNotes",
  "dueAtMismatch",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidOutcomeQualityInput(): OpsOutcomeQualityLike {
  return {
    healthStatus: "action_required",
    checks: { invalidInput: { count: 1 } },
  };
}

export function normalizeOpsOutcomeQualityInput(value: unknown): OpsOutcomeQualityLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidOutcomeQualityInput();
  if (typeof value.healthStatus !== "string" || !HEALTH_STATUSES.has(value.healthStatus)) {
    return invalidOutcomeQualityInput();
  }
  if (!isRecord(value.checks)) return invalidOutcomeQualityInput();

  for (const key of CHECK_KEYS) {
    const check = value.checks[key];
    if (!isRecord(check)) return invalidOutcomeQualityInput();
    const count = check.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      return invalidOutcomeQualityInput();
    }
  }

  return value as OpsOutcomeQualityLike;
}
