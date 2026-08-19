import { todayJst } from "./date.js";
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

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function invalidOutcomeQualityInput(): OpsOutcomeQualityLike {
  return {
    healthStatus: "action_required",
    checks: { invalidInput: { count: 1 } },
  };
}

export function normalizeOpsOutcomeQualityInput(
  value: unknown,
  asOf = todayJst(),
): OpsOutcomeQualityLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidOutcomeQualityInput();
  if (!isStrictGregorianDate(value.generatedAt) || value.generatedAt !== asOf) {
    return invalidOutcomeQualityInput();
  }
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
