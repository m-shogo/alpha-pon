function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

const PRIMARY_DISCLOSURE_DECISIONS = new Set(["confirmed", "caution", "block", "missing"]);

export function hasValidPrimaryDisclosureReview(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (typeof value.decision !== "string" || !PRIMARY_DISCLOSURE_DECISIONS.has(value.decision)) return false;
  if (!isOptionalStringArray(value.warnings) || !isOptionalStringArray(value.blockers)) return false;
  if (!isRecord(value.sourceCoverage)) return false;
  if (typeof value.sourceCoverage.tdnetCount !== "number" || !Number.isFinite(value.sourceCoverage.tdnetCount)) return false;
  if (typeof value.sourceCoverage.edinetCount !== "number" || !Number.isFinite(value.sourceCoverage.edinetCount)) return false;
  return isOptionalFiniteNumber(value.sourceCoverage.fetchErrorCount)
    && isOptionalStringArray(value.sourceCoverage.scannedEdinetDates);
}

export function normalizeSourceHealthArray<T>(value: unknown): { rows: T[]; valid: boolean } {
  if (!Array.isArray(value)) {
    return { rows: [], valid: false };
  }
  return { rows: value as T[], valid: true };
}

export function normalizeSourceHealthScoreRows<T>(value: unknown): { rows: T[]; valid: boolean } {
  if (!Array.isArray(value) || value.some(row => !isRecord(row))) {
    return { rows: [], valid: false };
  }
  for (const row of value) {
    if (row.warnings !== undefined && !isStringArray(row.warnings)) {
      return { rows: [], valid: false };
    }
    if (!hasValidPrimaryDisclosureReview(row.primaryDisclosureReview)) {
      return { rows: [], valid: false };
    }
  }
  return { rows: value as T[], valid: true };
}

export function normalizeSourceHealthObject<T extends object>(value: unknown): { value: T | null; valid: boolean } {
  if (!isRecord(value)) {
    return { value: null, valid: false };
  }

  for (const field of ["steps", "results", "completeWrapperFailedSteps"] as const) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      return { value: null, valid: false };
    }
  }

  for (const field of ["steps", "results"] as const) {
    const rows = value[field];
    if (Array.isArray(rows) && rows.some(row => !isRecord(row))) {
      return { value: null, valid: false };
    }
  }

  const failedSteps = value.completeWrapperFailedSteps;
  if (Array.isArray(failedSteps) && failedSteps.some(step => typeof step !== "string")) {
    return { value: null, valid: false };
  }

  return { value: value as T, valid: true };
}
