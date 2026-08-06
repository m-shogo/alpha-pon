import { createHash } from "node:crypto";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
  type EdinetIssuerBoundary,
  type EdinetIssuerRegistry,
} from "./edinet-issuer-boundary.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetVerifiedFile = {
  binaryFile: string;
  metadataFile: string;
  binarySha256: string;
  binaryByteLength: number;
  metadataSha256: string;
  metadataByteLength: number;
};

export type ConfiguredEdinetReviewAcquisition = {
  documentType: "1" | "2";
  format: "zip" | "pdf";
  reason: "configured_structured_review" | "configured_official_pdf_review";
  binaryFile: string;
  metadataFile: string;
  binarySha256: string;
  binaryByteLength: number;
  metadataSha256: string;
  metadataByteLength: number;
  retrievedAt: string;
};

export type ConfiguredEdinetReviewDocument = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  submitDateTime: string;
  description: string;
  reviewPriority: "high" | "normal";
  reviewReasons: string[];
  acquisitions: ConfiguredEdinetReviewAcquisition[];
  structuredDocumentVerified: true;
  officialPdfVerified: true;
  reviewStatus: "pending_human_review";
  blockers: string[];
};

export type ConfiguredEdinetReviewGroup = {
  groupId: string;
  chainRootDocID: string;
  documents: ConfiguredEdinetReviewDocument[];
  reviewChecklist: string[];
};

export type ConfiguredEdinetReviewWorkspace = {
  schemaVersion: 2;
  source: "edinet";
  registryHash: string;
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  sourceReviewPlanFile: string;
  sourceReviewPlanHash: string;
  sourceAcquisitionPlanFile: string;
  sourceAcquisitionPlanHash: string;
  acquisitionManifestFile: string;
  acquisitionManifestHash: string;
  generatedAt: string;
  acquisitionComplete: true;
  fileIntegrityVerified: true;
  acquisitionCount: number;
  documentCount: number;
  groupCount: number;
  structuredDocumentCount: number;
  officialPdfCount: number;
  reviewStatus: "pending_human_review";
  groups: ConfiguredEdinetReviewGroup[];
  globalBlockers: string[];
  foundationPreviewEligible: false;
  appendAuthorized: false;
  workspaceHash: string;
};

type ReviewPlanDocument = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  submitDateTime: string;
  description: string;
  reviewPriority: "high" | "normal";
  reviewReasons: string[];
};

type ManifestAcquisition = {
  docID: string;
  documentType: "1" | "2";
  format: "zip" | "pdf";
  reason: "configured_structured_review" | "configured_official_pdf_review";
  binaryFile: string;
  metadataFile: string;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
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
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function basename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function strings(value: unknown, field: string): string[] {
  const values = array(value, field).map((item, index) => required(item, `${field}[${index}]`));
  if (new Set(values).size !== values.length) throw new Error(`${field} contains duplicates`);
  return [...values].sort();
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

function verifyHash(record: JsonObject, field: string, label: string): string {
  const expected = hash(record[field], `${label}.${field}`);
  const { [field]: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error(`${label}.${field} mismatch`);
  return expected;
}

function assertIssuer(
  registry: EdinetIssuerRegistry,
  record: JsonObject,
  field: string,
): EdinetIssuerBoundary {
  if (text(record.registryHash) !== registry.registryHash) {
    throw new Error(`${field}.registryHash does not match configured registry`);
  }
  const issuer = object(record.issuer, `${field}.issuer`);
  const boundary = resolveEdinetIssuerBoundary(
    registry,
    required(issuer.issuerKey, `${field}.issuer.issuerKey`),
  );
  if (
    text(issuer.name) !== boundary.name
    || text(issuer.edinetCode).toUpperCase() !== boundary.edinetCode
    || text(issuer.secCode) !== boundary.secCode
    || text(issuer.boundaryHash) !== boundary.boundaryHash
  ) {
    throw new Error(`${field} issuer identity does not match configured boundary`);
  }
  return boundary;
}

function parseReviewPlan(
  value: unknown,
  registry: EdinetIssuerRegistry,
): {
  record: JsonObject;
  planHash: string;
  boundary: EdinetIssuerBoundary;
  documents: Map<string, ReviewPlanDocument>;
} {
  const record = object(value, "reviewPlan");
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("reviewPlan schema/source is unsupported");
  }
  if (
    record.reviewStatus !== "inventory_review_planned"
    || record.acquisitionAuthorized !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("reviewPlan safety boundary is invalid");
  }
  const planHash = verifyHash(record, "reviewPlanHash", "reviewPlan");
  const boundary = assertIssuer(registry, record, "reviewPlan");
  const documents = new Map<string, ReviewPlanDocument>();
  for (const [groupIndex, groupValue] of array(record.groups, "reviewPlan.groups").entries()) {
    const group = object(groupValue, `reviewPlan.groups[${groupIndex}]`);
    const groupRoot = docID(group.chainRootDocID, `reviewPlan.groups[${groupIndex}].chainRootDocID`);
    for (const [documentIndex, documentValue] of array(
      group.documents,
      `reviewPlan.groups[${groupIndex}].documents`,
    ).entries()) {
      const document = object(
        documentValue,
        `reviewPlan.groups[${groupIndex}].documents[${documentIndex}]`,
      );
      const id = docID(document.docID, `reviewPlan document ${documentIndex}.docID`);
      if (documents.has(id)) throw new Error(`reviewPlan has duplicate document ${id}`);
      if (
        document.reviewStatus !== "pending_human_review"
        || document.retrievableByLegalStatus !== true
        || document.structuredDocumentPlanned !== true
        || document.officialPdfPlanned !== true
      ) {
        throw new Error(`reviewPlan document ${id} is not acquisition-reviewable`);
      }
      const types = strings(document.plannedDocumentTypes, `reviewPlan document ${id}.plannedDocumentTypes`);
      if (types.join(",") !== "1,2") {
        throw new Error(`reviewPlan document ${id} must contain only document types 1 and 2`);
      }
      const parentText = text(document.parentDocID);
      if (parentText && !DOC_ID_RE.test(parentText)) {
        throw new Error(`reviewPlan document ${id} has invalid parentDocID`);
      }
      const root = docID(document.chainRootDocID, `reviewPlan document ${id}.chainRootDocID`);
      if (root !== groupRoot) throw new Error(`reviewPlan document ${id} chain root disagrees with group`);
      const priority = required(document.reviewPriority, `reviewPlan document ${id}.reviewPriority`);
      if (priority !== "high" && priority !== "normal") {
        throw new Error(`reviewPlan document ${id} reviewPriority is invalid`);
      }
      documents.set(id, {
        docID: id,
        parentDocID: parentText || null,
        chainRootDocID: root,
        submitDateTime: timestamp(document.submitDateTime, `reviewPlan document ${id}.submitDateTime`),
        description: required(document.description, `reviewPlan document ${id}.description`),
        reviewPriority: priority,
        reviewReasons: strings(document.reviewReasons, `reviewPlan document ${id}.reviewReasons`),
      });
    }
  }
  if (documents.size === 0) throw new Error("reviewPlan has no documents");
  return { record, planHash, boundary, documents };
}

function parseAcquisitionPlan(
  value: unknown,
  registry: EdinetIssuerRegistry,
  reviewPlanHash: string,
): { record: JsonObject; planHash: string } {
  const record = object(value, "acquisitionPlan");
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("acquisitionPlan schema/source is unsupported");
  }
  if (
    record.executionPolicy !== "explicit_local_command_only"
    || record.storageBoundary !== "local_only"
    || record.automaticAcquisitionAuthorized !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("acquisitionPlan safety boundary is invalid");
  }
  const planHash = verifyHash(record, "planHash", "acquisitionPlan");
  assertIssuer(registry, record, "acquisitionPlan");
  if (text(record.sourceReviewPlanHash) !== reviewPlanHash) {
    throw new Error("acquisitionPlan sourceReviewPlanHash mismatch");
  }
  const tasks = array(record.tasks, "acquisitionPlan.tasks");
  if (nonNegativeInteger(record.taskCount, "acquisitionPlan.taskCount") !== tasks.length || tasks.length === 0) {
    throw new Error("acquisitionPlan taskCount mismatch");
  }
  return { record, planHash };
}

function parseManifest(
  value: unknown,
  registry: EdinetIssuerRegistry,
  reviewPlanHash: string,
  acquisitionPlanHash: string,
): { record: JsonObject; manifestHash: string; acquisitions: ManifestAcquisition[] } {
  const record = object(value, "acquisitionManifest");
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("acquisitionManifest schema/source is unsupported");
  }
  if (
    record.complete !== true
    || record.canonicalManifestWritten !== true
    || record.executionMode !== "explicit_local_command"
    || record.storageBoundary !== "local_only"
    || record.reviewStatus !== "pending_human_review"
    || record.appendAuthorized !== false
  ) {
    throw new Error("acquisitionManifest safety/completeness boundary is invalid");
  }
  const manifestHash = verifyHash(record, "manifestHash", "acquisitionManifest");
  assertIssuer(registry, record, "acquisitionManifest");
  if (text(record.sourceReviewPlanHash) !== reviewPlanHash) {
    throw new Error("acquisitionManifest sourceReviewPlanHash mismatch");
  }
  if (text(record.acquisitionPlanHash) !== acquisitionPlanHash) {
    throw new Error("acquisitionManifest acquisitionPlanHash mismatch");
  }
  if (array(record.failed, "acquisitionManifest.failed").length > 0) {
    throw new Error("acquisitionManifest.failed must be empty");
  }
  const totalTasks = nonNegativeInteger(record.totalTasks, "acquisitionManifest.totalTasks");
  const acquisitions = array(record.succeeded, "acquisitionManifest.succeeded").map((value, index) => {
    const success = object(value, `acquisitionManifest.succeeded[${index}]`);
    const task = object(success.task, `acquisitionManifest.succeeded[${index}].task`);
    const type = required(task.documentType, `acquisitionManifest.succeeded[${index}].task.documentType`);
    if (type !== "1" && type !== "2") throw new Error(`manifest contains unsupported document type ${type}`);
    const format = required(task.format, `acquisitionManifest.succeeded[${index}].task.format`);
    if ((type === "1" && format !== "zip") || (type === "2" && format !== "pdf")) {
      throw new Error(`manifest task ${index} type/format mismatch`);
    }
    const reason = required(task.reason, `acquisitionManifest.succeeded[${index}].task.reason`);
    if (
      reason !== "configured_structured_review"
      && reason !== "configured_official_pdf_review"
    ) {
      throw new Error(`manifest task ${index} reason is invalid`);
    }
    if (task.parentOutsidePlan !== false) throw new Error(`manifest task ${index} parentOutsidePlan must be false`);
    const id = docID(task.docID, `acquisitionManifest.succeeded[${index}].task.docID`);
    if (text(task.sourceDocID) !== id) throw new Error(`manifest task ${id} sourceDocID mismatch`);
    return {
      docID: id,
      documentType: type,
      format,
      reason,
      binaryFile: basename(success.binaryFile, `acquisitionManifest.succeeded[${index}].binaryFile`),
      metadataFile: basename(success.metadataFile, `acquisitionManifest.succeeded[${index}].metadataFile`),
      sha256: hash(success.sha256, `acquisitionManifest.succeeded[${index}].sha256`),
      byteLength: positiveInteger(success.byteLength, `acquisitionManifest.succeeded[${index}].byteLength`),
      retrievedAt: timestamp(success.retrievedAt, `acquisitionManifest.succeeded[${index}].retrievedAt`),
    } as ManifestAcquisition;
  });
  if (totalTasks !== acquisitions.length || acquisitions.length === 0) {
    throw new Error("acquisitionManifest totalTasks mismatch");
  }
  const identities = acquisitions.map(item => `${item.docID}|${item.documentType}`);
  if (new Set(identities).size !== identities.length) {
    throw new Error("acquisitionManifest contains duplicate docID/type");
  }
  return { record, manifestHash, acquisitions };
}

function parseVerification(
  values: ConfiguredEdinetVerifiedFile[],
  acquisitions: ManifestAcquisition[],
): Map<string, ConfiguredEdinetVerifiedFile> {
  const expected = new Map(acquisitions.map(item => [item.binaryFile, item]));
  const verified = new Map<string, ConfiguredEdinetVerifiedFile>();
  for (const [index, value] of values.entries()) {
    const binaryFile = basename(value.binaryFile, `verifiedFiles[${index}].binaryFile`);
    if (verified.has(binaryFile)) throw new Error(`verifiedFiles contains duplicate ${binaryFile}`);
    const acquisition = expected.get(binaryFile);
    if (!acquisition) throw new Error(`verifiedFiles contains unexpected ${binaryFile}`);
    if (basename(value.metadataFile, `verifiedFiles[${index}].metadataFile`) !== acquisition.metadataFile) {
      throw new Error(`verifiedFiles metadata file mismatch for ${binaryFile}`);
    }
    if (
      hash(value.binarySha256, `verifiedFiles[${index}].binarySha256`) !== acquisition.sha256
      || positiveInteger(value.binaryByteLength, `verifiedFiles[${index}].binaryByteLength`) !== acquisition.byteLength
    ) {
      throw new Error(`verifiedFiles binary integrity mismatch for ${binaryFile}`);
    }
    hash(value.metadataSha256, `verifiedFiles[${index}].metadataSha256`);
    positiveInteger(value.metadataByteLength, `verifiedFiles[${index}].metadataByteLength`);
    verified.set(binaryFile, value);
  }
  if (verified.size !== acquisitions.length) {
    throw new Error("verifiedFiles does not cover every acquired binary");
  }
  return verified;
}

function documentBlockers(document: ReviewPlanDocument): string[] {
  const blockers = [
    "official_pdf_visual_review_required",
    "structured_document_semantic_review_required",
    "confirmed_fact_classification_required",
    "previously_known_fact_classification_required",
    "assumption_and_opinion_separation_required",
    "security_master_entity_resolution_required",
    "pit_timestamp_confirmation_required",
    "normalized_section_hashes_required",
  ];
  if (document.parentDocID) blockers.push("revision_relation_confirmation_required");
  return blockers.sort();
}

function reviewChecklist(documents: ConfiguredEdinetReviewDocument[]): string[] {
  const checklist = [
    "Open every type 1 ZIP and type 2 PDF after matching its recorded SHA-256.",
    "Confirm the PDF docID, filing title, issuer identity, and publication time.",
    "Separate confirmed facts, previously known facts, assumptions, and opinion.",
    "Compare structured text with the official PDF before recording exact amounts or wording.",
    "Resolve Security Master entity IDs and point-in-time timestamps before Foundation preview.",
  ];
  if (documents.some(document => document.parentDocID)) {
    checklist.push(
      "Compare parent and child filings and confirm revision kind, prior record IDs, and supersession strength.",
    );
  }
  return checklist;
}

export function buildConfiguredEdinetReviewWorkspace(input: {
  registry: unknown;
  reviewPlan: unknown;
  acquisitionPlan: unknown;
  acquisitionManifest: unknown;
  verifiedFiles: ConfiguredEdinetVerifiedFile[];
  sourceReviewPlanFile: string;
  sourceAcquisitionPlanFile: string;
  acquisitionManifestFile: string;
  generatedAt?: string;
}): ConfiguredEdinetReviewWorkspace {
  const registry = buildEdinetIssuerRegistry(input.registry);
  const review = parseReviewPlan(input.reviewPlan, registry);
  const acquisitionPlan = parseAcquisitionPlan(input.acquisitionPlan, registry, review.planHash);
  const manifest = parseManifest(
    input.acquisitionManifest,
    registry,
    review.planHash,
    acquisitionPlan.planHash,
  );
  const boundary = review.boundary;
  const acquisitionPlanIssuer = object(acquisitionPlan.record.issuer, "acquisitionPlan.issuer");
  const manifestIssuer = object(manifest.record.issuer, "acquisitionManifest.issuer");
  if (
    text(acquisitionPlanIssuer.boundaryHash) !== boundary.boundaryHash
    || text(manifestIssuer.boundaryHash) !== boundary.boundaryHash
  ) {
    throw new Error("configured source boundaries disagree");
  }
  if (text(acquisitionPlan.record.sourceReviewPlanFile) !== basename(input.sourceReviewPlanFile, "sourceReviewPlanFile")) {
    throw new Error("acquisitionPlan sourceReviewPlanFile mismatch");
  }
  const verified = parseVerification(input.verifiedFiles, manifest.acquisitions);

  const acquisitionsByDoc = new Map<string, ConfiguredEdinetReviewAcquisition[]>();
  for (const acquisition of manifest.acquisitions) {
    const document = review.documents.get(acquisition.docID);
    if (!document) throw new Error(`manifest document ${acquisition.docID} is absent from review plan`);
    const file = verified.get(acquisition.binaryFile)!;
    const current = acquisitionsByDoc.get(acquisition.docID) ?? [];
    current.push({
      documentType: acquisition.documentType,
      format: acquisition.format,
      reason: acquisition.reason,
      binaryFile: acquisition.binaryFile,
      metadataFile: acquisition.metadataFile,
      binarySha256: acquisition.sha256,
      binaryByteLength: acquisition.byteLength,
      metadataSha256: file.metadataSha256,
      metadataByteLength: file.metadataByteLength,
      retrievedAt: acquisition.retrievedAt,
    });
    acquisitionsByDoc.set(acquisition.docID, current);
  }
  if (acquisitionsByDoc.size !== review.documents.size) {
    throw new Error("manifest/review-plan document coverage mismatch");
  }

  const documents = [...review.documents.values()].map(document => {
    const acquisitions = (acquisitionsByDoc.get(document.docID) ?? []).sort((left, right) =>
      left.documentType.localeCompare(right.documentType),
    );
    if (acquisitions.map(item => item.documentType).join(",") !== "1,2") {
      throw new Error(`document ${document.docID} does not have exactly type 1 and type 2 acquisitions`);
    }
    return {
      ...document,
      acquisitions,
      structuredDocumentVerified: true as const,
      officialPdfVerified: true as const,
      reviewStatus: "pending_human_review" as const,
      blockers: documentBlockers(document),
    };
  }).sort((left, right) =>
    `${left.chainRootDocID}|${left.submitDateTime}|${left.docID}`.localeCompare(
      `${right.chainRootDocID}|${right.submitDateTime}|${right.docID}`,
    ),
  );

  const byRoot = new Map<string, ConfiguredEdinetReviewDocument[]>();
  for (const document of documents) {
    const current = byRoot.get(document.chainRootDocID) ?? [];
    current.push(document);
    byRoot.set(document.chainRootDocID, current);
  }
  const groups = [...byRoot.entries()].map(([chainRootDocID, groupDocuments]) => ({
    groupId: `edinet:${boundary.issuerKey}:${chainRootDocID}:review-v2`,
    chainRootDocID,
    documents: groupDocuments,
    reviewChecklist: reviewChecklist(groupDocuments),
  })).sort((left, right) => left.chainRootDocID.localeCompare(right.chainRootDocID));

  const sourceReviewPlanFile = basename(input.sourceReviewPlanFile, "sourceReviewPlanFile");
  const sourceAcquisitionPlanFile = basename(input.sourceAcquisitionPlanFile, "sourceAcquisitionPlanFile");
  const acquisitionManifestFile = basename(input.acquisitionManifestFile, "acquisitionManifestFile");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 2 as const,
    source: "edinet" as const,
    registryHash: registry.registryHash,
    issuer: {
      issuerKey: boundary.issuerKey,
      name: boundary.name,
      edinetCode: boundary.edinetCode,
      secCode: boundary.secCode,
      boundaryHash: boundary.boundaryHash,
    },
    sourceReviewPlanFile,
    sourceReviewPlanHash: review.planHash,
    sourceAcquisitionPlanFile,
    sourceAcquisitionPlanHash: acquisitionPlan.planHash,
    acquisitionManifestFile,
    acquisitionManifestHash: manifest.manifestHash,
    generatedAt,
    acquisitionComplete: true as const,
    fileIntegrityVerified: true as const,
    acquisitionCount: manifest.acquisitions.length,
    documentCount: documents.length,
    groupCount: groups.length,
    structuredDocumentCount: documents.length,
    officialPdfCount: documents.length,
    reviewStatus: "pending_human_review" as const,
    groups,
    globalBlockers: [
      "human_document_review_not_completed",
      "official_pdf_semantic_equivalence_not_confirmed",
      "exact_amounts_and_units_not_confirmed",
      "accounting_internal_control_audit_impact_not_confirmed",
      "security_master_and_pit_mapping_not_confirmed",
      "foundation_preview_not_generated",
      "governed_store_append_not_authorized",
    ].sort(),
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, workspaceHash: digest(base) };
}

export function renderConfiguredEdinetReviewWorkspace(
  workspace: ConfiguredEdinetReviewWorkspace,
): string {
  const lines = [
    `# ${workspace.issuer.name} EDINET configured review workspace v2`,
    "",
    `- generatedAt: ${workspace.generatedAt}`,
    `- issuerKey: ${workspace.issuer.issuerKey}`,
    `- edinetCode/secCode: ${workspace.issuer.edinetCode}/${workspace.issuer.secCode}`,
    `- registryHash: ${workspace.registryHash}`,
    `- boundaryHash: ${workspace.issuer.boundaryHash}`,
    `- sourceReviewPlanFile/hash: ${workspace.sourceReviewPlanFile} / ${workspace.sourceReviewPlanHash}`,
    `- sourceAcquisitionPlanFile/hash: ${workspace.sourceAcquisitionPlanFile} / ${workspace.sourceAcquisitionPlanHash}`,
    `- acquisitionManifestFile/hash: ${workspace.acquisitionManifestFile} / ${workspace.acquisitionManifestHash}`,
    `- documents/groups/acquisitions: ${workspace.documentCount}/${workspace.groupCount}/${workspace.acquisitionCount}`,
    `- type 1/type 2 verified: ${workspace.structuredDocumentCount}/${workspace.officialPdfCount}`,
    `- workspaceHash: ${workspace.workspaceHash}`,
    "- acquisitionComplete: true",
    "- fileIntegrityVerified: true",
    "- reviewStatus: pending_human_review",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "This v2 workspace is independent from the Sanrio-specific v1 schema and does not authorize fact promotion.",
    "",
  ];
  for (const group of workspace.groups) {
    lines.push(`## ${group.groupId}`, "");
    for (const document of group.documents) {
      lines.push(
        `### ${document.docID} — ${document.description}`,
        "",
        `- parentDocID: ${document.parentDocID ?? "none"}`,
        `- chainRootDocID: ${document.chainRootDocID}`,
        `- submitDateTime: ${document.submitDateTime}`,
        `- reviewPriority: ${document.reviewPriority}`,
        `- reviewReasons: ${document.reviewReasons.join(", ") || "(none)"}`,
      );
      for (const acquisition of document.acquisitions) {
        lines.push(
          `- type ${acquisition.documentType} ${acquisition.format}: ${acquisition.binaryFile}`,
          `  - binarySha256: ${acquisition.binarySha256}`,
          `  - binaryBytes: ${acquisition.binaryByteLength}`,
          `  - metadataFile: ${acquisition.metadataFile}`,
          `  - metadataSha256: ${acquisition.metadataSha256}`,
          `  - metadataBytes: ${acquisition.metadataByteLength}`,
          `  - retrievedAt: ${acquisition.retrievedAt}`,
        );
      }
      lines.push("", "Blockers:");
      for (const blocker of document.blockers) lines.push(`- [ ] ${blocker}`);
      lines.push("");
    }
    lines.push("Group checklist:");
    for (const item of group.reviewChecklist) lines.push(`- [ ] ${item}`);
    lines.push("");
  }
  lines.push(
    "## Promotion boundary",
    "",
    "- Verified files are still unreviewed source material.",
    "- Official PDF visual review and exact source comparison remain mandatory.",
    "- This workspace cannot append Evidence, Foundation, recommendations, BUY, or orders.",
    "- foundationPreviewEligible and appendAuthorized remain false.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
