import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
type JsonObject = Record<string, unknown>;

export type SanrioParityMappingDecision =
  | "pending_human_review"
  | "equivalent_evidence_coverage"
  | "complementary_evidence_coverage"
  | "materially_inconsistent"
  | "insufficient_evidence";

export type SanrioParityCoverageDisposition =
  | "pending_human_review"
  | "mapped_to_legacy_evidence"
  | "additional_coverage_acceptable"
  | "blocks_replacement"
  | "insufficient_evidence";

export type SanrioParityReplacementRecommendation =
  | "pending_human_review"
  | "recommend_configured_replacement"
  | "recommend_keep_legacy"
  | "insufficient_evidence";

type LegacySourceSnapshot = {
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

type ConfiguredSourceSnapshot = {
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

export type SanrioParityHumanMapping = {
  legacy: LegacySourceSnapshot;
  sourceMappingHash: string;
  sameDocumentConfiguredAnchorIds: string[];
  exactStructuredTextHashMatchAnchorIds: string[];
  exactPdfTextHashMatchAnchorIds: string[];
  machineRelation: string;
  selectedConfiguredAnchorIds: string[];
  humanMappingDecision: SanrioParityMappingDecision;
  humanNotes: string;
  completed: boolean;
  humanDecisionHash: string;
};

export type SanrioParityHumanCoverage = {
  configured: ConfiguredSourceSnapshot;
  sourceCoverageHash: string;
  sameDocumentLegacyAnchorIds: string[];
  exactLegacySourceHashMatchAnchorIds: string[];
  machineRelation: string;
  humanDisposition: SanrioParityCoverageDisposition;
  humanNotes: string;
  completed: boolean;
  humanDecisionHash: string;
};

export type SanrioParityHumanReviewRecord = {
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
  sourceWorkspaceFile: string;
  sourceWorkspaceHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string | null;
  inventoryAuditHumanConfirmed: boolean;
  mappingCount: number;
  completedMappingCount: number;
  coverageCount: number;
  completedCoverageCount: number;
  materiallyInconsistentMappingCount: number;
  blockingCoverageCount: number;
  insufficientEvidenceCount: number;
  mappings: SanrioParityHumanMapping[];
  coverage: SanrioParityHumanCoverage[];
  replacementRecommendation: SanrioParityReplacementRecommendation;
  replacementRationale: string;
  reviewStatus: "draft_human_input" | "complete_human_parity_review";
  globalBlockers: string[];
  semanticEquivalenceInferred: false;
  automaticMappingDecisionAuthorized: false;
  automaticReplacementDecisionAuthorized: false;
  legacyEntryPointMutationAuthorized: false;
  replacementAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  recordHash: string;
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
  try {
    parseExplicitIso8601Instant(result);
  } catch {
    throw new Error(`${field} must be an explicit-timezone ISO instant`);
  }
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${field} must be a non-negative integer`);
  return Number(value);
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
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

function verifyHashEnvelope(record: JsonObject, hashField: string, field: string): string {
  const expected = hash(record[hashField], `${field}.${hashField}`);
  const { [hashField]: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error(`${field}.${hashField} mismatch`);
  return expected;
}

function stringArray(value: unknown, field: string): string[] {
  const result = array(value, field).map((item, index) => required(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${field} must not contain duplicates`);
  return result.sort();
}

function impact(value: unknown, field: string): "yes" | "no" | "unknown" {
  const result = required(value, field);
  if (result !== "yes" && result !== "no" && result !== "unknown") throw new Error(`${field} is invalid`);
  return result;
}

function parseMappingDecision(value: unknown, field: string): SanrioParityMappingDecision {
  const result = required(value, field);
  if (![
    "pending_human_review",
    "equivalent_evidence_coverage",
    "complementary_evidence_coverage",
    "materially_inconsistent",
    "insufficient_evidence",
  ].includes(result)) throw new Error(`${field} is invalid`);
  return result as SanrioParityMappingDecision;
}

function parseCoverageDisposition(value: unknown, field: string): SanrioParityCoverageDisposition {
  const result = required(value, field);
  if (![
    "pending_human_review",
    "mapped_to_legacy_evidence",
    "additional_coverage_acceptable",
    "blocks_replacement",
    "insufficient_evidence",
  ].includes(result)) throw new Error(`${field} is invalid`);
  return result as SanrioParityCoverageDisposition;
}

function parseRecommendation(value: unknown, field: string): SanrioParityReplacementRecommendation {
  const result = required(value, field);
  if (![
    "pending_human_review",
    "recommend_configured_replacement",
    "recommend_keep_legacy",
    "insufficient_evidence",
  ].includes(result)) throw new Error(`${field} is invalid`);
  return result as SanrioParityReplacementRecommendation;
}

function legacySnapshot(value: unknown, field: string): LegacySourceSnapshot {
  const source = object(value, field);
  return {
    anchorId: required(source.anchorId, `${field}.anchorId`),
    toDocID: docID(source.toDocID, `${field}.toDocID`),
    sourceTextHash: hash(source.sourceTextHash, `${field}.sourceTextHash`),
    pdfSha256: hash(source.pdfSha256, `${field}.pdfSha256`),
    equivalenceDecision: required(source.equivalenceDecision, `${field}.equivalenceDecision`),
    correctionScope: required(source.correctionScope, `${field}.correctionScope`),
    financialStatementImpact: impact(source.financialStatementImpact, `${field}.financialStatementImpact`),
    internalControlImpact: impact(source.internalControlImpact, `${field}.internalControlImpact`),
    auditOpinionImpact: impact(source.auditOpinionImpact, `${field}.auditOpinionImpact`),
    confirmedFactCount: nonNegativeInteger(source.confirmedFactCount, `${field}.confirmedFactCount`),
    exactAmountCount: nonNegativeInteger(source.exactAmountCount, `${field}.exactAmountCount`),
    anchorDecisionHash: hash(source.anchorDecisionHash, `${field}.anchorDecisionHash`),
  };
}

function configuredSnapshot(value: unknown, field: string): ConfiguredSourceSnapshot {
  const source = object(value, field);
  return {
    anchorId: required(source.anchorId, `${field}.anchorId`),
    docID: docID(source.docID, `${field}.docID`),
    structuredTextHash: hash(source.structuredTextHash, `${field}.structuredTextHash`),
    pdfTextHash: hash(source.pdfTextHash, `${field}.pdfTextHash`),
    sourceComparisonResult: required(source.sourceComparisonResult, `${field}.sourceComparisonResult`),
    visualDecision: required(source.visualDecision, `${field}.visualDecision`),
    equivalenceDecision: required(source.equivalenceDecision, `${field}.equivalenceDecision`),
    accountingImpact: impact(source.accountingImpact, `${field}.accountingImpact`),
    internalControlImpact: impact(source.internalControlImpact, `${field}.internalControlImpact`),
    auditOpinionImpact: impact(source.auditOpinionImpact, `${field}.auditOpinionImpact`),
    materiality: required(source.materiality, `${field}.materiality`),
    direction: required(source.direction, `${field}.direction`),
    confirmedFactCount: nonNegativeInteger(source.confirmedFactCount, `${field}.confirmedFactCount`),
    exactAmountCount: nonNegativeInteger(source.exactAmountCount, `${field}.exactAmountCount`),
    decisionHash: hash(source.decisionHash, `${field}.decisionHash`),
  };
}

type WorkspaceMappingSource = {
  legacy: LegacySourceSnapshot;
  mappingHash: string;
  sameDocumentConfiguredAnchorIds: string[];
  exactStructuredTextHashMatchAnchorIds: string[];
  exactPdfTextHashMatchAnchorIds: string[];
  machineRelation: string;
};

type WorkspaceCoverageSource = {
  configured: ConfiguredSourceSnapshot;
  coverageHash: string;
  sameDocumentLegacyAnchorIds: string[];
  exactLegacySourceHashMatchAnchorIds: string[];
  machineRelation: string;
};

function verifyWorkspace(value: unknown): {
  workspace: JsonObject;
  workspaceHash: string;
  mappings: WorkspaceMappingSource[];
  coverage: WorkspaceCoverageSource[];
} {
  const workspace = object(value, "workspace");
  if (
    workspace.schemaVersion !== 1
    || workspace.source !== "edinet"
    || workspace.machineStatus !== "parity_workspace_ready_for_human_mapping"
    || workspace.semanticEquivalenceInferred !== false
    || workspace.automaticAnchorMappingAuthorized !== false
    || workspace.automaticReplacementDecisionAuthorized !== false
    || workspace.replacementReviewStatus !== "pending_human_review"
    || workspace.replacementAuthorized !== false
    || workspace.foundationPreviewEligible !== false
    || workspace.appendAuthorized !== false
  ) throw new Error("workspace safety boundary is invalid");
  const issuer = object(workspace.issuer, "workspace.issuer");
  if (
    text(issuer.issuerKey) !== "sanrio"
    || text(issuer.name) !== "株式会社サンリオ"
    || text(issuer.edinetCode) !== "E02655"
    || text(issuer.secCode) !== "81360"
  ) throw new Error("workspace issuer is not Sanrio");
  const workspaceHash = verifyHashEnvelope(workspace, "workspaceHash", "workspace");
  const seenMappings = new Set<string>();
  const mappings = array(workspace.legacyMappings, "workspace.legacyMappings").map((item, index) => {
    const mapping = object(item, `workspace.legacyMappings[${index}]`);
    const mappingHash = verifyHashEnvelope(mapping, "mappingHash", `workspace.legacyMappings[${index}]`);
    if (
      mapping.humanMappingDecision !== "pending_human_review"
      || mapping.completed !== false
      || array(mapping.selectedConfiguredAnchorIds, `workspace.legacyMappings[${index}].selectedConfiguredAnchorIds`).length !== 0
    ) throw new Error(`workspace.legacyMappings[${index}] is not pending human input`);
    const legacy = legacySnapshot(mapping.legacy, `workspace.legacyMappings[${index}].legacy`);
    if (seenMappings.has(legacy.anchorId)) throw new Error(`workspace has duplicate legacy anchor ${legacy.anchorId}`);
    seenMappings.add(legacy.anchorId);
    return {
      legacy,
      mappingHash,
      sameDocumentConfiguredAnchorIds: stringArray(mapping.sameDocumentConfiguredAnchorIds, `workspace.legacyMappings[${index}].sameDocumentConfiguredAnchorIds`),
      exactStructuredTextHashMatchAnchorIds: stringArray(mapping.exactStructuredTextHashMatchAnchorIds, `workspace.legacyMappings[${index}].exactStructuredTextHashMatchAnchorIds`),
      exactPdfTextHashMatchAnchorIds: stringArray(mapping.exactPdfTextHashMatchAnchorIds, `workspace.legacyMappings[${index}].exactPdfTextHashMatchAnchorIds`),
      machineRelation: required(mapping.machineRelation, `workspace.legacyMappings[${index}].machineRelation`),
    };
  });
  const seenCoverage = new Set<string>();
  const coverage = array(workspace.configuredCoverage, "workspace.configuredCoverage").map((item, index) => {
    const itemObject = object(item, `workspace.configuredCoverage[${index}]`);
    const coverageHash = verifyHashEnvelope(itemObject, "coverageHash", `workspace.configuredCoverage[${index}]`);
    if (itemObject.humanDisposition !== "pending_human_review" || itemObject.completed !== false) {
      throw new Error(`workspace.configuredCoverage[${index}] is not pending human input`);
    }
    const configured = configuredSnapshot(itemObject.configured, `workspace.configuredCoverage[${index}].configured`);
    if (seenCoverage.has(configured.anchorId)) throw new Error(`workspace has duplicate configured anchor ${configured.anchorId}`);
    seenCoverage.add(configured.anchorId);
    return {
      configured,
      coverageHash,
      sameDocumentLegacyAnchorIds: stringArray(itemObject.sameDocumentLegacyAnchorIds, `workspace.configuredCoverage[${index}].sameDocumentLegacyAnchorIds`),
      exactLegacySourceHashMatchAnchorIds: stringArray(itemObject.exactLegacySourceHashMatchAnchorIds, `workspace.configuredCoverage[${index}].exactLegacySourceHashMatchAnchorIds`),
      machineRelation: required(itemObject.machineRelation, `workspace.configuredCoverage[${index}].machineRelation`),
    };
  });
  if (mappings.length !== nonNegativeInteger(workspace.legacyAnchorCount, "workspace.legacyAnchorCount")) {
    throw new Error("workspace legacyAnchorCount mismatch");
  }
  if (coverage.length !== nonNegativeInteger(workspace.configuredAnchorCount, "workspace.configuredAnchorCount")) {
    throw new Error("workspace configuredAnchorCount mismatch");
  }
  return { workspace, workspaceHash, mappings, coverage };
}

function issuerFromWorkspace(workspace: JsonObject): SanrioParityHumanReviewRecord["issuer"] {
  const issuer = object(workspace.issuer, "workspace.issuer");
  return {
    issuerKey: "sanrio",
    name: "株式会社サンリオ",
    edinetCode: "E02655",
    secCode: "81360",
    boundaryHash: hash(issuer.boundaryHash, "workspace.issuer.boundaryHash"),
  };
}

function mappingSourceShape(source: WorkspaceMappingSource): unknown {
  return {
    legacy: source.legacy,
    sourceMappingHash: source.mappingHash,
    sameDocumentConfiguredAnchorIds: source.sameDocumentConfiguredAnchorIds,
    exactStructuredTextHashMatchAnchorIds: source.exactStructuredTextHashMatchAnchorIds,
    exactPdfTextHashMatchAnchorIds: source.exactPdfTextHashMatchAnchorIds,
    machineRelation: source.machineRelation,
  };
}

function coverageSourceShape(source: WorkspaceCoverageSource): unknown {
  return {
    configured: source.configured,
    sourceCoverageHash: source.coverageHash,
    sameDocumentLegacyAnchorIds: source.sameDocumentLegacyAnchorIds,
    exactLegacySourceHashMatchAnchorIds: source.exactLegacySourceHashMatchAnchorIds,
    machineRelation: source.machineRelation,
  };
}

export function buildSanrioParityHumanReviewTemplate(input: {
  workspace: unknown;
  sourceWorkspaceFile: string;
  generatedAt?: string;
}): SanrioParityHumanReviewRecord {
  const source = verifyWorkspace(input.workspace);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const mappings = source.mappings.map(mapping => {
    const base = {
      ...mappingSourceShape(mapping) as Omit<SanrioParityHumanMapping, "selectedConfiguredAnchorIds" | "humanMappingDecision" | "humanNotes" | "completed" | "humanDecisionHash">,
      selectedConfiguredAnchorIds: [] as string[],
      humanMappingDecision: "pending_human_review" as const,
      humanNotes: "",
      completed: false,
    };
    return { ...base, humanDecisionHash: digest(base) };
  });
  const coverage = source.coverage.map(item => {
    const base = {
      ...coverageSourceShape(item) as Omit<SanrioParityHumanCoverage, "humanDisposition" | "humanNotes" | "completed" | "humanDecisionHash">,
      humanDisposition: "pending_human_review" as const,
      humanNotes: "",
      completed: false,
    };
    return { ...base, humanDecisionHash: digest(base) };
  });
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: issuerFromWorkspace(source.workspace),
    registryHash: hash(source.workspace.registryHash, "workspace.registryHash"),
    sourceWorkspaceFile: localJsonBasename(input.sourceWorkspaceFile, "sourceWorkspaceFile"),
    sourceWorkspaceHash: source.workspaceHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    inventoryAuditHumanConfirmed: false,
    mappingCount: mappings.length,
    completedMappingCount: 0,
    coverageCount: coverage.length,
    completedCoverageCount: 0,
    materiallyInconsistentMappingCount: 0,
    blockingCoverageCount: 0,
    insufficientEvidenceCount: 0,
    mappings,
    coverage,
    replacementRecommendation: "pending_human_review" as const,
    replacementRationale: "",
    reviewStatus: "draft_human_input" as const,
    globalBlockers: [
      "inventory_audit_human_confirmation_required",
      "all_legacy_mappings_require_human_decision",
      "all_configured_coverage_requires_human_disposition",
      "human_replacement_recommendation_required",
      "legacy_entry_point_mutation_not_authorized",
      "replacement_not_authorized",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    semanticEquivalenceInferred: false as const,
    automaticMappingDecisionAuthorized: false as const,
    automaticReplacementDecisionAuthorized: false as const,
    legacyEntryPointMutationAuthorized: false as const,
    replacementAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, recordHash: digest(base) };
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function requireNotesForRisk(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} requires human notes`);
  return result;
}

export function finalizeSanrioParityHumanReview(input: {
  workspace: unknown;
  sourceWorkspaceFile: string;
  editedReviewInput: unknown;
  generatedAt?: string;
}): SanrioParityHumanReviewRecord {
  const source = verifyWorkspace(input.workspace);
  const sourceWorkspaceFile = localJsonBasename(input.sourceWorkspaceFile, "sourceWorkspaceFile");
  const edited = object(input.editedReviewInput, "reviewInput");
  if (
    edited.schemaVersion !== 1
    || edited.source !== "edinet"
    || edited.reviewStatus !== "draft_human_input"
    || edited.semanticEquivalenceInferred !== false
    || edited.automaticMappingDecisionAuthorized !== false
    || edited.automaticReplacementDecisionAuthorized !== false
    || edited.legacyEntryPointMutationAuthorized !== false
    || edited.replacementAuthorized !== false
    || edited.foundationPreviewEligible !== false
    || edited.appendAuthorized !== false
  ) throw new Error("reviewInput safety boundary is invalid");
  if (text(edited.sourceWorkspaceFile) !== sourceWorkspaceFile) throw new Error("reviewInput sourceWorkspaceFile mismatch");
  if (text(edited.sourceWorkspaceHash) !== source.workspaceHash) throw new Error("reviewInput sourceWorkspaceHash mismatch");
  if (text(edited.registryHash) !== text(source.workspace.registryHash)) throw new Error("reviewInput registryHash mismatch");
  if (!sameCanonical(edited.issuer, issuerFromWorkspace(source.workspace))) throw new Error("reviewInput issuer fields changed");
  if (edited.inventoryAuditHumanConfirmed !== true) throw new Error("reviewInput requires inventory audit human confirmation");
  const reviewer = required(edited.reviewer, "reviewInput.reviewer");
  const reviewedAt = timestamp(edited.reviewedAt, "reviewInput.reviewedAt");

  const sourceMappingById = new Map(source.mappings.map(mapping => [mapping.legacy.anchorId, mapping]));
  const seenMappings = new Set<string>();
  const mappings = array(edited.mappings, "reviewInput.mappings").map((value, index) => {
    const mapping = object(value, `reviewInput.mappings[${index}]`);
    const legacy = legacySnapshot(mapping.legacy, `reviewInput.mappings[${index}].legacy`);
    if (seenMappings.has(legacy.anchorId)) throw new Error(`duplicate review mapping ${legacy.anchorId}`);
    seenMappings.add(legacy.anchorId);
    const sourceMapping = sourceMappingById.get(legacy.anchorId);
    if (!sourceMapping) throw new Error(`unknown legacy mapping ${legacy.anchorId}`);
    const proposedSource = {
      legacy,
      sourceMappingHash: hash(mapping.sourceMappingHash, `reviewInput mapping ${legacy.anchorId}.sourceMappingHash`),
      sameDocumentConfiguredAnchorIds: stringArray(mapping.sameDocumentConfiguredAnchorIds, `reviewInput mapping ${legacy.anchorId}.sameDocumentConfiguredAnchorIds`),
      exactStructuredTextHashMatchAnchorIds: stringArray(mapping.exactStructuredTextHashMatchAnchorIds, `reviewInput mapping ${legacy.anchorId}.exactStructuredTextHashMatchAnchorIds`),
      exactPdfTextHashMatchAnchorIds: stringArray(mapping.exactPdfTextHashMatchAnchorIds, `reviewInput mapping ${legacy.anchorId}.exactPdfTextHashMatchAnchorIds`),
      machineRelation: required(mapping.machineRelation, `reviewInput mapping ${legacy.anchorId}.machineRelation`),
    };
    if (!sameCanonical(proposedSource, mappingSourceShape(sourceMapping))) {
      throw new Error(`reviewInput mapping ${legacy.anchorId} source fields changed`);
    }
    if (mapping.completed !== true) throw new Error(`reviewInput mapping ${legacy.anchorId} must be completed`);
    const decision = parseMappingDecision(mapping.humanMappingDecision, `reviewInput mapping ${legacy.anchorId}.humanMappingDecision`);
    if (decision === "pending_human_review") throw new Error(`reviewInput mapping ${legacy.anchorId} decision is still pending`);
    const selected = stringArray(mapping.selectedConfiguredAnchorIds, `reviewInput mapping ${legacy.anchorId}.selectedConfiguredAnchorIds`);
    if (selected.some(id => !sourceMapping.sameDocumentConfiguredAnchorIds.includes(id))) {
      throw new Error(`reviewInput mapping ${legacy.anchorId} selected anchor is not a same-document configured candidate`);
    }
    if (
      (decision === "equivalent_evidence_coverage"
        || decision === "complementary_evidence_coverage"
        || decision === "materially_inconsistent")
      && selected.length === 0
    ) throw new Error(`reviewInput mapping ${legacy.anchorId} requires at least one selected configured anchor`);
    if (sourceMapping.machineRelation === "no_configured_document" && decision !== "insufficient_evidence") {
      throw new Error(`reviewInput mapping ${legacy.anchorId} has no configured document and must remain insufficient evidence`);
    }
    const notes = decision === "materially_inconsistent" || decision === "insufficient_evidence"
      ? requireNotesForRisk(mapping.humanNotes, `reviewInput mapping ${legacy.anchorId}`)
      : text(mapping.humanNotes);
    const base = {
      ...proposedSource,
      selectedConfiguredAnchorIds: selected,
      humanMappingDecision: decision,
      humanNotes: notes,
      completed: true,
    };
    return { ...base, humanDecisionHash: digest(base) };
  }).sort((left, right) => left.legacy.anchorId.localeCompare(right.legacy.anchorId));
  if (mappings.length !== source.mappings.length) throw new Error("reviewInput mapping count mismatch");

  const selectedConfigured = new Set(mappings.flatMap(mapping => mapping.selectedConfiguredAnchorIds));
  const sourceCoverageById = new Map(source.coverage.map(item => [item.configured.anchorId, item]));
  const seenCoverage = new Set<string>();
  const coverage = array(edited.coverage, "reviewInput.coverage").map((value, index) => {
    const item = object(value, `reviewInput.coverage[${index}]`);
    const configured = configuredSnapshot(item.configured, `reviewInput.coverage[${index}].configured`);
    if (seenCoverage.has(configured.anchorId)) throw new Error(`duplicate review coverage ${configured.anchorId}`);
    seenCoverage.add(configured.anchorId);
    const sourceCoverage = sourceCoverageById.get(configured.anchorId);
    if (!sourceCoverage) throw new Error(`unknown configured coverage ${configured.anchorId}`);
    const proposedSource = {
      configured,
      sourceCoverageHash: hash(item.sourceCoverageHash, `reviewInput coverage ${configured.anchorId}.sourceCoverageHash`),
      sameDocumentLegacyAnchorIds: stringArray(item.sameDocumentLegacyAnchorIds, `reviewInput coverage ${configured.anchorId}.sameDocumentLegacyAnchorIds`),
      exactLegacySourceHashMatchAnchorIds: stringArray(item.exactLegacySourceHashMatchAnchorIds, `reviewInput coverage ${configured.anchorId}.exactLegacySourceHashMatchAnchorIds`),
      machineRelation: required(item.machineRelation, `reviewInput coverage ${configured.anchorId}.machineRelation`),
    };
    if (!sameCanonical(proposedSource, coverageSourceShape(sourceCoverage))) {
      throw new Error(`reviewInput coverage ${configured.anchorId} source fields changed`);
    }
    if (item.completed !== true) throw new Error(`reviewInput coverage ${configured.anchorId} must be completed`);
    const disposition = parseCoverageDisposition(item.humanDisposition, `reviewInput coverage ${configured.anchorId}.humanDisposition`);
    if (disposition === "pending_human_review") throw new Error(`reviewInput coverage ${configured.anchorId} disposition is still pending`);
    if (selectedConfigured.has(configured.anchorId) && disposition !== "mapped_to_legacy_evidence") {
      throw new Error(`reviewInput coverage ${configured.anchorId} is selected by a mapping and must be mapped_to_legacy_evidence`);
    }
    if (!selectedConfigured.has(configured.anchorId) && disposition === "mapped_to_legacy_evidence") {
      throw new Error(`reviewInput coverage ${configured.anchorId} is not selected by any legacy mapping`);
    }
    const notes = disposition === "blocks_replacement" || disposition === "insufficient_evidence"
      ? requireNotesForRisk(item.humanNotes, `reviewInput coverage ${configured.anchorId}`)
      : text(item.humanNotes);
    const base = {
      ...proposedSource,
      humanDisposition: disposition,
      humanNotes: notes,
      completed: true,
    };
    return { ...base, humanDecisionHash: digest(base) };
  }).sort((left, right) => left.configured.anchorId.localeCompare(right.configured.anchorId));
  if (coverage.length !== source.coverage.length) throw new Error("reviewInput coverage count mismatch");

  const recommendation = parseRecommendation(edited.replacementRecommendation, "reviewInput.replacementRecommendation");
  if (recommendation === "pending_human_review") throw new Error("reviewInput replacementRecommendation is still pending");
  const rationale = required(edited.replacementRationale, "reviewInput.replacementRationale");
  const materiallyInconsistentMappingCount = mappings.filter(mapping => mapping.humanMappingDecision === "materially_inconsistent").length;
  const blockingCoverageCount = coverage.filter(item => item.humanDisposition === "blocks_replacement").length;
  const insufficientEvidenceCount = mappings.filter(mapping => mapping.humanMappingDecision === "insufficient_evidence").length
    + coverage.filter(item => item.humanDisposition === "insufficient_evidence").length;
  if (
    recommendation === "recommend_configured_replacement"
    && (materiallyInconsistentMappingCount > 0 || blockingCoverageCount > 0 || insufficientEvidenceCount > 0)
  ) {
    throw new Error("reviewInput cannot recommend configured replacement while blocking or insufficient parity decisions remain");
  }

  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: issuerFromWorkspace(source.workspace),
    registryHash: hash(source.workspace.registryHash, "workspace.registryHash"),
    sourceWorkspaceFile,
    sourceWorkspaceHash: source.workspaceHash,
    generatedAt,
    reviewer,
    reviewedAt,
    inventoryAuditHumanConfirmed: true,
    mappingCount: mappings.length,
    completedMappingCount: mappings.length,
    coverageCount: coverage.length,
    completedCoverageCount: coverage.length,
    materiallyInconsistentMappingCount,
    blockingCoverageCount,
    insufficientEvidenceCount,
    mappings,
    coverage,
    replacementRecommendation: recommendation,
    replacementRationale: rationale,
    reviewStatus: "complete_human_parity_review" as const,
    globalBlockers: [
      "human_recommendation_is_not_replacement_authorization",
      "explicit_legacy_entry_point_change_requires_separate_reviewed_change",
      "foundation_mapping_gate_still_required",
      "replacement_not_authorized",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    semanticEquivalenceInferred: false as const,
    automaticMappingDecisionAuthorized: false as const,
    automaticReplacementDecisionAuthorized: false as const,
    legacyEntryPointMutationAuthorized: false as const,
    replacementAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, recordHash: digest(base) };
}

export function renderSanrioParityHumanReview(record: SanrioParityHumanReviewRecord): string {
  const lines = [
    "# Sanrio legacy/configured parity human review",
    "",
    `- generatedAt: ${record.generatedAt}`,
    `- reviewer: ${record.reviewer || "pending"}`,
    `- reviewedAt: ${record.reviewedAt ?? "pending"}`,
    `- sourceWorkspaceFile: ${record.sourceWorkspaceFile}`,
    `- sourceWorkspaceHash: ${record.sourceWorkspaceHash}`,
    `- inventoryAuditHumanConfirmed: ${record.inventoryAuditHumanConfirmed}`,
    `- mappings completed: ${record.completedMappingCount}/${record.mappingCount}`,
    `- coverage completed: ${record.completedCoverageCount}/${record.coverageCount}`,
    `- materially inconsistent mappings: ${record.materiallyInconsistentMappingCount}`,
    `- blocking configured coverage: ${record.blockingCoverageCount}`,
    `- insufficient evidence decisions: ${record.insufficientEvidenceCount}`,
    `- replacementRecommendation: ${record.replacementRecommendation}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- recordHash: ${record.recordHash}`,
    "- semanticEquivalenceInferred: false",
    "- automaticMappingDecisionAuthorized: false",
    "- automaticReplacementDecisionAuthorized: false",
    "- legacyEntryPointMutationAuthorized: false",
    "- replacementAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "A human replacement recommendation is evidence for a future change review. It never changes the legacy entry point by itself.",
    "",
    "## Legacy mappings",
    "",
  ];
  for (const mapping of record.mappings) {
    lines.push(
      `### ${mapping.legacy.anchorId}`,
      "",
      `- docID: ${mapping.legacy.toDocID}`,
      `- machineRelation: ${mapping.machineRelation}`,
      `- selected configured anchors: ${mapping.selectedConfiguredAnchorIds.join(", ") || "none"}`,
      `- humanMappingDecision: ${mapping.humanMappingDecision}`,
      `- completed: ${mapping.completed}`,
      `- humanDecisionHash: ${mapping.humanDecisionHash}`,
      "",
    );
  }
  lines.push("## Configured coverage", "");
  for (const item of record.coverage) {
    lines.push(
      `### ${item.configured.anchorId}`,
      "",
      `- docID: ${item.configured.docID}`,
      `- machineRelation: ${item.machineRelation}`,
      `- humanDisposition: ${item.humanDisposition}`,
      `- completed: ${item.completed}`,
      `- humanDecisionHash: ${item.humanDecisionHash}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
