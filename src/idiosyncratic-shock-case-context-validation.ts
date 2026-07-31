import type { ShockSource } from "./idiosyncratic-shock.js";
import type { HistoricalShockCaseContext, HistoricalShockReactionAnchor } from "./idiosyncratic-shock-case-context.js";

const ENUMS = {
  stakeholder: new Set(["public", "customer", "employee", "supplier", "regulator", "investor", "mixed", "unknown"]),
  incidentScope: new Set(["individual", "site", "multi_unit", "company_wide", "unknown"]),
  confounderStatus: new Set(["clear", "possible", "major", "unknown"]),
  informationLeakStatus: new Set(["clear", "possible", "likely", "unknown"]),
  recurrenceStatus: new Set(["first_known", "related_multiple", "systemic", "unknown"]),
  remediationStatus: new Set(["none", "weak", "partial", "credible", "unknown"]),
  listingStructure: new Set(["parent", "subsidiary", "joint_venture", "affiliate", "standalone", "unknown"]),
  ownershipControl: new Set(["dispersed", "controlled", "family_controlled", "state_linked", "private_parent", "unknown"]),
  liquidityStatus: new Set(["normal", "thin", "halted", "limit_locked", "unknown"]),
  incidentClusterStatus: new Set(["single", "related_multiple", "cascade", "unknown"]),
  disclosureObservability: new Set(["high", "medium", "low", "unknown"]),
  announcementTiming: new Set(["before_open", "during_session", "after_close", "non_trading_day", "unknown"]),
  strategyEligibilityAtCheckpoint: new Set(["confirmed_pass", "confirmed_block", "unknown"]),
  calibrationEligibilityAtCheckpoint: new Set(["confirmed_pass", "confirmed_block", "unknown"]),
  strategyInvestigationStatusAtCheckpoint: new Set(["open", "substantially_complete", "closed", "not_applicable", "unknown"]),
} as const;

const STRING_FIELDS = [
  "incidentCountry",
  "sector",
  "priceReactionStartDate",
  "reactionAnchorNotes",
  "calibrationEligibilityNotes",
  "strategyEligibilityNotes",
  "notes",
] as const;

const NUMBER_FIELDS = [
  "incidentRevenueExposurePct",
  "estimatedDirectCostPctMarketCap",
  "industryRelativeShockDrawdownPct",
] as const;

const BOOLEAN_FIELDS = [
  "strategyCriticalLicenseOrDelistingRiskAtCheckpoint",
] as const;

const SOURCE_TYPES = new Set(["company", "regulator", "exchange", "major_media", "other"]);

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function optionalEnum(record: Record<string, unknown>, key: keyof typeof ENUMS, label: string): void {
  const value = record[key];
  if (value == null) return;
  if (typeof value !== "string" || !ENUMS[key].has(value as never)) {
    throw new Error(`${label}.${key}: invalid enum value=${String(value)}`);
  }
}

function optionalString(record: Record<string, unknown>, key: string, label: string): void {
  const value = record[key];
  if (value != null && typeof value !== "string") throw new Error(`${label}.${key}: expected string|null`);
}

function optionalFiniteNumber(record: Record<string, unknown>, key: string, label: string): void {
  const value = record[key];
  if (value != null && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label}.${key}: expected finite number|null`);
  }
}

function optionalBoolean(record: Record<string, unknown>, key: string, label: string): void {
  const value = record[key];
  if (value != null && typeof value !== "boolean") throw new Error(`${label}.${key}: expected boolean|null`);
}

function validateSource(value: unknown, label: string): ShockSource {
  const row = objectValue(value, label);
  if (typeof row.title !== "string" || !row.title.trim()) throw new Error(`${label}.title: required non-empty string`);
  if (typeof row.url !== "string" || !row.url.trim()) throw new Error(`${label}.url: required non-empty string`);
  try {
    const parsed = new URL(row.url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
  } catch {
    throw new Error(`${label}.url: invalid http(s) URL=${String(row.url)}`);
  }
  if (typeof row.sourceType !== "string" || !SOURCE_TYPES.has(row.sourceType)) {
    throw new Error(`${label}.sourceType: invalid value=${String(row.sourceType)}`);
  }
  if (row.publishedAt != null && typeof row.publishedAt !== "string") {
    throw new Error(`${label}.publishedAt: expected string|null`);
  }
  return row as unknown as ShockSource;
}

function optionalSources(record: Record<string, unknown>, key: string, label: string): void {
  const value = record[key];
  if (value == null) return;
  if (!Array.isArray(value)) throw new Error(`${label}.${key}: expected array|null`);
  value.forEach((source, index) => validateSource(source, `${label}.${key}[${index}]`));
}

function validateReactionDate(record: Record<string, unknown>, label: string): void {
  const value = record.priceReactionStartDate;
  if (value == null) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label}.priceReactionStartDate: expected YYYY-MM-DD|null`);
  }
}

export function validateHistoricalShockCaseContextShape(
  value: unknown,
  label = "historical shock context",
): HistoricalShockCaseContext {
  const record = objectValue(value, label);
  for (const key of Object.keys(ENUMS) as Array<keyof typeof ENUMS>) optionalEnum(record, key, label);
  for (const key of STRING_FIELDS) optionalString(record, key, label);
  for (const key of NUMBER_FIELDS) optionalFiniteNumber(record, key, label);
  for (const key of BOOLEAN_FIELDS) optionalBoolean(record, key, label);
  optionalSources(record, "reactionAnchorEvidenceSources", label);
  optionalSources(record, "strategyEligibilityEvidenceSources", label);
  validateReactionDate(record, label);

  if (record.calibrationEligibilityAtCheckpoint === "confirmed_pass" || record.calibrationEligibilityAtCheckpoint === "confirmed_block") {
    if (typeof record.calibrationEligibilityNotes !== "string" || !record.calibrationEligibilityNotes.trim()) {
      throw new Error(`${label}.calibrationEligibilityNotes: required for explicit calibration ${String(record.calibrationEligibilityAtCheckpoint)}`);
    }
  }
  return record as unknown as HistoricalShockCaseContext;
}

export function validateHistoricalShockReactionAnchorShape(
  value: unknown,
  label = "historical shock reaction anchor",
): HistoricalShockReactionAnchor {
  const record = objectValue(value, label);
  optionalEnum(record, "announcementTiming", label);
  optionalString(record, "priceReactionStartDate", label);
  optionalString(record, "reactionAnchorNotes", label);
  optionalSources(record, "reactionAnchorEvidenceSources", label);
  validateReactionDate(record, label);
  return record as unknown as HistoricalShockReactionAnchor;
}
