import type { ShockSource } from "./idiosyncratic-shock.js";

export type ContextSchemaIssue = {
  path: string;
  message: string;
};

const CONTEXT_FIELDS = new Set([
  "incidentCountry",
  "sector",
  "stakeholder",
  "incidentScope",
  "confounderStatus",
  "informationLeakStatus",
  "recurrenceStatus",
  "remediationStatus",
  "listingStructure",
  "ownershipControl",
  "liquidityStatus",
  "incidentClusterStatus",
  "disclosureObservability",
  "announcementTiming",
  "priceReactionStartDate",
  "reactionAnchorEvidenceSources",
  "reactionAnchorNotes",
  "incidentRevenueExposurePct",
  "estimatedDirectCostPctMarketCap",
  "industryRelativeShockDrawdownPct",
  "strategyEligibilityAtCheckpoint",
  "calibrationEligibilityAtCheckpoint",
  "calibrationEligibilityNotes",
  "strategyInvestigationStatusAtCheckpoint",
  "strategyCriticalLicenseOrDelistingRiskAtCheckpoint",
  "strategyEligibilityNotes",
  "strategyEligibilityEvidenceSources",
  "notes",
]);

const ANCHOR_FIELDS = new Set([
  "announcementTiming",
  "priceReactionStartDate",
  "reactionAnchorEvidenceSources",
  "reactionAnchorNotes",
]);

const ENUMS: Record<string, ReadonlySet<string>> = {
  stakeholder: new Set(["employee", "customer", "investor", "supplier", "regulator", "public", "mixed", "unknown"]),
  incidentScope: new Set(["individual", "site", "subsidiary", "multi_unit", "group_wide", "unknown"]),
  confounderStatus: new Set(["clear", "possible", "major", "unknown"]),
  informationLeakStatus: new Set(["clear", "possible", "likely", "unknown"]),
  recurrenceStatus: new Set(["first_known", "repeat", "systemic", "unknown"]),
  remediationStatus: new Set(["credible", "partial", "weak", "unknown"]),
  listingStructure: new Set(["single", "adr", "dual", "secondary", "unknown"]),
  ownershipControl: new Set(["dispersed", "founder_family", "state_controlled", "parent_controlled", "other_concentrated", "unknown"]),
  liquidityStatus: new Set(["normal", "thin", "halted", "limit_locked", "unknown"]),
  incidentClusterStatus: new Set(["single", "related_multiple", "cascade", "unknown"]),
  disclosureObservability: new Set(["high", "medium", "low", "unknown"]),
  announcementTiming: new Set(["before_open", "during_session", "after_close", "non_trading_day", "unknown"]),
  strategyEligibilityAtCheckpoint: new Set(["confirmed_pass", "confirmed_block", "unknown"]),
  calibrationEligibilityAtCheckpoint: new Set(["confirmed_pass", "confirmed_block", "unknown"]),
  strategyInvestigationStatusAtCheckpoint: new Set(["open", "substantially_complete", "closed", "not_applicable", "unknown"]),
};

const NULLABLE_STRINGS = new Set([
  "incidentCountry",
  "sector",
  "priceReactionStartDate",
  "reactionAnchorNotes",
  "calibrationEligibilityNotes",
  "strategyEligibilityNotes",
  "notes",
]);

const NULLABLE_NUMBERS = new Set([
  "incidentRevenueExposurePct",
  "estimatedDirectCostPctMarketCap",
  "industryRelativeShockDrawdownPct",
]);

const SOURCE_TYPES = new Set<ShockSource["sourceType"]>([
  "company",
  "regulator",
  "exchange",
  "major_media",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateSource(value: unknown, path: string, issues: ContextSchemaIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "source must be an object" });
    return;
  }
  const allowed = new Set(["title", "url", "sourceType", "publishedAt"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push({ path: `${path}.${key}`, message: "unknown source field" });
  }
  if (typeof value.title !== "string" || !value.title.trim()) issues.push({ path: `${path}.title`, message: "non-empty string required" });
  if (typeof value.url !== "string") {
    issues.push({ path: `${path}.url`, message: "URL string required" });
  } else {
    try {
      const parsed = new URL(value.url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported protocol");
    } catch {
      issues.push({ path: `${path}.url`, message: "valid http(s) URL required" });
    }
  }
  if (typeof value.sourceType !== "string" || !SOURCE_TYPES.has(value.sourceType as ShockSource["sourceType"])) {
    issues.push({ path: `${path}.sourceType`, message: `expected one of ${[...SOURCE_TYPES].join("|")}` });
  }
  if (value.publishedAt != null && (typeof value.publishedAt !== "string" || !validIsoDate(value.publishedAt))) {
    issues.push({ path: `${path}.publishedAt`, message: "expected YYYY-MM-DD or null" });
  }
}

function validateCase(
  value: unknown,
  path: string,
  allowedFields: ReadonlySet<string>,
  issues: ContextSchemaIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "case context must be an object" });
    return;
  }

  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) issues.push({ path: `${path}.${key}`, message: "unknown context field" });
  }

  for (const [key, allowed] of Object.entries(ENUMS)) {
    const fieldValue = value[key];
    if (fieldValue == null) continue;
    if (typeof fieldValue !== "string" || !allowed.has(fieldValue)) {
      issues.push({ path: `${path}.${key}`, message: `expected one of ${[...allowed].join("|")} or null` });
    }
  }

  for (const key of NULLABLE_STRINGS) {
    const fieldValue = value[key];
    if (fieldValue == null) continue;
    if (typeof fieldValue !== "string") issues.push({ path: `${path}.${key}`, message: "expected string or null" });
  }

  if (typeof value.priceReactionStartDate === "string" && !validIsoDate(value.priceReactionStartDate)) {
    issues.push({ path: `${path}.priceReactionStartDate`, message: "expected a real YYYY-MM-DD date" });
  }

  for (const key of NULLABLE_NUMBERS) {
    const fieldValue = value[key];
    if (fieldValue == null) continue;
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) {
      issues.push({ path: `${path}.${key}`, message: "expected finite number or null" });
      continue;
    }
    if ((key === "incidentRevenueExposurePct" || key === "estimatedDirectCostPctMarketCap") && (fieldValue < 0 || fieldValue > 100)) {
      issues.push({ path: `${path}.${key}`, message: "expected percentage in range 0..100" });
    }
  }

  const criticalRisk = value.strategyCriticalLicenseOrDelistingRiskAtCheckpoint;
  if (criticalRisk != null && typeof criticalRisk !== "boolean") {
    issues.push({ path: `${path}.strategyCriticalLicenseOrDelistingRiskAtCheckpoint`, message: "expected boolean or null" });
  }

  for (const key of ["reactionAnchorEvidenceSources", "strategyEligibilityEvidenceSources"] as const) {
    const sources = value[key];
    if (sources == null) continue;
    if (!Array.isArray(sources)) {
      issues.push({ path: `${path}.${key}`, message: "expected source array or null" });
      continue;
    }
    sources.forEach((source, index) => validateSource(source, `${path}.${key}[${index}]`, issues));
  }
}

export function validateHistoricalShockContextDocument(
  raw: unknown,
  filePath: string,
  kind: "context" | "reaction_anchor",
): ContextSchemaIssue[] {
  const issues: ContextSchemaIssue[] = [];
  if (!isRecord(raw)) return [{ path: filePath, message: "document must be an object" }];

  const allowedTopLevel = new Set(["version", "generatedAt", "description", "cases"]);
  for (const key of Object.keys(raw)) {
    if (!allowedTopLevel.has(key)) issues.push({ path: `${filePath}.${key}`, message: "unknown top-level field" });
  }

  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    issues.push({ path: `${filePath}.version`, message: "positive integer required" });
  }
  if (typeof raw.generatedAt !== "string" || !validIsoDate(raw.generatedAt)) {
    issues.push({ path: `${filePath}.generatedAt`, message: "real YYYY-MM-DD date required" });
  }
  if (raw.description != null && typeof raw.description !== "string") {
    issues.push({ path: `${filePath}.description`, message: "expected string or null" });
  }
  if (!isRecord(raw.cases)) {
    issues.push({ path: `${filePath}.cases`, message: "cases object required" });
    return issues;
  }

  for (const [id, value] of Object.entries(raw.cases)) {
    if (!id.trim()) {
      issues.push({ path: `${filePath}.cases`, message: "empty case id is forbidden" });
      continue;
    }
    validateCase(value, `${filePath}.cases.${id}`, kind === "context" ? CONTEXT_FIELDS : ANCHOR_FIELDS, issues);
  }
  return issues;
}

export function assertHistoricalShockContextDocument(
  raw: unknown,
  filePath: string,
  kind: "context" | "reaction_anchor",
): void {
  const issues = validateHistoricalShockContextDocument(raw, filePath, kind);
  if (issues.length === 0) return;
  throw new Error([
    `${filePath}: historical shock ${kind} schema invalid (${issues.length})`,
    ...issues.map(issue => `- ${issue.path}: ${issue.message}`),
  ].join("\n"));
}
