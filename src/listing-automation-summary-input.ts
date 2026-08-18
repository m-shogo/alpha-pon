export type ListingAutomationCheckRow = Record<string, unknown>;

export type ListingAutomationCheckInput = {
  checks: ListingAutomationCheckRow[];
  invalid: boolean;
  reason: "ok" | "parse_error" | "invalid_root" | "invalid_checks" | "invalid_rows";
};

const CHECK_STATUSES = new Set(["ok", "warning", "missing", "fail"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCanonicalStatus(value: Record<string, unknown>): boolean {
  return typeof value.status === "string" && CHECK_STATUSES.has(value.status);
}

export function parseListingAutomationCheckInput(text: string): ListingAutomationCheckInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { checks: [], invalid: true, reason: "parse_error" };
  }

  if (!isRecord(parsed)) {
    return { checks: [], invalid: true, reason: "invalid_root" };
  }
  if (!Array.isArray(parsed.checks) || parsed.checks.length === 0) {
    return { checks: [], invalid: true, reason: "invalid_checks" };
  }

  const checks = parsed.checks.filter(isRecord);
  if (checks.length !== parsed.checks.length || !checks.every(hasCanonicalStatus)) {
    return { checks, invalid: true, reason: "invalid_rows" };
  }
  return { checks, invalid: false, reason: "ok" };
}

export function listingAutomationReadinessStatus(checks: ListingAutomationCheckRow[]): "ok" | "warning" | "fail" {
  if (checks.some(check => check.status === "fail")) return "fail";
  return checks.some(check => check.status === "missing" || check.status === "warning") ? "warning" : "ok";
}
