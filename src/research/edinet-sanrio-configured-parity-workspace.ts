import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
type JsonObject = Record<string, unknown>;

export type SanrioConfiguredParityMachineRelation =
  | "exact_structured_hash_match"
  | "exact_pdf_hash_match"
  | "exact_structured_and_pdf_hash_match"
  | "same_document_no_exact_hash_match"
  | "no_configured_document";

export type SanrioConfiguredCoverageRelation =
  | "exact_legacy_source_hash_match"
  | "same_document_no_legacy_exact_hash_match"
  | "no_legacy_document";

export type SanrioLegacyReviewSnapshot = {
  anchorId: string;
  toDocID: string;
  sourceTextHash: string;
  pdfSha256: string;
  equivalenceDecision: string;
  correctionScope: string;
  financialStatementImpact: "yes" | "no" | "unknown";
  internalControlImpact: "yes" | "no" | "unknown";
  auditOpinionImpact: "yes" | "no" | "unknown";
  confirmedFactCount: number;
  exactAmountCount: number;
  anchorDecisionHash: string;
};

export type SanrioConfiguredReviewSnapshot = {
  anchorId: string;
  docID: string;
  structuredTextHash: string;
  pdfTextHash: string;
  sourceComparisonResult: string;
  visualDecision: string;
  equivalenceDecision: string;
  accountingImpact: "yes" | "no" | "unknown";
  internalControlImpact: "yes" | "no" | "unknown";
  auditOpinionImpact: "yes" | "no" | "unknown";
  materiality: string;
  direction: string;
  confirmedFactCount: number;
  exactAmountCount: number;
  decisionHash: string;
};

export type SanrioLegacyConfiguredParityMapping = {
  legacy: SanrioLegacyReviewSnapshot;
  sameDocumentConfiguredAnchorIds: string[];
  exactStructuredTextHashMatchAnchorIds: string[];
  exactPdfTextHashMatchAnchorIds: string[];
  machineRelation: SanrioConfiguredParityMachineRelation;
  selectedConfiguredAnchorIds: string[];
  humanMappingDecision: "pending_human_review";
  humanNotes: string;
  completed: false;
  mappingHash: string;
};

export type SanrioConfiguredParityCoverage = {
  configured: SanrioConfiguredReviewSnapshot;
  sameDocumentLegacyAnchorIds: string[];
  exactLegacySourceHashMatchAnchorIds: string[];
  machineRelation: SanrioConfiguredCoverageRelation;
  humanDisposition: "pending_human_review";
  humanNotes: string;
  completed: false;
  coverageHash: string;
};

export type SanrioLegacyConfiguredParityWorkspace = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    issuerKey: "sanrio";
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
    boundaryHash: string;
  };
  registryHash: string;
  sourceInventoryAuditFile: string;
  sourceInventoryAuditHash: string;
  sourceLegacyReviewPath: string;
  sourceLegacyReviewHash: string;
  sourceConfiguredReviewPath: string;
  sourceConfiguredReviewHash: string;
  generatedAt: string;
  sharedDocumentCount: number;
  legacyAnchorCount: number;
  configuredAnchorCount: number;
  legacyAnchorsWithExactHashMatch: number;
  configuredAnchorsWithExactHashMatch: number;
  machineStatus: "parity_workspace_ready_for_human_mapping";
  legacyMappings: SanrioLegacyConfiguredParityMapping[];
  configuredCoverage: SanrioConfiguredParityCoverage[];
  globalBlockers: string[];
  semanticEquivalenceInferred: false;
  automaticAnchorMappingAuthorized: false;
  automaticReplacementDecisionAuthorized: false;
  replacementReviewStatus: "pending_human_review";
  replacementAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  workspaceHash: string;
};

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function hash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function docID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${field} must be a non-negative integer`);
  return Number(value);
}

function positiveInteger(value: unknown, field: string): number {
  const result = nonNegativeInteger(value, field);
  if (result === 0) throw new Error(`${field} must be a positive integer`);
  return result;
}

function impact(value: unknown, field: string): "yes" | "no" | "unknown" {
  const result = required(value, field);
  if (result !== "yes" && result !== "no" && result !== "unknown") throw new Error(`${field} is invalid`);
  return result;
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function safeRelativeJsonPath(value: unknown, field: string): string {
  const result = required(value, field);
  if (
    result.startsWith("/")
    || result.includes("\\")
    || !result.endsWith(".json")
    || result.split("/").some(part => !part || part === "." || part === "..")
  ) {
    throw new Error(`${field} must be a safe relative JSON path`);
  }
  return result;
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

function textDigest(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function verifyHashEnvelope(record: JsonObject, hashField: string, field: string): string {
  const expected = hash(record[hashField], `${field}.${hashField}`);
  const { [hashField]: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error(`${field}.${hashField} mismatch`);
  return expected;
}

function verifyInventoryAudit(value: unknown): {
  record: JsonObject;
  auditHash: string;
  registryHash: string;
  boundaryHash: string;
} {
  const record = object(value, "inventoryAudit");
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || record.equivalentCoreCandidateSet !== true
    || record.migrationReadyForHumanReview !== true
    || record.reviewStatus !== "pending_human_review"
    || record.replacementAuthorized !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("inventoryAudit is not ready for parity human review");
  }
  const issuer = object(record.issuer, "inventoryAudit.issuer");
  if (
    text(issuer.issuerKey) !== "sanrio"
    || text(issuer.edinetCode) !== "E02655"
    || text(issuer.secCode) !== "81360"
  ) {
    throw new Error("inventoryAudit issuer is not Sanrio");
  }
  if (
    nonNegativeInteger(record.mismatchCandidateCount, "inventoryAudit.mismatchCandidateCount") !== 0
    || nonNegativeInteger(record.legacyOnlyCandidateCount, "inventoryAudit.legacyOnlyCandidateCount") !== 0
    || nonNegativeInteger(record.configuredOnlyCandidateCount, "inventoryAudit.configuredOnlyCandidateCount") !== 0
  ) {
    throw new Error("inventoryAudit still contains blocking candidate differences");
  }
  return {
    record,
    auditHash: verifyHashEnvelope(record, "auditHash", "inventoryAudit"),
    registryHash: hash(record.registryHash, "inventoryAudit.registryHash"),
    boundaryHash: hash(record.boundaryHash, "inventoryAudit.boundaryHash"),
  };
}

function verifyLegacyReview(value: unknown): {
  recordHash: string;
  anchors: SanrioLegacyReviewSnapshot[];
} {
  const record = object(value, "legacyReview");
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || record.reviewStatus !== "complete_human_review"
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("legacyReview safety boundary is invalid");
  }
  const issuer = object(record.issuer, "legacyReview.issuer");
  if (text(issuer.edinetCode) !== "E02655" || text(issuer.secCode) !== "81360") {
    throw new Error("legacyReview issuer is not Sanrio");
  }
  const recordHash = verifyHashEnvelope(record, "recordHash", "legacyReview");
  const anchors = array(record.anchors, "legacyReview.anchors").map((value2, index) => {
    const anchor = object(value2, `legacyReview.anchors[${index}]`);
    const anchorDecisionHash = verifyHashEnvelope(anchor, "anchorDecisionHash", `legacyReview.anchors[${index}]`);
    if (anchor.completed !== true || anchor.pdfVisualConfirmation !== true) {
      throw new Error(`legacyReview.anchors[${index}] is not complete with PDF visual confirmation`);
    }
    const sourceText = required(anchor.sourceText, `legacyReview.anchors[${index}].sourceText`);
    return {
      anchorId: required(anchor.anchorId, `legacyReview.anchors[${index}].anchorId`),
      toDocID: docID(anchor.toDocID, `legacyReview.anchors[${index}].toDocID`),
      sourceTextHash: textDigest(sourceText),
      pdfSha256: hash(anchor.pdfSha256, `legacyReview.anchors[${index}].pdfSha256`),
      equivalenceDecision: required(anchor.equivalenceDecision, `legacyReview.anchors[${index}].equivalenceDecision`),
      correctionScope: required(anchor.correctionScope, `legacyReview.anchors[${index}].correctionScope`),
      financialStatementImpact: impact(anchor.financialStatementImpact, `legacyReview.anchors[${index}].financialStatementImpact`),
      internalControlImpact: impact(anchor.internalControlImpact, `legacyReview.anchors[${index}].internalControlImpact`),
      auditOpinionImpact: impact(anchor.auditOpinionImpact, `legacyReview.anchors[${index}].auditOpinionImpact`),
      confirmedFactCount: array(anchor.confirmedFacts, `legacyReview.anchors[${index}].confirmedFacts`).length,
      exactAmountCount: array(anchor.exactAmounts, `legacyReview.anchors[${index}].exactAmounts`).length,
      anchorDecisionHash,
    };
  }).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
  if (anchors.length !== positiveInteger(record.anchorCount, "legacyReview.anchorCount")) {
    throw new Error("legacyReview.anchorCount mismatch");
  }
  if (anchors.length !== positiveInteger(record.completedAnchorCount, "legacyReview.completedAnchorCount")) {
    throw new Error("legacyReview.completedAnchorCount mismatch");
  }
  return { recordHash, anchors };
}

function verifyConfiguredReview(value: unknown, expectedRegistryHash: string, expectedBoundaryHash: string): {
  recordHash: string;
  anchors: SanrioConfiguredReviewSnapshot[];
} {
  const record = object(value, "configuredReview");
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || record.reviewStatus !== "complete_human_comparison_review"
    || record.automaticFactPromotionAuthorized !== false
    || record.automaticImpactDecisionAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("configuredReview safety boundary is invalid");
  }
  if (hash(record.registryHash, "configuredReview.registryHash") !== expectedRegistryHash) {
    throw new Error("configuredReview registryHash does not match inventory audit");
  }
  const issuer = object(record.issuer, "configuredReview.issuer");
  if (
    text(issuer.issuerKey) !== "sanrio"
    || text(issuer.edinetCode) !== "E02655"
    || text(issuer.secCode) !== "81360"
    || hash(issuer.boundaryHash, "configuredReview.issuer.boundaryHash") !== expectedBoundaryHash
  ) {
    throw new Error("configuredReview issuer boundary does not match inventory audit");
  }
  const recordHash = verifyHashEnvelope(record, "recordHash", "configuredReview");
  const anchors: SanrioConfiguredReviewSnapshot[] = [];
  for (const [documentIndex, value2] of array(record.documents, "configuredReview.documents").entries()) {
    const document = object(value2, `configuredReview.documents[${documentIndex}]`);
    verifyHashEnvelope(document, "documentDecisionHash", `configuredReview.documents[${documentIndex}]`);
    const id = docID(document.docID, `configuredReview.documents[${documentIndex}].docID`);
    const documentAnchors = array(document.anchors, `configuredReview.documents[${documentIndex}].anchors`);
    if (documentAnchors.length !== positiveInteger(document.anchorCount, `configuredReview.documents[${documentIndex}].anchorCount`)) {
      throw new Error(`configuredReview.documents[${documentIndex}].anchorCount mismatch`);
    }
    if (documentAnchors.length !== positiveInteger(document.completedAnchorCount, `configuredReview.documents[${documentIndex}].completedAnchorCount`)) {
      throw new Error(`configuredReview.documents[${documentIndex}].completedAnchorCount mismatch`);
    }
    for (const [anchorIndex, anchorValue] of documentAnchors.entries()) {
      const anchor = object(anchorValue, `configuredReview.documents[${documentIndex}].anchors[${anchorIndex}]`);
      const decisionHash = verifyHashEnvelope(anchor, "decisionHash", `configuredReview.documents[${documentIndex}].anchors[${anchorIndex}]`);
      if (anchor.completed !== true || anchor.visualConfirmation !== true) {
        throw new Error(`configuredReview anchor ${text(anchor.anchorId)} is not complete with visual confirmation`);
      }
      const structured = object(anchor.structured, `configuredReview anchor ${text(anchor.anchorId)}.structured`);
      const pdf = object(anchor.pdf, `configuredReview anchor ${text(anchor.anchorId)}.pdf`);
      anchors.push({
        anchorId: required(anchor.anchorId, `configuredReview anchor[${anchorIndex}].anchorId`),
        docID: id,
        structuredTextHash: hash(structured.textHash, `configuredReview anchor ${text(anchor.anchorId)}.structured.textHash`),
        pdfTextHash: hash(pdf.textHash, `configuredReview anchor ${text(anchor.anchorId)}.pdf.textHash`),
        sourceComparisonResult: required(anchor.sourceComparisonResult, `configuredReview anchor ${text(anchor.anchorId)}.sourceComparisonResult`),
        visualDecision: required(anchor.visualDecision, `configuredReview anchor ${text(anchor.anchorId)}.visualDecision`),
        equivalenceDecision: required(anchor.equivalenceDecision, `configuredReview anchor ${text(anchor.anchorId)}.equivalenceDecision`),
        accountingImpact: impact(anchor.accountingImpact, `configuredReview anchor ${text(anchor.anchorId)}.accountingImpact`),
        internalControlImpact: impact(anchor.internalControlImpact, `configuredReview anchor ${text(anchor.anchorId)}.internalControlImpact`),
        auditOpinionImpact: impact(anchor.auditOpinionImpact, `configuredReview anchor ${text(anchor.anchorId)}.auditOpinionImpact`),
        materiality: required(anchor.materiality, `configuredReview anchor ${text(anchor.anchorId)}.materiality`),
        direction: required(anchor.direction, `configuredReview anchor ${text(anchor.anchorId)}.direction`),
        confirmedFactCount: array(anchor.confirmedFacts, `configuredReview anchor ${text(anchor.anchorId)}.confirmedFacts`).length,
        exactAmountCount: array(anchor.exactAmounts, `configuredReview anchor ${text(anchor.anchorId)}.exactAmounts`).length,
        decisionHash,
      });
    }
  }
  anchors.sort((left, right) => left.anchorId.localeCompare(right.anchorId));
  if (anchors.length !== positiveInteger(record.anchorCount, "configuredReview.anchorCount")) {
    throw new Error("configuredReview.anchorCount mismatch");
  }
  if (anchors.length !== positiveInteger(record.completedAnchorCount, "configuredReview.completedAnchorCount")) {
    throw new Error("configuredReview.completedAnchorCount mismatch");
  }
  return { recordHash, anchors };
}

function relationForLegacy(
  legacy: SanrioLegacyReviewSnapshot,
  configuredAnchors: SanrioConfiguredReviewSnapshot[],
): Omit<SanrioLegacyConfiguredParityMapping, "legacy" | "selectedConfiguredAnchorIds" | "humanMappingDecision" | "humanNotes" | "completed" | "mappingHash"> {
  const sameDocument = configuredAnchors.filter(anchor => anchor.docID === legacy.toDocID);
  const structuredMatches = sameDocument.filter(anchor => anchor.structuredTextHash === legacy.sourceTextHash);
  const pdfMatches = sameDocument.filter(anchor => anchor.pdfTextHash === legacy.sourceTextHash);
  let machineRelation: SanrioConfiguredParityMachineRelation;
  if (sameDocument.length === 0) machineRelation = "no_configured_document";
  else if (structuredMatches.length > 0 && pdfMatches.length > 0) machineRelation = "exact_structured_and_pdf_hash_match";
  else if (structuredMatches.length > 0) machineRelation = "exact_structured_hash_match";
  else if (pdfMatches.length > 0) machineRelation = "exact_pdf_hash_match";
  else machineRelation = "same_document_no_exact_hash_match";
  return {
    sameDocumentConfiguredAnchorIds: sameDocument.map(anchor => anchor.anchorId).sort(),
    exactStructuredTextHashMatchAnchorIds: structuredMatches.map(anchor => anchor.anchorId).sort(),
    exactPdfTextHashMatchAnchorIds: pdfMatches.map(anchor => anchor.anchorId).sort(),
    machineRelation,
  };
}

function relationForConfigured(
  configured: SanrioConfiguredReviewSnapshot,
  legacyAnchors: SanrioLegacyReviewSnapshot[],
): Omit<SanrioConfiguredParityCoverage, "configured" | "humanDisposition" | "humanNotes" | "completed" | "coverageHash"> {
  const sameDocument = legacyAnchors.filter(anchor => anchor.toDocID === configured.docID);
  const exactMatches = sameDocument.filter(anchor =>
    anchor.sourceTextHash === configured.structuredTextHash || anchor.sourceTextHash === configured.pdfTextHash,
  );
  return {
    sameDocumentLegacyAnchorIds: sameDocument.map(anchor => anchor.anchorId).sort(),
    exactLegacySourceHashMatchAnchorIds: exactMatches.map(anchor => anchor.anchorId).sort(),
    machineRelation: exactMatches.length > 0
      ? "exact_legacy_source_hash_match"
      : sameDocument.length > 0
        ? "same_document_no_legacy_exact_hash_match"
        : "no_legacy_document",
  };
}

export function buildSanrioLegacyConfiguredParityWorkspace(input: {
  inventoryAudit: unknown;
  sourceInventoryAuditFile: string;
  legacyReview: unknown;
  sourceLegacyReviewPath: string;
  configuredReview: unknown;
  sourceConfiguredReviewPath: string;
  generatedAt?: string;
}): SanrioLegacyConfiguredParityWorkspace {
  const audit = verifyInventoryAudit(input.inventoryAudit);
  const legacy = verifyLegacyReview(input.legacyReview);
  const configured = verifyConfiguredReview(input.configuredReview, audit.registryHash, audit.boundaryHash);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();

  const legacyMappings = legacy.anchors.map(legacyAnchor => {
    const machine = relationForLegacy(legacyAnchor, configured.anchors);
    const base = {
      legacy: legacyAnchor,
      ...machine,
      selectedConfiguredAnchorIds: [] as string[],
      humanMappingDecision: "pending_human_review" as const,
      humanNotes: "",
      completed: false as const,
    };
    return { ...base, mappingHash: digest(base) };
  });
  const configuredCoverage = configured.anchors.map(configuredAnchor => {
    const machine = relationForConfigured(configuredAnchor, legacy.anchors);
    const base = {
      configured: configuredAnchor,
      ...machine,
      humanDisposition: "pending_human_review" as const,
      humanNotes: "",
      completed: false as const,
    };
    return { ...base, coverageHash: digest(base) };
  });
  const legacyDocIDs = new Set(legacy.anchors.map(anchor => anchor.toDocID));
  const configuredDocIDs = new Set(configured.anchors.map(anchor => anchor.docID));
  const sharedDocumentCount = [...legacyDocIDs].filter(id => configuredDocIDs.has(id)).length;
  const legacyAnchorsWithExactHashMatch = legacyMappings.filter(mapping =>
    mapping.exactStructuredTextHashMatchAnchorIds.length > 0 || mapping.exactPdfTextHashMatchAnchorIds.length > 0,
  ).length;
  const configuredAnchorsWithExactHashMatch = configuredCoverage.filter(coverage =>
    coverage.exactLegacySourceHashMatchAnchorIds.length > 0,
  ).length;
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      issuerKey: "sanrio" as const,
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
      boundaryHash: audit.boundaryHash,
    },
    registryHash: audit.registryHash,
    sourceInventoryAuditFile: localJsonBasename(input.sourceInventoryAuditFile, "sourceInventoryAuditFile"),
    sourceInventoryAuditHash: audit.auditHash,
    sourceLegacyReviewPath: safeRelativeJsonPath(input.sourceLegacyReviewPath, "sourceLegacyReviewPath"),
    sourceLegacyReviewHash: legacy.recordHash,
    sourceConfiguredReviewPath: safeRelativeJsonPath(input.sourceConfiguredReviewPath, "sourceConfiguredReviewPath"),
    sourceConfiguredReviewHash: configured.recordHash,
    generatedAt,
    sharedDocumentCount,
    legacyAnchorCount: legacy.anchors.length,
    configuredAnchorCount: configured.anchors.length,
    legacyAnchorsWithExactHashMatch,
    configuredAnchorsWithExactHashMatch,
    machineStatus: "parity_workspace_ready_for_human_mapping" as const,
    legacyMappings,
    configuredCoverage,
    globalBlockers: [
      "human_legacy_to_configured_anchor_mapping_required",
      "human_configured_coverage_disposition_required",
      "human_inventory_audit_confirmation_required",
      "human_replacement_decision_required",
      "semantic_equivalence_not_inferred",
      "replacement_not_authorized",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    semanticEquivalenceInferred: false as const,
    automaticAnchorMappingAuthorized: false as const,
    automaticReplacementDecisionAuthorized: false as const,
    replacementReviewStatus: "pending_human_review" as const,
    replacementAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, workspaceHash: digest(base) };
}

export function renderSanrioLegacyConfiguredParityWorkspace(workspace: SanrioLegacyConfiguredParityWorkspace): string {
  const lines = [
    "# Sanrio legacy/configured EDINET parity workspace",
    "",
    `- generatedAt: ${workspace.generatedAt}`,
    `- inventory audit: ${workspace.sourceInventoryAuditFile}`,
    `- legacy review: ${workspace.sourceLegacyReviewPath}`,
    `- configured review: ${workspace.sourceConfiguredReviewPath}`,
    `- shared documents: ${workspace.sharedDocumentCount}`,
    `- legacy anchors: ${workspace.legacyAnchorCount}`,
    `- configured anchors: ${workspace.configuredAnchorCount}`,
    `- legacy anchors with exact hash match: ${workspace.legacyAnchorsWithExactHashMatch}`,
    `- configured anchors with exact hash match: ${workspace.configuredAnchorsWithExactHashMatch}`,
    `- machineStatus: ${workspace.machineStatus}`,
    `- workspaceHash: ${workspace.workspaceHash}`,
    "- semanticEquivalenceInferred: false",
    "- automaticAnchorMappingAuthorized: false",
    "- automaticReplacementDecisionAuthorized: false",
    "- replacementAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "Exact hash matches are navigation evidence only. They do not establish semantic equivalence or authorize replacement.",
    "",
    "## Legacy anchor mappings",
    "",
  ];
  for (const mapping of workspace.legacyMappings) {
    lines.push(
      `### ${mapping.legacy.anchorId}`,
      "",
      `- docID: ${mapping.legacy.toDocID}`,
      `- machineRelation: ${mapping.machineRelation}`,
      `- same-document configured anchors: ${mapping.sameDocumentConfiguredAnchorIds.join(", ") || "none"}`,
      `- exact structured hash matches: ${mapping.exactStructuredTextHashMatchAnchorIds.join(", ") || "none"}`,
      `- exact PDF hash matches: ${mapping.exactPdfTextHashMatchAnchorIds.join(", ") || "none"}`,
      `- legacy equivalence/correction scope: ${mapping.legacy.equivalenceDecision}/${mapping.legacy.correctionScope}`,
      `- legacy financial/internal-control/audit: ${mapping.legacy.financialStatementImpact}/${mapping.legacy.internalControlImpact}/${mapping.legacy.auditOpinionImpact}`,
      "- human mapping: pending",
      "",
    );
  }
  lines.push("## Configured coverage", "");
  for (const coverage of workspace.configuredCoverage) {
    lines.push(
      `### ${coverage.configured.anchorId}`,
      "",
      `- docID: ${coverage.configured.docID}`,
      `- machineRelation: ${coverage.machineRelation}`,
      `- same-document legacy anchors: ${coverage.sameDocumentLegacyAnchorIds.join(", ") || "none"}`,
      `- exact legacy source hash matches: ${coverage.exactLegacySourceHashMatchAnchorIds.join(", ") || "none"}`,
      `- configured equivalence: ${coverage.configured.equivalenceDecision}`,
      `- configured accounting/internal-control/audit: ${coverage.configured.accountingImpact}/${coverage.configured.internalControlImpact}/${coverage.configured.auditOpinionImpact}`,
      `- configured materiality/direction: ${coverage.configured.materiality}/${coverage.configured.direction}`,
      "- human disposition: pending",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
