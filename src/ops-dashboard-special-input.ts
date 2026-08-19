import { todayJst } from "./date.js";
import type { OpsSpecialOpsLike } from "./ops-dashboard.js";

const INVALID_SPECIAL_INPUT_TITLE = "invalid_special_situation_ops_input";
const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);
const ACTION_PRIORITIES = new Set(["urgent", "attention", "info", "ok"]);
const REVIEW_DUE_KEYS = ["overdue", "historicalSeedOverdue", "priceDataPending", "dueToday", "dueThisWeek"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function invalidSpecialOps(): OpsSpecialOpsLike {
  return {
    healthStatus: "action_required",
    actionItems: [{ priority: "urgent", title: INVALID_SPECIAL_INPUT_TITLE }],
    reviewDue: { overdue: 0, historicalSeedOverdue: 0, priceDataPending: 0, dueToday: 0, dueThisWeek: 0 },
  };
}

export function normalizeOpsSpecialSituationInput(
  value: unknown,
  asOf = todayJst(),
): OpsSpecialOpsLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidSpecialOps();

  if (
    !isStrictGregorianDate(value.generatedAt) ||
    !isStrictGregorianDate(value.today) ||
    value.generatedAt !== value.today ||
    value.generatedAt !== asOf
  ) {
    return invalidSpecialOps();
  }

  if (typeof value.healthStatus !== "string" || !HEALTH_STATUSES.has(value.healthStatus)) {
    return invalidSpecialOps();
  }

  if (!Array.isArray(value.actionItems)) return invalidSpecialOps();
  const priorities: string[] = [];
  for (const item of value.actionItems) {
    if (!isRecord(item)) return invalidSpecialOps();
    if (typeof item.priority !== "string" || !ACTION_PRIORITIES.has(item.priority)) return invalidSpecialOps();
    priorities.push(item.priority);
    if (typeof item.title !== "string" || item.title.trim().length === 0) return invalidSpecialOps();
    if (item.command !== undefined && typeof item.command !== "string") return invalidSpecialOps();
  }

  const expectedHealth = priorities.includes("urgent")
    ? "action_required"
    : priorities.includes("attention")
      ? "needs_attention"
      : "ok";
  if (value.healthStatus !== expectedHealth) return invalidSpecialOps();

  if (!isRecord(value.reviewDue)) return invalidSpecialOps();
  for (const key of REVIEW_DUE_KEYS) {
    if (!isNonNegativeInteger(value.reviewDue[key])) return invalidSpecialOps();
  }

  return value as OpsSpecialOpsLike;
}
