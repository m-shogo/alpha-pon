export type SpecialOpsHealthStatus = "ok" | "needs_attention" | "action_required";

export type SpecialOpsActionItem = {
  priority?: string;
  title?: string;
  command?: string;
  detail?: string;
};

const ACTION_PRIORITIES = new Set(["urgent", "attention", "info", "ok"]);

function isCanonicalActionItem(value: unknown): value is SpecialOpsActionItem {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.priority !== "string" || !ACTION_PRIORITIES.has(item.priority)) return false;
  if (typeof item.title !== "string" || item.title.trim().length === 0 || item.title !== item.title.trim()) return false;
  if (item.command !== undefined && (typeof item.command !== "string" || item.command.trim().length === 0)) return false;
  if (item.detail !== undefined && typeof item.detail !== "string") return false;
  return true;
}

export function normalizeSpecialOpsHealthStatus(value: unknown): SpecialOpsHealthStatus | null {
  return value === "ok" || value === "needs_attention" || value === "action_required"
    ? value
    : null;
}

export function normalizeSpecialOpsActionItems(value: unknown): SpecialOpsActionItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(isCanonicalActionItem)
    ? value as SpecialOpsActionItem[]
    : null;
}
