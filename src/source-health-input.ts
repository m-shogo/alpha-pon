function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null || (isRecord(value) && Object.keys(value).length > 0);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeInteger(value);
}

const DATA_QUALITIES = new Set(["ok", "partial", "missing"]);
const PRIMARY_DISCLOSURE_DECISIONS = new Set(["confirmed", "caution", "block", "missing"]);

export function hasValidPrimaryDisclosureReview(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (typeof value.decision !== "string" || !PRIMARY_DISCLOSURE_DECISIONS.has(value.decision)) return false;
  if (!isOptionalStringArray(value.warnings) || !isOptionalStringArray(value.blockers)) return false;
  if (!isRecord(value.sourceCoverage)) return false;
  if (!isNonNegativeInteger(value.sourceCoverage.tdnetCount)) return false;
  if (!isNonNegativeInteger(value.sourceCoverage.edinetCount)) return false;
  const evidenceCount = value.sourceCoverage.tdnetCount + value.sourceCoverage.edinetCount;
  if (!isOptionalNonNegativeInteger(value.sourceCoverage.fetchErrorCount)) return false;
  const fetchErrorCount = typeof value.sourceCoverage.fetchErrorCount === "number"
    ? value.sourceCoverage.fetchErrorCount
    : 0;
  if (
    value.decision === "confirmed"
    && (
      evidenceCount === 0
      || (Array.isArray(value.warnings) && value.warnings.length > 0)
      || (Array.isArray(value.blockers) && value.blockers.length > 0)
      || fetchErrorCount > 0
    )
  ) {
    return false;
  }
  if (
    value.decision === "caution"
    && (
      !Array.isArray(value.warnings)
      || value.warnings.length === 0
      || (evidenceCount === 0 && fetchErrorCount === 0)
    )
  ) {
    return false;
  }
  if (
    value.decision === "block"
    && (
      evidenceCount === 0
      || !Array.isArray(value.blockers)
      || value.blockers.length === 0
    )
  ) {
    return false;
  }
  return isOptionalStringArray(value.sourceCoverage.scannedEdinetDates);
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
    if (row.dataQuality !== undefined && (typeof row.dataQuality !== "string" || !DATA_QUALITIES.has(row.dataQuality))) {
      return { rows: [], valid: false };
    }
    if (row.warnings !== undefined && !isStringArray(row.warnings)) {
      return { rows: [], valid: false };
    }
    if (!isOptionalRecord(row.marketContext) || !isOptionalRecord(row.financialQuality)) {
      return { rows: [], valid: false };
    }
    if (!hasValidPrimaryDisclosureReview(row.primaryDisclosureReview)) {
      return { rows: [], valid: false };
    }
  }
  return { rows: value as T[], valid: true };
}

export function hasUniqueSourceHealthScoreIdentities(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seenCodes = new Set<string>();
  for (const row of value) {
    if (
      !isRecord(row)
      || typeof row.code !== "string"
      || row.code.length === 0
      || row.code !== row.code.trim()
      || seenCodes.has(row.code)
    ) {
      return false;
    }
    seenCodes.add(row.code);
  }
  return true;
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
