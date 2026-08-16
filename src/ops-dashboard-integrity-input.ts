import type { OpsIntegrityLike } from "./ops-dashboard.js";

const INTEGRITY_STATUSES = new Set(["ok", "warning", "action_required", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidIntegrityInput(): OpsIntegrityLike {
  return {
    status: "invalid_input",
    jsonl: { duplicateGroups: [], parseErrors: [{}] },
    sqlite: { duplicateGroups: [] },
  };
}

export function normalizeOpsIntegrityInput(value: unknown): OpsIntegrityLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidIntegrityInput();
  if (typeof value.status !== "string" || !INTEGRITY_STATUSES.has(value.status)) {
    return invalidIntegrityInput();
  }

  if (value.jsonl !== undefined) {
    if (!isRecord(value.jsonl)) return invalidIntegrityInput();
    if (value.jsonl.duplicateGroups !== undefined && !Array.isArray(value.jsonl.duplicateGroups)) {
      return invalidIntegrityInput();
    }
    if (value.jsonl.parseErrors !== undefined && !Array.isArray(value.jsonl.parseErrors)) {
      return invalidIntegrityInput();
    }
  }

  if (value.sqlite !== undefined) {
    if (!isRecord(value.sqlite)) return invalidIntegrityInput();
    if (value.sqlite.duplicateGroups !== undefined && !Array.isArray(value.sqlite.duplicateGroups)) {
      return invalidIntegrityInput();
    }
  }

  return value as OpsIntegrityLike;
}
