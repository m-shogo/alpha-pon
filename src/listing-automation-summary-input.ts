export type ListingAutomationCheckRow = Record<string, unknown>;

export type ListingAutomationCheckInput = {
  checks: ListingAutomationCheckRow[];
  invalid: boolean;
  reason: "ok" | "parse_error" | "invalid_root" | "invalid_checks" | "invalid_rows";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (!Array.isArray(parsed.checks)) {
    return { checks: [], invalid: true, reason: "invalid_checks" };
  }

  const checks = parsed.checks.filter(isRecord);
  if (checks.length !== parsed.checks.length) {
    return { checks, invalid: true, reason: "invalid_rows" };
  }
  return { checks, invalid: false, reason: "ok" };
}
