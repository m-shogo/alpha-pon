import type { OpsWorldImpactAuditLike } from "./ops-dashboard.js";

const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return value as OpsWorldImpactAuditLike;
}
