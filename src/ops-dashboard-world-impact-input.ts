import type { OpsWorldImpactAuditLike } from "./ops-dashboard.js";

const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);
const ISSUE_SEVERITIES = new Set(["urgent", "attention", "info"]);
const OPTIONAL_COUNTER_KEYS = [
  "missingCounterArguments",
  "missingMechanisms",
  "dataUnavailable",
  "priceDataPending",
  "sourceQualityUnknown",
  "unknownMatchedAsHit",
  "insufficientData",
  "confidenceMissing",
  "mechanismUnknown",
  "falsificationMissing",
  "jsonlParseErrors",
  "latestMismatch",
  "dueWithoutOutcome",
  "resultEnumViolations",
  "directionEnumViolations",
  "confidenceOutOfRange",
  "autoMissReasonViolations",
  "missReasonConflicts",
  "insufficientDataWithReturn",
  "judgedWithoutReturn",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function invalidWorldImpactInput(): OpsWorldImpactAuditLike {
  return {
    healthStatus: "action_required",
    priorityIssues: [
      {
        severity: "urgent",
        title: "World Impact audit input invalid",
        detail: "reports/world-impact-audit.json のroot shapeまたはhealthStatusが不正です。",
      },
    ],
  };
}

export function normalizeOpsWorldImpactInput(value: unknown): OpsWorldImpactAuditLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidWorldImpactInput();
  if (typeof value.healthStatus !== "string" || !HEALTH_STATUSES.has(value.healthStatus)) {
    return invalidWorldImpactInput();
  }
  if (
    !isNonNegativeInteger(value.totalReviews)
    || !isNonNegativeInteger(value.pendingReviews)
    || !isNonNegativeInteger(value.overdueReviews)
  ) {
    return invalidWorldImpactInput();
  }
  for (const key of OPTIONAL_COUNTER_KEYS) {
    if (value[key] !== undefined && !isNonNegativeInteger(value[key])) {
      return invalidWorldImpactInput();
    }
  }
  if (value.overdueReviews > value.pendingReviews) {
    return invalidWorldImpactInput();
  }

  if (!Array.isArray(value.priorityIssues)) return invalidWorldImpactInput();
  const severities: string[] = [];
  for (const issue of value.priorityIssues) {
    if (!isRecord(issue)) return invalidWorldImpactInput();
    if (typeof issue.severity !== "string" || !ISSUE_SEVERITIES.has(issue.severity)) return invalidWorldImpactInput();
    if (typeof issue.title !== "string" || issue.title.trim().length === 0) return invalidWorldImpactInput();
    if (typeof issue.detail !== "string") return invalidWorldImpactInput();
    severities.push(issue.severity);
  }

  if (
    value.overdueReviews > 0
    && !severities.some(severity => severity === "urgent" || severity === "attention")
  ) {
    return invalidWorldImpactInput();
  }

  const expectedHealth = severities.includes("urgent")
    ? "action_required"
    : severities.includes("attention")
      ? "needs_attention"
      : "ok";
  if (value.healthStatus !== expectedHealth) return invalidWorldImpactInput();

  return value as OpsWorldImpactAuditLike;
}
