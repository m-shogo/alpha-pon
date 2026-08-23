export type SpecialOpsHealthStatus = "ok" | "needs_attention" | "action_required";

export type SpecialOpsActionItem = {
  priority?: string;
  title?: string;
  command?: string;
  detail?: string;
};

export function normalizeSpecialOpsHealthStatus(value: unknown): SpecialOpsHealthStatus | null {
  return value === "ok" || value === "needs_attention" || value === "action_required"
    ? value
    : null;
}

export function normalizeSpecialOpsActionItems(value: unknown): SpecialOpsActionItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.every(item => item !== null && typeof item === "object" && !Array.isArray(item))
    ? value as SpecialOpsActionItem[]
    : null;
}
