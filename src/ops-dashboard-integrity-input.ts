import { todayJst } from "./date.js";
import type { OpsIntegrityLike } from "./ops-dashboard.js";

const INTEGRITY_STATUSES = new Set(["ok", "duplicate_found", "db_unavailable", "parse_error"]);

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

function invalidIntegrityInput(): OpsIntegrityLike {
  return {
    status: "invalid_input",
    jsonl: { duplicateGroups: [], parseErrors: [{}] },
    sqlite: { duplicateGroups: [] },
  };
}

export function normalizeOpsIntegrityInput(
  value: unknown,
  asOf = todayJst(),
): OpsIntegrityLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidIntegrityInput();
  if (!isStrictGregorianDate(value.generatedAt) || value.generatedAt !== asOf) {
    return invalidIntegrityInput();
  }
  if (typeof value.status !== "string" || !INTEGRITY_STATUSES.has(value.status)) {
    return invalidIntegrityInput();
  }

  if (!isRecord(value.jsonl)) return invalidIntegrityInput();
  if (!Array.isArray(value.jsonl.duplicateGroups) || !Array.isArray(value.jsonl.parseErrors)) {
    return invalidIntegrityInput();
  }

  if (!isRecord(value.sqlite)) return invalidIntegrityInput();
  if (!Array.isArray(value.sqlite.duplicateGroups)) return invalidIntegrityInput();
  if (
    value.sqlite.invalidPayloadRows !== undefined
    && !isNonNegativeInteger(value.sqlite.invalidPayloadRows)
  ) {
    return invalidIntegrityInput();
  }
  if (
    value.sqlite.error !== undefined
    && value.sqlite.error !== null
    && (typeof value.sqlite.error !== "string" || value.sqlite.error.trim().length === 0)
  ) {
    return invalidIntegrityInput();
  }

  const hasFindings =
    value.jsonl.duplicateGroups.length > 0 ||
    value.jsonl.parseErrors.length > 0 ||
    value.sqlite.duplicateGroups.length > 0 ||
    (isNonNegativeInteger(value.sqlite.invalidPayloadRows) && value.sqlite.invalidPayloadRows > 0) ||
    (typeof value.sqlite.error === "string" && value.sqlite.error.trim().length > 0);
  if (value.status === "ok" && hasFindings) return invalidIntegrityInput();

  return value as OpsIntegrityLike;
}
