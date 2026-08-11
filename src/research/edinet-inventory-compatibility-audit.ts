import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CORE_TYPES = new Set(["1", "2"]);

type JsonObject = Record<string, unknown>;

type CandidateSnapshot = {
  docID: string;
  edinetCode: string;
  secCode: string;
  submitDateTime: string;
  parentDocID: string;
  description: string;
  reviewPriority: string;
  reviewReasons: string[];
  documentTypes: string[];
  chainRootDocID: string;
};

export type EdinetInventoryCandidateComparison = {
  docID: string;
  status: "matched" | "legacy_only" | "configured_only" | "mismatch";
  coreIdentityMatch: boolean;
  reviewReasonsMatch: boolean;
  lineageMatch: boolean;
  commonCoreDocumentTypes: string[];
  missingConfiguredCoreTypes: string[];
  configuredUnexpectedTypes: string[];
  legacyAdditionalNonCoreTypes: string[];
  differences: string[];
};

export type EdinetInventoryCompatibilityAudit = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    issuerKey: "sanrio";
    edinetCode: "E02655";
    secCode: "81360";
  };
  legacyInventoryFile: string;
  configuredInventoryFile: string;
  configuredInventoryHash: string;
  registryHash: string;
  boundaryHash: string;
  generatedAt: string;
  rangeMatch: boolean;
  completenessMatch: boolean;
  legacyCandidateCount: number;
  configuredCandidateCount: number;
  matchedCandidateCount: number;
  mismatchCandidateCount: number;
  legacyOnlyCandidateCount: number;
  configuredOnlyCandidateCount: number;
  equivalentCoreCandidateSet: boolean;
  migrationReadyForHumanReview: boolean;
  reviewStatus: "pending_human_review";
  comparisons: EdinetInventoryCandidateComparison[];
  blockers: string[];
  replacementAuthorized: false;
  appendAuthorized: false;
  auditHash: string;
};

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = str(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid docID`);
  return result;
}

function gregorianDate(value: unknown, field: string): string {
  const result = required(value, field);
  const match = DATE_RE.exec(result);
  if (!match) throw new Error(`${field} must be YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) throw new Error(`${field} must be a real Gregorian date`);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) throw new Error(`${field} must be a real Gregorian date`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  try {
    parseExplicitIso8601Instant(result, field);
  } catch {
    throw new Error(`${field} must be an explicit-timezone ISO instant`);
  }
  return result;
}

function localJsonBasename(value: string, field: string): string {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\") || !value.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return value;
}

function strings(value: unknown, field: string): string[] {
  const result = arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
  return [...new Set(result)].sort();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function verifyLegacyInventory(record: JsonObject): void {
  if (record.schemaVersion !== 1 || record.source !== "edinet" || record.appendAuthorized !== false) {
    throw new Error("legacy inventory safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "legacyInventory.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("legacy inventory issuer is not Sanrio");
  }
  if (record.completeness !== "complete") throw new Error("legacy inventory must be complete");
}

function verifyConfiguredInventory(record: JsonObject): {
  inventoryHash: string;
  registryHash: string;
  boundaryHash: string;
} {
  if (record.schemaVersion !== 1 || record.source !== "edinet" || record.appendAuthorized !== false) {
    throw new Error("configured inventory safety boundary is invalid");
  }
  if (record.factPromotionPolicy !== "human_review_required" || record.requireOfficialPdfVisualReview !== true) {
    throw new Error("configured inventory review policy is invalid");
  }
  const issuer = obj(record.issuer, "configuredInventory.issuer");
  if (
    str(issuer.issuerKey) !== "sanrio"
    || str(issuer.edinetCode) !== "E02655"
    || str(issuer.secCode) !== "81360"
  ) {
    throw new Error("configured inventory issuer is not configured Sanrio");
  }
  if (record.completeness !== "complete") throw new Error("configured inventory must be complete");
  const inventoryHash = requireHash(record.inventoryHash, "configuredInventory.inventoryHash");
  const { inventoryHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== inventoryHash) throw new Error("configuredInventory.inventoryHash mismatch");
  return {
    inventoryHash,
    registryHash: requireHash(record.registryHash, "configuredInventory.registryHash"),
    boundaryHash: requireHash(issuer.boundaryHash, "configuredInventory.issuer.boundaryHash"),
  };
}

function lineageRoots(record: JsonObject, field: string): Map<string, string> {
  const lineage = obj(record.lineage, `${field}.lineage`);
  const result = new Map<string, string>();
  for (const [index, value] of arr(lineage.nodes, `${field}.lineage.nodes`).entries()) {
    const node = obj(value, `${field}.lineage.nodes[${index}]`);
    const docID = requireDocID(node.docID, `${field}.lineage.nodes[${index}].docID`);
    const root = requireDocID(node.chainRootDocID, `${field}.lineage.nodes[${index}].chainRootDocID`);
    if (result.has(docID)) throw new Error(`${field}.lineage has duplicate docID ${docID}`);
    result.set(docID, root);
  }
  return result;
}

function candidates(record: JsonObject, field: string): Map<string, CandidateSnapshot> {
  const roots = lineageRoots(record, field);
  const result = new Map<string, CandidateSnapshot>();
  for (const [index, value] of arr(record.candidates, `${field}.candidates`).entries()) {
    const candidate = obj(value, `${field}.candidates[${index}]`);
    const doc = obj(candidate.doc, `${field}.candidates[${index}].doc`);
    const docID = requireDocID(doc.docID, `${field}.candidates[${index}].doc.docID`);
    if (result.has(docID)) throw new Error(`${field} has duplicate candidate ${docID}`);
    const chainRootDocID = roots.get(docID);
    if (!chainRootDocID) throw new Error(`${field}.candidates[${index}] has no lineage node`);
    if (!roots.has(chainRootDocID)) {
      throw new Error(`${field}.lineage node ${docID} references missing chain root ${chainRootDocID}`);
    }
    if (roots.get(chainRootDocID) !== chainRootDocID) {
      throw new Error(`${field}.lineage chain root ${chainRootDocID} must self-reference`);
    }
    const edinetCode = str(doc.edinetCode).toUpperCase();
    const secCode = str(doc.secCode);
    if (edinetCode !== "E02655" || secCode !== "81360") {
      throw new Error(`${field}.candidates[${index}].doc issuer identity is not Sanrio`);
    }
    const types = arr(candidate.documentTypePlan, `${field}.candidates[${index}].documentTypePlan`)
      .map((planValue, planIndex) => {
        const plan = obj(planValue, `${field}.candidates[${index}].documentTypePlan[${planIndex}]`);
        return required(plan.type, `${field}.candidates[${index}].documentTypePlan[${planIndex}].type`);
      });
    result.set(docID, {
      docID,
      edinetCode,
      secCode,
      submitDateTime: timestamp(doc.submitDateTime, `${field}.candidates[${index}].doc.submitDateTime`),
      parentDocID: str(doc.parentDocID),
      description: str(doc.docDescription),
      reviewPriority: required(candidate.reviewPriority, `${field}.candidates[${index}].reviewPriority`),
      reviewReasons: strings(candidate.reviewReasons, `${field}.candidates[${index}].reviewReasons`),
      documentTypes: [...new Set(types)].sort(),
      chainRootDocID,
    });
  }
  return result;
}

function compareCandidate(
  docID: string,
  legacy: CandidateSnapshot | undefined,
  configured: CandidateSnapshot | undefined,
): EdinetInventoryCandidateComparison {
  if (!legacy) {
    return {
      docID,
      status: "configured_only",
      coreIdentityMatch: false,
      reviewReasonsMatch: false,
      lineageMatch: false,
      commonCoreDocumentTypes: [],
      missingConfiguredCoreTypes: [],
      configuredUnexpectedTypes: configured?.documentTypes ?? [],
      legacyAdditionalNonCoreTypes: [],
      differences: ["candidate_exists_only_in_configured_inventory"],
    };
  }
  if (!configured) {
    return {
      docID,
      status: "legacy_only",
      coreIdentityMatch: false,
      reviewReasonsMatch: false,
      lineageMatch: false,
      commonCoreDocumentTypes: [],
      missingConfiguredCoreTypes: legacy.documentTypes.filter(type => CORE_TYPES.has(type)),
      configuredUnexpectedTypes: [],
      legacyAdditionalNonCoreTypes: legacy.documentTypes.filter(type => !CORE_TYPES.has(type)),
      differences: ["candidate_exists_only_in_legacy_inventory"],
    };
  }

  const differences: string[] = [];
  const coreIdentityMatch = [
    legacy.edinetCode === configured.edinetCode,
    legacy.secCode === configured.secCode,
    legacy.submitDateTime === configured.submitDateTime,
    legacy.parentDocID === configured.parentDocID,
    legacy.description === configured.description,
    legacy.reviewPriority === configured.reviewPriority,
  ].every(Boolean);
  if (!coreIdentityMatch) differences.push("candidate_core_identity_or_priority_differs");
  const reviewReasonsMatch = JSON.stringify(legacy.reviewReasons) === JSON.stringify(configured.reviewReasons);
  if (!reviewReasonsMatch) differences.push("review_reasons_differ");
  const lineageMatch = legacy.chainRootDocID === configured.chainRootDocID;
  if (!lineageMatch) differences.push("lineage_root_differs");

  const legacyCore = legacy.documentTypes.filter(type => CORE_TYPES.has(type));
  const configuredCore = configured.documentTypes.filter(type => CORE_TYPES.has(type));
  const commonCoreDocumentTypes = legacyCore.filter(type => configuredCore.includes(type));
  const missingConfiguredCoreTypes = legacyCore.filter(type => !configuredCore.includes(type));
  const configuredUnexpectedTypes = configured.documentTypes.filter(type => !CORE_TYPES.has(type));
  const legacyAdditionalNonCoreTypes = legacy.documentTypes.filter(type => !CORE_TYPES.has(type));
  if (missingConfiguredCoreTypes.length > 0) differences.push("configured_inventory_missing_legacy_core_document_type");
  if (configuredUnexpectedTypes.length > 0) differences.push("configured_inventory_contains_non_allowlisted_document_type");

  return {
    docID,
    status: differences.length === 0 ? "matched" : "mismatch",
    coreIdentityMatch,
    reviewReasonsMatch,
    lineageMatch,
    commonCoreDocumentTypes,
    missingConfiguredCoreTypes,
    configuredUnexpectedTypes,
    legacyAdditionalNonCoreTypes,
    differences,
  };
}

export function buildEdinetInventoryCompatibilityAudit(input: {
  legacyInventory: unknown;
  configuredInventory: unknown;
  legacyInventoryFile: string;
  configuredInventoryFile: string;
  generatedAt?: string;
}): EdinetInventoryCompatibilityAudit {
  const legacy = obj(input.legacyInventory, "legacyInventory");
  const configured = obj(input.configuredInventory, "configuredInventory");
  verifyLegacyInventory(legacy);
  const configuredHashes = verifyConfiguredInventory(configured);
  const legacyInventoryFile = localJsonBasename(input.legacyInventoryFile, "legacyInventoryFile");
  const configuredInventoryFile = localJsonBasename(input.configuredInventoryFile, "configuredInventoryFile");
  if (legacyInventoryFile === configuredInventoryFile) throw new Error("legacy and configured inventory files must differ");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();

  const legacyRange = obj(legacy.range, "legacyInventory.range");
  const configuredRange = obj(configured.range, "configuredInventory.range");
  const legacyRangeFrom = gregorianDate(legacyRange.from, "legacyInventory.range.from");
  const legacyRangeTo = gregorianDate(legacyRange.to, "legacyInventory.range.to");
  const configuredRangeFrom = gregorianDate(configuredRange.from, "configuredInventory.range.from");
  const configuredRangeTo = gregorianDate(configuredRange.to, "configuredInventory.range.to");
  if (legacyRangeFrom > legacyRangeTo) throw new Error("legacyInventory.range must be ordered");
  if (configuredRangeFrom > configuredRangeTo) throw new Error("configuredInventory.range must be ordered");
  const rangeMatch = legacyRangeFrom === configuredRangeFrom
    && legacyRangeTo === configuredRangeTo;
  const completenessMatch = legacy.completeness === configured.completeness
    && legacy.scannedBusinessDays === configured.scannedBusinessDays;

  const legacyCandidates = candidates(legacy, "legacyInventory");
  const configuredCandidates = candidates(configured, "configuredInventory");
  const docIDs = [...new Set([...legacyCandidates.keys(), ...configuredCandidates.keys()])].sort();
  const comparisons = docIDs.map(docID => compareCandidate(
    docID,
    legacyCandidates.get(docID),
    configuredCandidates.get(docID),
  ));
  const mismatchCandidateCount = comparisons.filter(item => item.status === "mismatch").length;
  const legacyOnlyCandidateCount = comparisons.filter(item => item.status === "legacy_only").length;
  const configuredOnlyCandidateCount = comparisons.filter(item => item.status === "configured_only").length;
  const matchedCandidateCount = comparisons.filter(item => item.status === "matched").length;
  const equivalentCoreCandidateSet = rangeMatch
    && completenessMatch
    && mismatchCandidateCount === 0
    && legacyOnlyCandidateCount === 0
    && configuredOnlyCandidateCount === 0;
  const migrationReadyForHumanReview = equivalentCoreCandidateSet;
  const blockers = [
    ...(!rangeMatch ? ["inventory_ranges_differ"] : []),
    ...(!completenessMatch ? ["inventory_completeness_or_business_day_count_differs"] : []),
    ...(mismatchCandidateCount > 0 ? ["candidate_comparisons_have_mismatches"] : []),
    ...(legacyOnlyCandidateCount > 0 ? ["legacy_only_candidates_exist"] : []),
    ...(configuredOnlyCandidateCount > 0 ? ["configured_only_candidates_exist"] : []),
    "human_inventory_diff_review_required",
    "legacy_entry_point_replacement_not_authorized",
  ].sort();
  const hashBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    configuredInventoryHash: configuredHashes.inventoryHash,
    legacyInventoryFile,
    configuredInventoryFile,
    rangeMatch,
    completenessMatch,
    comparisons,
    replacementAuthorized: false as const,
    appendAuthorized: false as const,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      issuerKey: "sanrio",
      edinetCode: "E02655",
      secCode: "81360",
    },
    legacyInventoryFile,
    configuredInventoryFile,
    configuredInventoryHash: configuredHashes.inventoryHash,
    registryHash: configuredHashes.registryHash,
    boundaryHash: configuredHashes.boundaryHash,
    generatedAt,
    rangeMatch,
    completenessMatch,
    legacyCandidateCount: legacyCandidates.size,
    configuredCandidateCount: configuredCandidates.size,
    matchedCandidateCount,
    mismatchCandidateCount,
    legacyOnlyCandidateCount,
    configuredOnlyCandidateCount,
    equivalentCoreCandidateSet,
    migrationReadyForHumanReview,
    reviewStatus: "pending_human_review",
    comparisons,
    blockers,
    replacementAuthorized: false,
    appendAuthorized: false,
    auditHash: digest(hashBase),
  };
}

export function renderEdinetInventoryCompatibilityAudit(
  audit: EdinetInventoryCompatibilityAudit,
): string {
  const lines = [
    "# EDINET inventory compatibility audit",
    "",
    `- generatedAt: ${audit.generatedAt}`,
    `- legacyInventoryFile: ${audit.legacyInventoryFile}`,
    `- configuredInventoryFile: ${audit.configuredInventoryFile}`,
    `- configuredInventoryHash: ${audit.configuredInventoryHash}`,
    `- registryHash: ${audit.registryHash}`,
    `- boundaryHash: ${audit.boundaryHash}`,
    `- rangeMatch: ${audit.rangeMatch}`,
    `- completenessMatch: ${audit.completenessMatch}`,
    `- candidates: legacy=${audit.legacyCandidateCount}, configured=${audit.configuredCandidateCount}`,
    `- comparisons: matched=${audit.matchedCandidateCount}, mismatch=${audit.mismatchCandidateCount}, legacyOnly=${audit.legacyOnlyCandidateCount}, configuredOnly=${audit.configuredOnlyCandidateCount}`,
    `- equivalentCoreCandidateSet: ${audit.equivalentCoreCandidateSet}`,
    `- migrationReadyForHumanReview: ${audit.migrationReadyForHumanReview}`,
    "- reviewStatus: pending_human_review",
    "- replacementAuthorized: false",
    "- appendAuthorized: false",
    `- auditHash: ${audit.auditHash}`,
    "",
    "## Interpretation boundary",
    "",
    "- Core compatibility covers candidate docIDs, primary identity, review reasons, lineage roots, and document types 1/2.",
    "- Legacy-only types 3–5 are reported but are expected when the configured allowlist is intentionally narrower.",
    "- A green core comparison permits human migration review only; it does not authorize replacing the legacy entry point.",
    "",
  ];
  for (const comparison of audit.comparisons) {
    lines.push(
      `## ${comparison.docID}`,
      "",
      `- status: ${comparison.status}`,
      `- coreIdentityMatch: ${comparison.coreIdentityMatch}`,
      `- reviewReasonsMatch: ${comparison.reviewReasonsMatch}`,
      `- lineageMatch: ${comparison.lineageMatch}`,
      `- commonCoreDocumentTypes: ${comparison.commonCoreDocumentTypes.join(",") || "(none)"}`,
      `- missingConfiguredCoreTypes: ${comparison.missingConfiguredCoreTypes.join(",") || "(none)"}`,
      `- configuredUnexpectedTypes: ${comparison.configuredUnexpectedTypes.join(",") || "(none)"}`,
      `- legacyAdditionalNonCoreTypes: ${comparison.legacyAdditionalNonCoreTypes.join(",") || "(none)"}`,
      `- differences: ${comparison.differences.join(",") || "(none)"}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
