import type { OpsSpecialOpsLike } from "./ops-dashboard.js";

const INVALID_SPECIAL_INPUT_TITLE = "invalid_special_situation_ops_input";
const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);
const ACTION_PRIORITIES = new Set(["urgent", "attention", "info", "ok"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function invalidSpecialOps(): OpsSpecialOpsLike {
  return {
    healthStatus: "action_required",
    actionItems: [{ priority: "urgent", title: INVALID_SPECIAL_INPUT_TITLE }],
    reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 },
  };
}

export function normalizeOpsSpecialSituationInput(value: unknown): OpsSpecialOpsLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidSpecialOps();

  if (typeof value.healthStatus !== "string" || !HEALTH_STATUSES.has(value.healthStatus)) {
    return invalidSpecialOps();
  }

  const priorities: string[] = [];
  if (value.actionItems !== undefined) {
    if (!Array.isArray(value.actionItems)) return invalidSpecialOps();
    for (const item of value.actionItems) {
      if (!isRecord(item)) return invalidSpecialOps();
      if (typeof item.priority !== "string" || !ACTION_PRIORITIES.has(item.priority)) return invalidSpecialOps();
      priorities.push(item.priority);
      if (typeof item.title !== "string" || item.title.trim().length === 0) return invalidSpecialOps();
      if (item.command !== undefined && typeof item.command !== "string") return invalidSpecialOps();
    }
  }

  if (priorities.includes("urgent") && value.healthStatus !== "action_required") return invalidSpecialOps();
  if (priorities.includes("attention") && value.healthStatus === "ok") return invalidSpecialOps();

  if (value.reviewDue !== undefined) {
    if (!isRecord(value.reviewDue)) return invalidSpecialOps();
    for (const key of ["overdue", "historicalSeedOverdue", "priceDataPending", "dueToday", "dueThisWeek"] as const) {
      const count = value.reviewDue[key];
      if (count !== undefined && !isFiniteNonNegativeNumber(count)) return invalidSpecialOps();
    }
  }

  return value as OpsSpecialOpsLike;
}
