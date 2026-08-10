import { createHash } from "node:crypto";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
  type EdinetIssuerBoundary,
} from "./edinet-issuer-boundary.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_ANCHORS_PER_DOCUMENT = 40;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetFidelitySourceFile = {
  documentType: "1" | "2";
  format: "zip" | "pdf";
  binaryFile: string;
  binarySha256: string;
  binaryByteLength: number;
  metadataFile: string;
  metadataSha256: string;
  metadataByteLength: number;
  retrievedAt: string;
};

export type ConfiguredEdinetFidelityDocumentPlan = {
  pairId: string;
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  description: string;
  submitDateTime: string;
  structuredSource: ConfiguredEdinetFidelitySourceFile;
  officialPdf: ConfiguredEdinetFidelitySourceFile;
  anchorInput: {
    status: "pending_human_input";
    minimumAnchorCount: 1;
    maximumAnchorCount: 40;
    anchorCount: 0;
    anchors: [];
  };
  extraction: {
    structuredText: "not_started";
    pdfText: "not_started";
    allowedMethods: ["structured_visible_text", "pdftotext_layout", "manual_pdf_visual"];
    automaticExecutionAuthorized: false;
  };
  decisions: {
    contentEquivalent: "unknown_pending_human_review";
    accountingImpact: "unknown_pending_human_review";
    internalControlImpact: "unknown_pending_human_review";
    auditOpinionImpact: "unknown_pending_human_review";
    materiality: "unknown_pending_human_review";
    direction: "unknown_pending_human_review";
  };
  blockers: string[];
  pairHash: string;
};

export type ConfiguredEdinetFidelityPlan = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  sourceReviewWorkspaceFile: string;
  sourceReviewWorkspaceHash: string;
  generatedAt: string;
  documentPairCount: number;
  anchorCount: 0;
  anchorInputStatus: "pending_human_input";
  extractionStatus: "not_started";
  reviewStatus: "pending_source_fidelity_review";
  documents: ConfiguredEdinetFidelityDocumentPlan[];
  globalBlockers: string[];
  automaticExtractionAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  fidelityPlanHash: string;
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
  try {
    parseExplicitIso8601Instant(result, field);
  } catch {
    throw new Error(`${field} must be an explicit ISO date-time`);
  }
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
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

function verifyWorkspace(
  workspace: JsonObject,
  registryInput: unknown,
): { workspaceHash: string; boundary: EdinetIssuerBoundary; registryHash: string } {
  const registry = buildEdinetIssuerRegistry(registryInput);
  if (workspace.schemaVersion !== 2 || workspace.source !== "edinet") {
    throw new Error("reviewWorkspace schema/source is unsupported");
  }
  if (
    workspace.acquisitionComplete !== true
    || workspace.fileIntegrityVerified !== true
    || workspace.reviewStatus !== "pending_human_review"
    || workspace.foundationPreviewEligible !== false
    || workspace.appendAuthorized !== false
  ) {
    throw new Error("reviewWorkspace safety boundary is invalid");
  }
  const expected = hash(workspace.workspaceHash, "reviewWorkspace.workspaceHash");
  const { workspaceHash: _ignored, ...withoutHash } = workspace;
  if (digest(withoutHash) !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");
  if (text(workspace.registryHash) !== registry.registryHash) {
    throw new Error("reviewWorkspace.registryHash does not match configured registry");
  }
  const issuer = object(workspace.issuer, "reviewWorkspace.issuer");
  const boundary = resolveEdinetIssuerBoundary(
    registry,
    required(issuer.issuerKey, "reviewWorkspace.issuer.issuerKey"),
  );
  if (
    text(issuer.name) !== boundary.name
    || text(issuer.edinetCode).toUpperCase() !== boundary.edinetCode
    || text(issuer.secCode) !== boundary.secCode
    || text(issuer.boundaryHash) !== boundary.boundaryHash
  ) {
    throw new Error("reviewWorkspace issuer identity does not match configured boundary");
  }
  return { workspaceHash: expected, boundary, registryHash: registry.registryHash };
}

function parseSourceFile(
  value: unknown,
  field: string,
): ConfiguredEdinetFidelitySourceFile {
  const record = object(value, field);
  const documentTypeValue = required(record.documentType, `${field}.documentType`);
  const formatValue = required(record.format, `${field}.format`);
  if (documentTypeValue !== "1" && documentTypeValue !== "2") {
    throw new Error(`${field}.documentType is unsupported`);
  }
  if (
    (documentTypeValue === "1" && formatValue !== "zip")
    || (documentTypeValue === "2" && formatValue !== "pdf")
  ) {
    throw new Error(`${field} type/format mismatch`);
  }
  const documentType: ConfiguredEdinetFidelitySourceFile["documentType"] = documentTypeValue;
  const format: ConfiguredEdinetFidelitySourceFile["format"] = formatValue as "zip" | "pdf";
  return {
    documentType,
    format,
    binaryFile: localBasename(record.binaryFile, `${field}.binaryFile`),
    binarySha256: hash(record.binarySha256, `${field}.binarySha256`),
    binaryByteLength: positiveInteger(record.binaryByteLength, `${field}.binaryByteLength`),
    metadataFile: localBasename(record.metadataFile, `${field}.metadataFile`),
    metadataSha256: hash(record.metadataSha256, `${field}.metadataSha256`),
    metadataByteLength: positiveInteger(record.metadataByteLength, `${field}.metadataByteLength`),
    retrievedAt: timestamp(record.retrievedAt, `${field}.retrievedAt`),
  };
}

function documentBlockers(parentDocID: string | null): string[] {
  return [
    "structured_visible_text_not_extracted",
    "pdf_layout_text_not_extracted",
    "human_anchor_input_required",
    "exact_anchor_comparison_not_executed",
    "official_pdf_visual_review_required",
    "content_equivalence_not_decided",
    "accounting_internal_control_audit_impact_not_decided",
    "materiality_and_direction_not_decided",
    ...(parentDocID ? ["parent_child_revision_comparison_required"] : []),
  ].sort();
}

function parseDocuments(
  workspace: JsonObject,
  boundary: EdinetIssuerBoundary,
): ConfiguredEdinetFidelityDocumentPlan[] {
  const documents: ConfiguredEdinetFidelityDocumentPlan[] = [];
  const seen = new Set<string>();
  for (const [groupIndex, groupValue] of array(workspace.groups, "reviewWorkspace.groups").entries()) {
    const group = object(groupValue, `reviewWorkspace.groups[${groupIndex}]`);
    const groupRoot = docID(
      group.chainRootDocID,
      `reviewWorkspace.groups[${groupIndex}].chainRootDocID`,
    );
    for (const [documentIndex, documentValue] of array(
      group.documents,
      `reviewWorkspace.groups[${groupIndex}].documents`,
    ).entries()) {
      const document = object(
        documentValue,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}]`,
      );
      const id = docID(document.docID, `reviewWorkspace document ${documentIndex}.docID`);
      if (seen.has(id)) throw new Error(`reviewWorkspace has duplicate document ${id}`);
      seen.add(id);
      const root = docID(
        document.chainRootDocID,
        `reviewWorkspace document ${id}.chainRootDocID`,
      );
      if (root !== groupRoot) throw new Error(`reviewWorkspace document ${id} chain root mismatch`);
      if (
        document.structuredDocumentVerified !== true
        || document.officialPdfVerified !== true
        || document.reviewStatus !== "pending_human_review"
      ) {
        throw new Error(`reviewWorkspace document ${id} is not fidelity-reviewable`);
      }
      const parentText = text(document.parentDocID);
      if (parentText && !DOC_ID_RE.test(parentText)) {
        throw new Error(`reviewWorkspace document ${id} parentDocID is invalid`);
      }
      const acquisitions = array(
        document.acquisitions,
        `reviewWorkspace document ${id}.acquisitions`,
      ).map((item, index) => parseSourceFile(
        item,
        `reviewWorkspace document ${id}.acquisitions[${index}]`,
      ));
      if (acquisitions.length !== 2) {
        throw new Error(`reviewWorkspace document ${id} must have exactly two acquisitions`);
      }
      const structuredSource = acquisitions.find(item => item.documentType === "1");
      const officialPdf = acquisitions.find(item => item.documentType === "2");
      if (!structuredSource || !officialPdf) {
        throw new Error(`reviewWorkspace document ${id} requires type 1 and type 2 sources`);
      }
      const pairBase = {
        docID: id,
        structuredSha256: structuredSource.binarySha256,
        pdfSha256: officialPdf.binarySha256,
        workspaceBoundaryHash: boundary.boundaryHash,
      };
      const base: Omit<ConfiguredEdinetFidelityDocumentPlan, "pairHash"> = {
        pairId: `fidelity:${boundary.issuerKey}:${id}`,
        docID: id,
        parentDocID: parentText || null,
        chainRootDocID: root,
        description: required(document.description, `reviewWorkspace document ${id}.description`),
        submitDateTime: timestamp(
          document.submitDateTime,
          `reviewWorkspace document ${id}.submitDateTime`,
        ),
        structuredSource,
        officialPdf,
        anchorInput: {
          status: "pending_human_input",
          minimumAnchorCount: 1,
          maximumAnchorCount: MAX_ANCHORS_PER_DOCUMENT,
          anchorCount: 0,
          anchors: [],
        },
        extraction: {
          structuredText: "not_started",
          pdfText: "not_started",
          allowedMethods: ["structured_visible_text", "pdftotext_layout", "manual_pdf_visual"],
          automaticExecutionAuthorized: false,
        },
        decisions: {
          contentEquivalent: "unknown_pending_human_review",
          accountingImpact: "unknown_pending_human_review",
          internalControlImpact: "unknown_pending_human_review",
          auditOpinionImpact: "unknown_pending_human_review",
          materiality: "unknown_pending_human_review",
          direction: "unknown_pending_human_review",
        },
        blockers: documentBlockers(parentText || null),
      };
      documents.push({ ...base, pairHash: digest({ ...base, pairBase }) });
    }
  }
  if (documents.length === 0) throw new Error("reviewWorkspace has no fidelity document pairs");
  const expectedDocumentCount = positiveInteger(
    workspace.documentCount,
    "reviewWorkspace.documentCount",
  );
  if (documents.length !== expectedDocumentCount) {
    throw new Error("reviewWorkspace.documentCount mismatch");
  }
  return documents.sort((left, right) =>
    `${left.chainRootDocID}|${left.submitDateTime}|${left.docID}`.localeCompare(
      `${right.chainRootDocID}|${right.submitDateTime}|${right.docID}`,
    ),
  );
}

export function buildConfiguredEdinetFidelityPlan(input: {
  registry: unknown;
  reviewWorkspace: unknown;
  sourceReviewWorkspaceFile: string;
  generatedAt?: string;
}): ConfiguredEdinetFidelityPlan {
  const workspace = object(input.reviewWorkspace, "reviewWorkspace");
  const verified = verifyWorkspace(workspace, input.registry);
  const sourceReviewWorkspaceFile = localBasename(
    input.sourceReviewWorkspaceFile,
    "sourceReviewWorkspaceFile",
  );
  if (!sourceReviewWorkspaceFile.endsWith(".json")) {
    throw new Error("sourceReviewWorkspaceFile must be JSON");
  }
  const documents = parseDocuments(workspace, verified.boundary);
  const generatedAt = input.generatedAt
    ? timestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: verified.registryHash,
    issuer: {
      issuerKey: verified.boundary.issuerKey,
      name: verified.boundary.name,
      edinetCode: verified.boundary.edinetCode,
      secCode: verified.boundary.secCode,
      boundaryHash: verified.boundary.boundaryHash,
    },
    sourceReviewWorkspaceFile,
    sourceReviewWorkspaceHash: verified.workspaceHash,
    generatedAt,
    documentPairCount: documents.length,
    anchorCount: 0 as const,
    anchorInputStatus: "pending_human_input" as const,
    extractionStatus: "not_started" as const,
    reviewStatus: "pending_source_fidelity_review" as const,
    documents,
    globalBlockers: [
      "human_anchor_input_required",
      "structured_and_pdf_text_extraction_not_started",
      "exact_anchor_comparison_not_executed",
      "official_pdf_visual_review_not_completed",
      "content_equivalence_not_decided",
      "financial_internal_control_audit_impact_not_decided",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    automaticExtractionAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, fidelityPlanHash: digest(base) };
}

export function renderConfiguredEdinetFidelityPlan(
  plan: ConfiguredEdinetFidelityPlan,
): string {
  const lines = [
    `# ${plan.issuer.name} EDINET configured source-fidelity plan`,
    "",
    `- generatedAt: ${plan.generatedAt}`,
    `- issuerKey: ${plan.issuer.issuerKey}`,
    `- EDINET/security code: ${plan.issuer.edinetCode}/${plan.issuer.secCode}`,
    `- registryHash: ${plan.registryHash}`,
    `- boundaryHash: ${plan.issuer.boundaryHash}`,
    `- sourceReviewWorkspaceFile: ${plan.sourceReviewWorkspaceFile}`,
    `- sourceReviewWorkspaceHash: ${plan.sourceReviewWorkspaceHash}`,
    `- documentPairCount: ${plan.documentPairCount}`,
    `- anchorCount: ${plan.anchorCount}`,
    `- anchorInputStatus: ${plan.anchorInputStatus}`,
    `- extractionStatus: ${plan.extractionStatus}`,
    `- reviewStatus: ${plan.reviewStatus}`,
    `- fidelityPlanHash: ${plan.fidelityPlanHash}`,
    "- automaticExtractionAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "This plan pairs verified type 1 and type 2 source files. It does not extract text or decide equivalence.",
    "",
  ];
  for (const document of plan.documents) {
    lines.push(
      `## ${document.docID} — ${document.description}`,
      "",
      `- pairId: ${document.pairId}`,
      `- pairHash: ${document.pairHash}`,
      `- parentDocID: ${document.parentDocID ?? "none"}`,
      `- chainRootDocID: ${document.chainRootDocID}`,
      `- submitDateTime: ${document.submitDateTime}`,
      `- structured: ${document.structuredSource.binaryFile}`,
      `  - sha256: ${document.structuredSource.binarySha256}`,
      `  - bytes: ${document.structuredSource.binaryByteLength}`,
      `- official PDF: ${document.officialPdf.binaryFile}`,
      `  - sha256: ${document.officialPdf.binarySha256}`,
      `  - bytes: ${document.officialPdf.binaryByteLength}`,
      `- anchors: ${document.anchorInput.anchorCount}/${document.anchorInput.minimumAnchorCount} required, max ${document.anchorInput.maximumAnchorCount}`,
      "- extraction: not_started",
      "- contentEquivalent/accounting/internalControl/audit/materiality/direction: unknown_pending_human_review",
      "",
      "Blockers:",
    );
    for (const blocker of document.blockers) lines.push(`- [ ] ${blocker}`);
    lines.push("");
  }
  lines.push(
    "## Required next step",
    "",
    "- Extract visible structured text from type 1 without changing the source hash.",
    "- Extract PDF layout text locally and keep the official PDF hash fixed.",
    "- Select bounded human-review anchors with source section, line, text hash, and reason.",
    "- Compare exact normalized anchors, then visually confirm the official PDF page.",
    "- Record equivalence and impact decisions separately; do not infer materiality or direction automatically.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
