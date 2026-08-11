import { createHash } from "node:crypto";
import { basename } from "node:path";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

type JsonObject = Record<string, unknown>;

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export type SanrioFoundationReadinessStatus =
  | "verified_present"
  | "derivable_without_semantic_inference"
  | "partial_navigation_only"
  | "missing_required_evidence";

export type SanrioFoundationReadinessGroup = {
  groupId: string;
  status: SanrioFoundationReadinessStatus;
  verifiedFields: string[];
  missingFields: string[];
  evidenceRefs: string[];
  note: string;
};

export type SanrioFoundationReadinessAudit = {
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
  sourceParityReviewFile: string;
  sourceParityReviewHash: string;
  sourceParityWorkspaceFile: string;
  sourceParityWorkspaceHash: string;
  sourceConfiguredReviewFile: string;
  sourceConfiguredReviewHash: string;
  generatedAt: string;
  parityReplacementRecommendation: string;
  documentCount: number;
  anchorCount: number;
  confirmedFactCount: number;
  previouslyKnownFactCount: number;
  assumptionCount: number;
  opinionCount: number;
  exactAmountCount: number;
  readinessGroups: SanrioFoundationReadinessGroup[];
  verifiedFieldCount: number;
  derivableFieldCount: number;
  partialFieldCount: number;
  missingFieldCount: number;
  missingFields: string[];
  readinessStatus: "blocked_missing_foundation_mapping_evidence" | "ready_for_separate_foundation_mapping_gate";
  foundationMappingGateReady: boolean;
  automaticFieldSynthesisAuthorized: false;
  legacyEntryPointMutationAuthorized: false;
  replacementAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  blockers: string[];
  auditHash: string;
};

type AnchorSummary = {
  anchorId: string;
  docID: string;
  decisionHash: string;
  structuredTextHash: string;
  pdfTextHash: string;
  entryPath: string;
  pdfPageNumber: number;
  confirmedFactCount: number;
  previouslyKnownFactCount: number;
  assumptionCount: number;
  opinionCount: number;
  exactAmountCount: number;
};

type ConfiguredReviewSummary = {
  recordHash: string;
  registryHash: string;
  boundaryHash: string;
  reviewer: string;
  reviewedAt: string;
  documents: string[];
  anchors: AnchorSummary[];
};

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
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
  parseExplicitIso8601Instant(result, field);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (
    result === "."
    || result === ".."
    || result.includes("/")
    || result.includes("\\")
    || !result.endsWith(".json")
  ) {
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

function assertSanrioIssuer(value: unknown, field: string): string {
  const issuer = object(value, field);
  if (
    text(issuer.issuerKey) !== "sanrio"
    || text(issuer.name) !== "株式会社サンリオ"
    || text(issuer.edinetCode) !== "E02655"
    || text(issuer.secCode) !== "81360"
  ) {
    throw new Error(`${field} is not the configured Sanrio issuer`);
  }
  return hash(issuer.boundaryHash, `${field}.boundaryHash`);
}

function countStrings(value: unknown, field: string): number {
  return array(value, field).map((item, index) => required(item, `${field}[${index}]`)).length;
}

function verifyConfiguredReview(value: unknown): ConfiguredReviewSummary {
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
  const recordHash = verifyHashEnvelope(record, "recordHash", "configuredReview");
  const boundaryHash = assertSanrioIssuer(record.issuer, "configuredReview.issuer");
  const registryHash = hash(record.registryHash, "configuredReview.registryHash");
  const reviewer = required(record.reviewer, "configuredReview.reviewer");
  const reviewedAt = timestamp(record.reviewedAt, "configuredReview.reviewedAt");
  const expectedDocumentCount = nonNegativeInteger(record.documentCount, "configuredReview.documentCount");
  const expectedAnchorCount = nonNegativeInteger(record.anchorCount, "configuredReview.anchorCount");
  const expectedCompletedAnchorCount = nonNegativeInteger(
    record.completedAnchorCount,
    "configuredReview.completedAnchorCount",
  );
  if (expectedAnchorCount !== expectedCompletedAnchorCount) {
    throw new Error("configuredReview anchors are not fully completed");
  }

  const seenDocuments = new Set<string>();
  const seenAnchors = new Set<string>();
  const anchors: AnchorSummary[] = [];
  const documents = array(record.documents, "configuredReview.documents").map((value2, documentIndex) => {
    const document = object(value2, `configuredReview.documents[${documentIndex}]`);
    verifyHashEnvelope(document, "documentDecisionHash", `configuredReview.documents[${documentIndex}]`);
    const id = docID(document.docID, `configuredReview.documents[${documentIndex}].docID`);
    if (seenDocuments.has(id)) throw new Error(`configuredReview has duplicate document ${id}`);
    seenDocuments.add(id);
    const documentAnchorCount = nonNegativeInteger(
      document.anchorCount,
      `configuredReview.documents[${documentIndex}].anchorCount`,
    );
    const completedAnchorCount = nonNegativeInteger(
      document.completedAnchorCount,
      `configuredReview.documents[${documentIndex}].completedAnchorCount`,
    );
    const rawAnchors = array(document.anchors, `configuredReview.documents[${documentIndex}].anchors`);
    if (documentAnchorCount !== rawAnchors.length || completedAnchorCount !== rawAnchors.length) {
      throw new Error(`configuredReview document ${id} anchors are not fully completed`);
    }
    for (const [anchorIndex, anchorValue] of rawAnchors.entries()) {
      const anchor = object(anchorValue, `configuredReview document ${id}.anchors[${anchorIndex}]`);
      const decisionHash = verifyHashEnvelope(
        anchor,
        "decisionHash",
        `configuredReview document ${id}.anchors[${anchorIndex}]`,
      );
      const anchorId = required(anchor.anchorId, `configuredReview document ${id}.anchors[${anchorIndex}].anchorId`);
      if (seenAnchors.has(anchorId)) throw new Error(`configuredReview has duplicate anchor ${anchorId}`);
      seenAnchors.add(anchorId);
      if (anchor.completed !== true || anchor.visualConfirmation !== true) {
        throw new Error(`configuredReview anchor ${anchorId} is not human-complete`);
      }
      const visualDecision = required(anchor.visualDecision, `configuredReview anchor ${anchorId}.visualDecision`);
      const equivalenceDecision = required(
        anchor.equivalenceDecision,
        `configuredReview anchor ${anchorId}.equivalenceDecision`,
      );
      if (visualDecision === "pending_human_review" || equivalenceDecision === "pending_human_review") {
        throw new Error(`configuredReview anchor ${anchorId} decisions are still pending`);
      }
      const structured = object(anchor.structured, `configuredReview anchor ${anchorId}.structured`);
      const pdf = object(anchor.pdf, `configuredReview anchor ${anchorId}.pdf`);
      anchors.push({
        anchorId,
        docID: id,
        decisionHash,
        structuredTextHash: hash(structured.textHash, `configuredReview anchor ${anchorId}.structured.textHash`),
        pdfTextHash: hash(pdf.textHash, `configuredReview anchor ${anchorId}.pdf.textHash`),
        entryPath: required(structured.entryPath, `configuredReview anchor ${anchorId}.structured.entryPath`),
        pdfPageNumber: positiveInteger(pdf.pageNumber, `configuredReview anchor ${anchorId}.pdf.pageNumber`),
        confirmedFactCount: countStrings(anchor.confirmedFacts, `configuredReview anchor ${anchorId}.confirmedFacts`),
        previouslyKnownFactCount: countStrings(
          anchor.previouslyKnownFacts,
          `configuredReview anchor ${anchorId}.previouslyKnownFacts`,
        ),
        assumptionCount: countStrings(anchor.assumptions, `configuredReview anchor ${anchorId}.assumptions`),
        opinionCount: countStrings(anchor.opinions, `configuredReview anchor ${anchorId}.opinions`),
        exactAmountCount: array(anchor.exactAmounts, `configuredReview anchor ${anchorId}.exactAmounts`).length,
      });
    }
    return id;
  }).sort();

  if (documents.length !== expectedDocumentCount) throw new Error("configuredReview documentCount mismatch");
  if (anchors.length !== expectedAnchorCount) throw new Error("configuredReview anchorCount mismatch");
  return { recordHash, registryHash, boundaryHash, reviewer, reviewedAt, documents, anchors };
}

function verifyParityWorkspace(input: {
  value: unknown;
  configuredReview: ConfiguredReviewSummary;
  sourceConfiguredReviewFile: string;
}): { workspaceHash: string; registryHash: string; boundaryHash: string } {
  const workspace = object(input.value, "parityWorkspace");
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
  ) {
    throw new Error("parityWorkspace safety boundary is invalid");
  }
  const workspaceHash = verifyHashEnvelope(workspace, "workspaceHash", "parityWorkspace");
  const boundaryHash = assertSanrioIssuer(workspace.issuer, "parityWorkspace.issuer");
  const registryHash = hash(workspace.registryHash, "parityWorkspace.registryHash");
  if (registryHash !== input.configuredReview.registryHash || boundaryHash !== input.configuredReview.boundaryHash) {
    throw new Error("parityWorkspace/configuredReview issuer lineage mismatch");
  }
  if (hash(workspace.sourceConfiguredReviewHash, "parityWorkspace.sourceConfiguredReviewHash")
    !== input.configuredReview.recordHash) {
    throw new Error("parityWorkspace sourceConfiguredReviewHash mismatch");
  }
  const configuredPath = required(workspace.sourceConfiguredReviewPath, "parityWorkspace.sourceConfiguredReviewPath");
  if (basename(configuredPath) !== input.sourceConfiguredReviewFile) {
    throw new Error("parityWorkspace sourceConfiguredReviewPath mismatch");
  }

  const configuredById = new Map(input.configuredReview.anchors.map(anchor => [anchor.anchorId, anchor]));
  const coverage = array(workspace.configuredCoverage, "parityWorkspace.configuredCoverage");
  if (coverage.length !== input.configuredReview.anchors.length) {
    throw new Error("parityWorkspace configured coverage count mismatch");
  }
  const seen = new Set<string>();
  for (const [index, value2] of coverage.entries()) {
    const item = object(value2, `parityWorkspace.configuredCoverage[${index}]`);
    verifyHashEnvelope(item, "coverageHash", `parityWorkspace.configuredCoverage[${index}]`);
    const configured = object(item.configured, `parityWorkspace.configuredCoverage[${index}].configured`);
    const anchorId = required(configured.anchorId, `parityWorkspace.configuredCoverage[${index}].configured.anchorId`);
    if (seen.has(anchorId)) throw new Error(`parityWorkspace has duplicate configured anchor ${anchorId}`);
    seen.add(anchorId);
    const sourceAnchor = configuredById.get(anchorId);
    if (!sourceAnchor) throw new Error(`parityWorkspace contains unknown configured anchor ${anchorId}`);
    if (
      docID(configured.docID, `parityWorkspace configured ${anchorId}.docID`) !== sourceAnchor.docID
      || hash(configured.structuredTextHash, `parityWorkspace configured ${anchorId}.structuredTextHash`) !== sourceAnchor.structuredTextHash
      || hash(configured.pdfTextHash, `parityWorkspace configured ${anchorId}.pdfTextHash`) !== sourceAnchor.pdfTextHash
      || hash(configured.decisionHash, `parityWorkspace configured ${anchorId}.decisionHash`) !== sourceAnchor.decisionHash
    ) {
      throw new Error(`parityWorkspace configured anchor ${anchorId} lineage mismatch`);
    }
  }
  return { workspaceHash, registryHash, boundaryHash };
}

function verifyParityReview(input: {
  value: unknown;
  workspaceHash: string;
  sourceParityWorkspaceFile: string;
  registryHash: string;
  boundaryHash: string;
}): { recordHash: string; replacementRecommendation: string } {
  const review = object(input.value, "parityReview");
  if (
    review.schemaVersion !== 1
    || review.source !== "edinet"
    || review.reviewStatus !== "complete_human_parity_review"
    || review.inventoryAuditHumanConfirmed !== true
    || review.semanticEquivalenceInferred !== false
    || review.automaticMappingDecisionAuthorized !== false
    || review.automaticReplacementDecisionAuthorized !== false
    || review.legacyEntryPointMutationAuthorized !== false
    || review.replacementAuthorized !== false
    || review.foundationPreviewEligible !== false
    || review.appendAuthorized !== false
  ) {
    throw new Error("parityReview safety boundary is invalid");
  }
  const recordHash = verifyHashEnvelope(review, "recordHash", "parityReview");
  const boundaryHash = assertSanrioIssuer(review.issuer, "parityReview.issuer");
  const registryHash = hash(review.registryHash, "parityReview.registryHash");
  if (boundaryHash !== input.boundaryHash || registryHash !== input.registryHash) {
    throw new Error("parityReview issuer lineage mismatch");
  }
  if (hash(review.sourceWorkspaceHash, "parityReview.sourceWorkspaceHash") !== input.workspaceHash) {
    throw new Error("parityReview sourceWorkspaceHash mismatch");
  }
  if (localJsonBasename(review.sourceWorkspaceFile, "parityReview.sourceWorkspaceFile")
    !== input.sourceParityWorkspaceFile) {
    throw new Error("parityReview sourceWorkspaceFile mismatch");
  }
  const mappingCount = nonNegativeInteger(review.mappingCount, "parityReview.mappingCount");
  const coverageCount = nonNegativeInteger(review.coverageCount, "parityReview.coverageCount");
  if (
    mappingCount !== nonNegativeInteger(review.completedMappingCount, "parityReview.completedMappingCount")
    || coverageCount !== nonNegativeInteger(review.completedCoverageCount, "parityReview.completedCoverageCount")
  ) {
    throw new Error("parityReview is not fully completed");
  }
  const mappings = array(review.mappings, "parityReview.mappings");
  const coverageItems = array(review.coverage, "parityReview.coverage");
  if (mappings.length !== mappingCount) {
    throw new Error("parityReview mappingCount mismatch");
  }
  if (coverageItems.length !== coverageCount) {
    throw new Error("parityReview coverageCount mismatch");
  }
  for (const [index, value2] of mappings.entries()) {
    const mapping = object(value2, `parityReview.mappings[${index}]`);
    verifyHashEnvelope(mapping, "humanDecisionHash", `parityReview.mappings[${index}]`);
    if (mapping.completed !== true || text(mapping.humanMappingDecision) === "pending_human_review") {
      throw new Error(`parityReview.mappings[${index}] is incomplete`);
    }
  }
  for (const [index, value2] of coverageItems.entries()) {
    const coverage = object(value2, `parityReview.coverage[${index}]`);
    verifyHashEnvelope(coverage, "humanDecisionHash", `parityReview.coverage[${index}]`);
    if (coverage.completed !== true || text(coverage.humanDisposition) === "pending_human_review") {
      throw new Error(`parityReview.coverage[${index}] is incomplete`);
    }
  }
  const replacementRecommendation = required(
    review.replacementRecommendation,
    "parityReview.replacementRecommendation",
  );
  if (replacementRecommendation === "pending_human_review") {
    throw new Error("parityReview replacement recommendation is pending");
  }
  return { recordHash, replacementRecommendation };
}

function group(input: SanrioFoundationReadinessGroup): SanrioFoundationReadinessGroup {
  return {
    ...input,
    verifiedFields: [...new Set(input.verifiedFields)].sort(),
    missingFields: [...new Set(input.missingFields)].sort(),
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
  };
}

function readinessGroups(input: {
  configured: ConfiguredReviewSummary;
  parityWorkspaceHash: string;
  parityReviewHash: string;
}): SanrioFoundationReadinessGroup[] {
  const anchorRefs = input.configured.anchors.map(anchor => `${anchor.docID}:${anchor.anchorId}`);
  return [
    group({
      groupId: "verified_record_lineage",
      status: "verified_present",
      verifiedFields: [
        "registryHash",
        "issuer.issuerKey",
        "issuer.name",
        "issuer.edinetCode",
        "issuer.secCode",
        "issuer.boundaryHash",
        "docID",
        "configuredReview.recordHash",
        "parityWorkspace.workspaceHash",
        "parityReview.recordHash",
      ],
      missingFields: [],
      evidenceRefs: [input.configured.recordHash, input.parityWorkspaceHash, input.parityReviewHash],
      note: "Issuer, document, and review lineage are hash-verified across configured review and parity records.",
    }),
    group({
      groupId: "human_review_evidence",
      status: "verified_present",
      verifiedFields: [
        "reviewer",
        "reviewedAt",
        "visualDecision",
        "equivalenceDecision",
        "confirmedFacts",
        "previouslyKnownFacts",
        "assumptions",
        "opinions",
        "exactAmounts",
        "accountingImpact",
        "internalControlImpact",
        "auditOpinionImpact",
        "materiality",
        "direction",
      ],
      missingFields: [],
      evidenceRefs: anchorRefs,
      note: "The audit records only counts and hashes; reviewed source text and fact strings are not copied into the readiness artifact.",
    }),
    group({
      groupId: "review_identifier",
      status: "derivable_without_semantic_inference",
      verifiedFields: ["reviewId"],
      missingFields: [],
      evidenceRefs: [input.configured.recordHash],
      note: "A mapping-layer reviewId may be generated deterministically from verified document/hash lineage without asserting a new fact.",
    }),
    group({
      groupId: "security_master",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: ["entityIds"],
      evidenceRefs: [],
      note: "EDINET issuer codes are not a substitute for governed Security Master entity IDs.",
    }),
    group({
      groupId: "document_metadata",
      status: "missing_required_evidence",
      verifiedFields: ["docID"],
      missingFields: [
        "chainRootDocID",
        "documentTypeCode",
        "sourceContentHash",
        "title",
        "summary",
        "language",
      ],
      evidenceRefs: input.configured.documents,
      note: "Anchor text hashes are line-level navigation evidence and must not be promoted to the document sourceContentHash.",
    }),
    group({
      groupId: "pit_timestamps",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: [
        "publishedAt",
        "observedAt",
        "retrievedAt",
        "effectiveFrom",
        "firstExecutableAt",
        "eventAtStatus",
        "eventAt",
      ],
      evidenceRefs: [],
      note: "The configured human comparison record does not carry the complete Foundation PIT clock set.",
    }),
    group({
      groupId: "retrieval_and_normalization",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: [
        "retrievalRunId",
        "parserVersion",
        "normalizationVersion",
        "normalizedStructureHash",
      ],
      evidenceRefs: [],
      note: "Normalized anchor hashes do not prove the document-level parser/normalization lineage required by Foundation.",
    }),
    group({
      groupId: "revision_chain",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: [
        "revisionKind",
        "revisionSequence",
        "evidenceStatus",
        "documentRevisionStatus",
        "prior",
      ],
      evidenceRefs: [],
      note: "Parity review does not establish the governed Foundation revision sequence or prior Evidence/Document Revision relation.",
    }),
    group({
      groupId: "rights_and_storage",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: ["license", "storagePolicy"],
      evidenceRefs: [],
      note: "License and storage policy must be explicit; local file presence or successful review does not establish either field.",
    }),
    group({
      groupId: "section_mapping",
      status: "partial_navigation_only",
      verifiedFields: ["sections[].path", "anchor.structured.textHash", "anchor.pdf.textHash"],
      missingFields: [
        "sections[].sectionId",
        "sections[].ordinal",
        "sections[].titleHash",
        "sections[].contentHash",
      ],
      evidenceRefs: anchorRefs,
      note: "Entry paths and anchor hashes help navigation only. They do not prove a complete semantic section mapping or section content hash.",
    }),
  ].sort((left, right) => left.groupId.localeCompare(right.groupId));
}

export function auditSanrioConfiguredFoundationReadiness(input: {
  parityReview: unknown;
  sourceParityReviewFile: string;
  parityWorkspace: unknown;
  sourceParityWorkspaceFile: string;
  configuredReview: unknown;
  sourceConfiguredReviewFile: string;
  generatedAt?: string;
}): SanrioFoundationReadinessAudit {
  const sourceParityReviewFile = localJsonBasename(input.sourceParityReviewFile, "sourceParityReviewFile");
  const sourceParityWorkspaceFile = localJsonBasename(
    input.sourceParityWorkspaceFile,
    "sourceParityWorkspaceFile",
  );
  const sourceConfiguredReviewFile = localJsonBasename(
    input.sourceConfiguredReviewFile,
    "sourceConfiguredReviewFile",
  );
  const configured = verifyConfiguredReview(input.configuredReview);
  const workspace = verifyParityWorkspace({
    value: input.parityWorkspace,
    configuredReview: configured,
    sourceConfiguredReviewFile,
  });
  const parity = verifyParityReview({
    value: input.parityReview,
    workspaceHash: workspace.workspaceHash,
    sourceParityWorkspaceFile,
    registryHash: workspace.registryHash,
    boundaryHash: workspace.boundaryHash,
  });
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const groups = readinessGroups({
    configured,
    parityWorkspaceHash: workspace.workspaceHash,
    parityReviewHash: parity.recordHash,
  });
  const missingFields = [...new Set(groups.flatMap(item => item.missingFields))].sort();
  const verifiedFieldCount = groups.reduce((sum, item) => sum + item.verifiedFields.length, 0);
  const derivableFieldCount = groups
    .filter(item => item.status === "derivable_without_semantic_inference")
    .reduce((sum, item) => sum + item.verifiedFields.length, 0);
  const partialFieldCount = groups
    .filter(item => item.status === "partial_navigation_only")
    .reduce((sum, item) => sum + item.missingFields.length, 0);
  const missingFieldCount = missingFields.length;
  const foundationMappingGateReady = missingFieldCount === 0 && partialFieldCount === 0;
  const totals = configured.anchors.reduce(
    (acc, anchor) => ({
      confirmedFactCount: acc.confirmedFactCount + anchor.confirmedFactCount,
      previouslyKnownFactCount: acc.previouslyKnownFactCount + anchor.previouslyKnownFactCount,
      assumptionCount: acc.assumptionCount + anchor.assumptionCount,
      opinionCount: acc.opinionCount + anchor.opinionCount,
      exactAmountCount: acc.exactAmountCount + anchor.exactAmountCount,
    }),
    {
      confirmedFactCount: 0,
      previouslyKnownFactCount: 0,
      assumptionCount: 0,
      opinionCount: 0,
      exactAmountCount: 0,
    },
  );
  const blockers = [
    ...(foundationMappingGateReady ? [] : ["required_foundation_mapping_evidence_missing"]),
    "foundation_mapping_requires_separate_human_reviewed_input",
    "anchor_hashes_must_not_substitute_for_document_or_section_hashes",
    "automatic_field_synthesis_not_authorized",
    "legacy_entry_point_mutation_not_authorized",
    "replacement_not_authorized",
    "foundation_preview_not_eligible",
    "governed_store_append_not_authorized",
  ].sort();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      issuerKey: "sanrio" as const,
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
      boundaryHash: configured.boundaryHash,
    },
    registryHash: configured.registryHash,
    sourceParityReviewFile,
    sourceParityReviewHash: parity.recordHash,
    sourceParityWorkspaceFile,
    sourceParityWorkspaceHash: workspace.workspaceHash,
    sourceConfiguredReviewFile,
    sourceConfiguredReviewHash: configured.recordHash,
    generatedAt,
    parityReplacementRecommendation: parity.replacementRecommendation,
    documentCount: configured.documents.length,
    anchorCount: configured.anchors.length,
    ...totals,
    readinessGroups: groups,
    verifiedFieldCount,
    derivableFieldCount,
    partialFieldCount,
    missingFieldCount,
    missingFields,
    readinessStatus: foundationMappingGateReady
      ? "ready_for_separate_foundation_mapping_gate" as const
      : "blocked_missing_foundation_mapping_evidence" as const,
    foundationMappingGateReady,
    automaticFieldSynthesisAuthorized: false as const,
    legacyEntryPointMutationAuthorized: false as const,
    replacementAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
    blockers,
  };
  return { ...base, auditHash: digest(base) };
}

export function renderSanrioConfiguredFoundationReadinessAudit(
  audit: SanrioFoundationReadinessAudit,
): string {
  const lines = [
    "# Sanrio configured Foundation readiness audit",
    "",
    `- generatedAt: ${audit.generatedAt}`,
    `- parityReplacementRecommendation: ${audit.parityReplacementRecommendation}`,
    `- documents/anchors: ${audit.documentCount}/${audit.anchorCount}`,
    `- reviewed fact categories: confirmed=${audit.confirmedFactCount}, previouslyKnown=${audit.previouslyKnownFactCount}, assumptions=${audit.assumptionCount}, opinions=${audit.opinionCount}`,
    `- exactAmountCount: ${audit.exactAmountCount}`,
    `- missingFieldCount: ${audit.missingFieldCount}`,
    `- readinessStatus: ${audit.readinessStatus}`,
    `- foundationMappingGateReady: ${audit.foundationMappingGateReady}`,
    `- auditHash: ${audit.auditHash}`,
    "- automaticFieldSynthesisAuthorized: false",
    "- legacyEntryPointMutationAuthorized: false",
    "- replacementAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "This audit does not copy reviewed source text or promote anchor hashes into document/section hashes.",
    "",
    "## Readiness groups",
    "",
  ];
  for (const item of audit.readinessGroups) {
    lines.push(
      `### ${item.groupId}`,
      "",
      `- status: ${item.status}`,
      `- verified: ${item.verifiedFields.join(", ") || "none"}`,
      `- missing: ${item.missingFields.join(", ") || "none"}`,
      `- evidence refs: ${item.evidenceRefs.join(", ") || "none"}`,
      `- note: ${item.note}`,
      "",
    );
  }
  lines.push("## Missing Foundation mapping fields", "", ...audit.missingFields.map(field => `- ${field}`), "");
  return `${lines.join("\n")}\n`;
}
