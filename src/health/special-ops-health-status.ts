export type SpecialOpsHealthStatus = "ok" | "needs_attention" | "action_required";

export function normalizeSpecialOpsHealthStatus(value: unknown): SpecialOpsHealthStatus | null {
  return value === "ok" || value === "needs_attention" || value === "action_required"
    ? value
    : null;
}
