import { addDaysJst, formatJstDate, todayJst } from "./date.js";
import { parseExplicitIso8601Instant } from "./research/iso-instant.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null || (isRecord(value) && Object.keys(value).length > 0);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.trim().length > 0);
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isStrictJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isOptionalStrictJstDateArray(value: unknown): boolean {
  return value === undefined || (isStringArray(value) && value.every(item => isStrictJstDate(item) && item <= todayJst()));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeInteger(value);
}

function hasUniqueNamedRows(value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  const names = value.map(row => (isRecord(row) && typeof row.name === "string" ? row.name : ""));
  return names.length === new Set(names).size;
}

function hasValidPipelineGeneratedAt(value: unknown, date: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try {
    parseExplicitIso8601Instant(value, "source health pipeline generatedAt");
  } catch {
    return false;
  }
  return typeof date !== "string" || formatJstDate(new Date(value)) === date;
}

const DATA_QUALITIES = new Set(["ok", "partial", "missing"]);
const PRIMARY_DISCLOSURE_DECISIONS = new Set(["confirmed", "caution", "block", "missing"]);
const PIPELINE_STATUSES = new Set([
  "ok",
  "partial_failed",
  "running",
  "skipped_locked",
  "failed",
  "completed_with_warnings",
  "completed",
]);
const PIPELINE_STEP_STATUSES = new Set(["ok", "failed", "skipped"]);
const PIPELINE_RESULT_STATUSES = new Set(["ok", "skip", "fail"]);

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
      || (Array.isArray(value.blockers) && value.blockers.length > 0)
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
  if (
    value.decision === "missing"
    && (
      evidenceCount > 0
      || fetchErrorCount > 0
      || (Array.isArray(value.warnings) && value.warnings.length > 0)
      || (Array.isArray(value.blockers) && value.blockers.length > 0)
    )
  ) {
    return false;
  }
  return isOptionalStrictJstDateArray(value.sourceCoverage.scannedEdinetDates);
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
      || typeof row.name !== "string"
      || row.name.trim().length === 0
      || row.name !== row.name.trim()
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

  if (typeof value.status !== "string" || !PIPELINE_STATUSES.has(value.status)) {
    return { value: null, valid: false };
  }

  if (
    value.date !== undefined
    && (
      typeof value.date !== "string"
      || !isStrictJstDate(value.date)
      || value.date > todayJst()
    )
  ) {
    return { value: null, valid: false };
  }

  if (!hasValidPipelineGeneratedAt(value.generatedAt, value.date)) {
    return { value: null, valid: false };
  }

  if (
    value.failedSteps !== undefined
    && typeof value.failedSteps !== "string"
    && !isStringArray(value.failedSteps)
  ) {
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

  const steps = value.steps;
  if (
    Array.isArray(steps)
    && steps.some(row => (
      !isRecord(row)
      || typeof row.name !== "string"
      || row.name.trim().length === 0
      || row.name !== row.name.trim()
      || typeof row.status !== "string"
      || !PIPELINE_STEP_STATUSES.has(row.status)
    ))
  ) {
    return { value: null, valid: false };
  }
  if (!hasUniqueNamedRows(steps)) {
    return { value: null, valid: false };
  }

  const results = value.results;
  if (
    Array.isArray(results)
    && results.some(row => (
      !isRecord(row)
      || typeof row.name !== "string"
      || row.name.trim().length === 0
      || row.name !== row.name.trim()
      || typeof row.status !== "string"
      || !PIPELINE_RESULT_STATUSES.has(row.status)
    ))
  ) {
    return { value: null, valid: false };
  }
  if (!hasUniqueNamedRows(results)) {
    return { value: null, valid: false };
  }

  const completeWrapperFailedSteps = value.completeWrapperFailedSteps;
  if (
    Array.isArray(completeWrapperFailedSteps)
    && completeWrapperFailedSteps.some(step => typeof step !== "string" || step.trim().length === 0 || step !== step.trim())
  ) {
    return { value: null, valid: false };
  }

  const hasDailyFailure = typeof value.failedSteps === "string"
    ? value.failedSteps.trim().length > 0
    : Array.isArray(value.failedSteps) && value.failedSteps.length > 0;
  const hasStepFailure = Array.isArray(steps)
    && steps.some(row => isRecord(row) && row.status === "failed");
  const hasResultFailure = Array.isArray(results)
    && results.some(row => isRecord(row) && row.status === "fail");
  const hasRunDailyFailureEvidence = hasDailyFailure || hasStepFailure || hasResultFailure;

  if (
    (value.status === "ok" && hasRunDailyFailureEvidence)
    || (value.status === "partial_failed" && !hasRunDailyFailureEvidence)
    || (value.status === "completed" && hasRunDailyFailureEvidence)
    || (value.status === "completed_with_warnings" && !hasRunDailyFailureEvidence)
  ) {
    return { value: null, valid: false };
  }

  return { value: value as T, valid: true };
}
