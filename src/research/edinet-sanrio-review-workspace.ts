import { createHash } from "node:crypto";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";

const SANRIO_EDINET_CODE = "E02655";
const SANRIO_SEC_CODE = "81360";

type UnknownRecord = Record<string, unknown>;

type AcquisitionView = {
  docID: string;
  documentType: "1" | "2" | "3" | "4" | "5";
  format: "zip" | "pdf";
  reason: string;
  sourceDocID: string;
  parentOutsideInventory: boolean;
  binaryFile: string;
  metadataFile: string;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
};

type InventoryDocumentView = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  submitDateTime: string;
  description: string;
  revisionReviewHint: string;
};

export type SanrioEdinetReviewArtifact = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  submitDateTime: string | null;
  description: string;
  revisionReviewHint: string;
  parentOutsideInventory: boolean;
  acquisitions: Array<{
    documentType: AcquisitionView["documentType"];
    format: AcquisitionView["format"];
    reason: string;
    binaryFile: string;
    metadataFile: string;
    sha256: string;
    byteLength: number;
    retrievedAt: string;
  }>;
  reviewStatus: "pending_human_review";
  blockers: string[];
};

export type SanrioEdinetReviewGroup = {
  groupId: string;
  chainRootDocID: string;
  documents: SanrioEdinetReviewArtifact[];
  reviewChecklist: string[];
};

export type SanrioEdinetReviewWorkspace = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: typeof SANRIO_EDINET_CODE;
    secCode: typeof SANRIO_SEC_CODE;
  };
  sourceInventory: string;
  acquisitionManifest: string;
  generatedAt: string;
  retrievalComplete: true;
  acquisitionCount: number;
  documentCount: number;
  reviewStatus: "pending_human_review";
  groups: SanrioEdinetReviewGroup[];
  globalBlockers: string[];
  appendAuthorized: false;
  workspaceHash: string;
};

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requireString(value: unknown, field: string): string {
  const result = asString(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(result)) {
    throw new Error(`${field} is not a valid EDINET docID`);
  }
  return result;
}

function requireFileName(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function requireTimestamp(value: unknown, field: string): string {
  const result = requireString(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function requireIssuer(value: unknown, field: string): void {
  const issuer = asRecord(value, field);
  if (asString(issuer.edinetCode) !== SANRIO_EDINET_CODE) {
    throw new Error(`${field}.edinetCode is not Sanrio`);
  }
  if (asString(issuer.secCode) !== SANRIO_SEC_CODE) {
    throw new Error(`${field}.secCode is not Sanrio`);
  }
}

function parseInventory(value: unknown): {
  sourceInventory: string;
  documents: Map<string, InventoryDocumentView>;
} {
  const inventory = asRecord(value, "inventory");
  if (inventory.schemaVersion !== 1 || inventory.source !== "edinet") {
    throw new Error("inventory schema/source is unsupported");
  }
  if (inventory.completeness !== "complete") throw new Error("inventory must be complete");
  if (inventory.appendAuthorized !== false) {
    throw new Error("inventory.appendAuthorized must be false");
  }
  if (asArray(inventory.failedDates, "inventory.failedDates").length > 0) {
    throw new Error("inventory.failedDates must be empty");
  }
  requireIssuer(inventory.issuer, "inventory.issuer");

  const candidateDescriptions = new Map<string, { description: string; submitDateTime: string }>();
  for (const [index, rawCandidate] of asArray(inventory.candidates, "inventory.candidates").entries()) {
    const candidate = asRecord(rawCandidate, `inventory.candidates[${index}]`);
    const doc = asRecord(candidate.doc, `inventory.candidates[${index}].doc`);
    const docID = requireDocID(doc.docID, `inventory.candidates[${index}].doc.docID`);
    candidateDescriptions.set(docID, {
      description: asString(doc.docDescription) || "(description unavailable)",
      submitDateTime: asString(doc.submitDateTime),
    });
  }

  const lineage = asRecord(inventory.lineage, "inventory.lineage");
  if (lineage.hasBlockingIssues === true) {
    throw new Error("inventory lineage has blocking issues");
  }

  const documents = new Map<string, InventoryDocumentView>();
  for (const [index, rawNode] of asArray(lineage.nodes, "inventory.lineage.nodes").entries()) {
    const node = asRecord(rawNode, `inventory.lineage.nodes[${index}]`);
    const docID = requireDocID(node.docID, `inventory.lineage.nodes[${index}].docID`);
    const parentDocID = asString(node.parentDocID) || null;
    if (parentDocID && !/^[A-Za-z0-9_-]{4,64}$/.test(parentDocID)) {
      throw new Error(`inventory.lineage.nodes[${index}].parentDocID is invalid`);
    }
    const chainRootDocID = requireDocID(
      node.chainRootDocID,
      `inventory.lineage.nodes[${index}].chainRootDocID`,
    );
    const candidate = candidateDescriptions.get(docID);
    documents.set(docID, {
      docID,
      parentDocID,
      chainRootDocID,
      submitDateTime: candidate?.submitDateTime || asString(node.submitDateTime),
      description: candidate?.description || asString(node.docDescription) || "(description unavailable)",
      revisionReviewHint: asString(node.revisionReviewHint) || "unknown_review_hint",
    });
  }

  if (documents.size === 0) throw new Error("inventory has no lineage documents");
  return { sourceInventory: "", documents };
}

function parseAcquisitionManifest(value: unknown): {
  sourceInventory: string;
  outputDirectory: string;
  generatedAt: string;
  acquisitions: AcquisitionView[];
} {
  const manifest = asRecord(value, "acquisitionManifest");
  if (manifest.schemaVersion !== 1 || manifest.source !== "edinet") {
    throw new Error("acquisition manifest schema/source is unsupported");
  }
  if (manifest.complete !== true) throw new Error("acquisition manifest must be complete");
  if (manifest.appendAuthorized !== false) {
    throw new Error("acquisitionManifest.appendAuthorized must be false");
  }
  if (manifest.storageBoundary !== "local_only") {
    throw new Error("acquisitionManifest.storageBoundary must be local_only");
  }
  requireIssuer(manifest.issuer, "acquisitionManifest.issuer");
  if (asArray(manifest.failed, "acquisitionManifest.failed").length > 0) {
    throw new Error("acquisitionManifest.failed must be empty");
  }

  const sourceInventory = requireFileName(
    manifest.sourceInventory,
    "acquisitionManifest.sourceInventory",
  );
  const outputDirectory = requireFileName(
    manifest.outputDirectory,
    "acquisitionManifest.outputDirectory",
  );
  const generatedAt = requireTimestamp(
    manifest.generatedAt,
    "acquisitionManifest.generatedAt",
  );
  const totalTasks = requirePositiveInteger(
    manifest.totalTasks,
    "acquisitionManifest.totalTasks",
  );

  const acquisitions: AcquisitionView[] = [];
  const identities = new Set<string>();
  for (const [index, rawSuccess] of asArray(
    manifest.succeeded,
    "acquisitionManifest.succeeded",
  ).entries()) {
    const success = asRecord(rawSuccess, `acquisitionManifest.succeeded[${index}]`);
    const task = asRecord(success.task, `acquisitionManifest.succeeded[${index}].task`);
    const docID = requireDocID(task.docID, `acquisitionManifest.succeeded[${index}].task.docID`);
    const documentType = requireString(
      task.documentType,
      `acquisitionManifest.succeeded[${index}].task.documentType`,
    );
    if (!/^[1-5]$/.test(documentType)) {
      throw new Error(`acquisitionManifest.succeeded[${index}].task.documentType is invalid`);
    }
    const format = requireString(
      task.format,
      `acquisitionManifest.succeeded[${index}].task.format`,
    );
    if (format !== "zip" && format !== "pdf") {
      throw new Error(`acquisitionManifest.succeeded[${index}].task.format is invalid`);
    }
    const identity = `${docID}|${documentType}`;
    if (identities.has(identity)) throw new Error(`duplicate acquisition ${identity}`);
    identities.add(identity);

    const retrievedAt = requireTimestamp(
      success.retrievedAt,
      `acquisitionManifest.succeeded[${index}].retrievedAt`,
    );
    if (compareExplicitIso8601Instants(
      retrievedAt,
      generatedAt,
      `acquisitionManifest.succeeded[${index}].retrievedAt`,
      "acquisitionManifest.generatedAt",
    ) > 0) {
      throw new Error(
        `acquisitionManifest.succeeded[${index}].retrievedAt must not be after acquisitionManifest.generatedAt`,
      );
    }

    acquisitions.push({
      docID,
      documentType: documentType as AcquisitionView["documentType"],
      format,
      reason: requireString(task.reason, `acquisitionManifest.succeeded[${index}].task.reason`),
      sourceDocID: requireDocID(
        task.sourceDocID,
        `acquisitionManifest.succeeded[${index}].task.sourceDocID`,
      ),
      parentOutsideInventory: task.parentOutsideInventory === true,
      binaryFile: requireFileName(
        success.binaryFile,
        `acquisitionManifest.succeeded[${index}].binaryFile`,
      ),
      metadataFile: requireFileName(
        success.metadataFile,
        `acquisitionManifest.succeeded[${index}].metadataFile`,
      ),
      sha256: requireHash(success.sha256, `acquisitionManifest.succeeded[${index}].sha256`),
      byteLength: requirePositiveInteger(
        success.byteLength,
        `acquisitionManifest.succeeded[${index}].byteLength`,
      ),
      retrievedAt,
    });
  }

  if (acquisitions.length !== totalTasks) {
    throw new Error("acquisitionManifest.totalTasks does not match succeeded length");
  }

  acquisitions.sort((a, b) =>
    `${a.docID}|${a.documentType}`.localeCompare(`${b.docID}|${b.documentType}`),
  );
  return { sourceInventory, outputDirectory, generatedAt, acquisitions };
}

function artifactBlockers(document: InventoryDocumentView | null, externalParent: boolean): string[] {
  const blockers = [
    "human_document_review_required",
    "semantic_summary_required",
    "section_hashes_required",
    "security_master_entity_resolution_required",
    "published_effective_executable_times_confirmation_required",
  ];
  if (externalParent) blockers.push("external_parent_metadata_review_required");
  if (document?.parentDocID) blockers.push("revision_relation_confirmation_required");
  return blockers.sort();
}

function reviewChecklist(documents: SanrioEdinetReviewArtifact[]): string[] {
  const checklist = [
    "Confirm every PDF/ZIP opens and matches its EDINET docID and SHA-256 metadata.",
    "Read the filing and write a human-authored factual summary without investment inference.",
    "Separate newly disclosed facts, previously known facts, assumptions, and opinion.",
    "Confirm publishedAt, effectiveFrom, observedAt, retrievedAt, and firstExecutableAt.",
    "Resolve the issuer and listed security through the governed Security Master.",
    "Define normalized sections and calculate title/content hashes before Foundation preview.",
  ];
  if (documents.some(document => document.parentDocID || document.parentOutsideInventory)) {
    checklist.push(
      "Compare parent and child documents and confirm correction scope, supersession strength, and prior record links.",
    );
  }
  return checklist;
}

function hashWorkspace(value: Omit<SanrioEdinetReviewWorkspace, "workspaceHash">): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildSanrioEdinetReviewWorkspace(input: {
  inventory: unknown;
  acquisitionManifest: unknown;
  acquisitionManifestFile: string;
  generatedAt?: string;
}): SanrioEdinetReviewWorkspace {
  const inventory = parseInventory(input.inventory);
  const acquisition = parseAcquisitionManifest(input.acquisitionManifest);
  const manifestFile = requireFileName(input.acquisitionManifestFile, "acquisitionManifestFile");
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  if (compareExplicitIso8601Instants(
    generatedAt,
    acquisition.generatedAt,
    "generatedAt",
    "acquisitionManifest.generatedAt",
  ) < 0) {
    throw new Error("generatedAt must not precede acquisitionManifest.generatedAt");
  }

  const acquisitionsByDocID = new Map<string, AcquisitionView[]>();
  for (const item of acquisition.acquisitions) {
    const current = acquisitionsByDocID.get(item.docID) ?? [];
    current.push(item);
    acquisitionsByDocID.set(item.docID, current);
  }

  const artifacts = new Map<string, SanrioEdinetReviewArtifact>();
  for (const [docID, items] of acquisitionsByDocID) {
    const document = inventory.documents.get(docID) ?? null;
    const externalParent = items.every(item => item.parentOutsideInventory);
    if (!document && !externalParent) {
      throw new Error(`acquired document ${docID} is missing from inventory lineage`);
    }
    const sourceDocument = inventory.documents.get(items[0]!.sourceDocID) ?? null;
    const chainRootDocID = document?.chainRootDocID
      ?? (externalParent ? docID : sourceDocument?.chainRootDocID)
      ?? docID;

    artifacts.set(docID, {
      docID,
      parentDocID: document?.parentDocID ?? null,
      chainRootDocID,
      submitDateTime: document?.submitDateTime || null,
      description: document?.description
        ?? `(external parent of ${items.map(item => item.sourceDocID).sort().join(", ")})`,
      revisionReviewHint: document?.revisionReviewHint ?? "external_parent_candidate",
      parentOutsideInventory: externalParent,
      acquisitions: items.map(item => ({
        documentType: item.documentType,
        format: item.format,
        reason: item.reason,
        binaryFile: item.binaryFile,
        metadataFile: item.metadataFile,
        sha256: item.sha256,
        byteLength: item.byteLength,
        retrievedAt: item.retrievedAt,
      })),
      reviewStatus: "pending_human_review",
      blockers: artifactBlockers(document, externalParent),
    });
  }

  const groupsByRoot = new Map<string, SanrioEdinetReviewArtifact[]>();
  for (const artifact of artifacts.values()) {
    const current = groupsByRoot.get(artifact.chainRootDocID) ?? [];
    current.push(artifact);
    groupsByRoot.set(artifact.chainRootDocID, current);
  }

  const groups = [...groupsByRoot.entries()]
    .map(([chainRootDocID, documents]): SanrioEdinetReviewGroup => {
      documents.sort((a, b) => {
        const left = `${a.submitDateTime ?? ""}|${a.docID}`;
        const right = `${b.submitDateTime ?? ""}|${b.docID}`;
        return left.localeCompare(right);
      });
      return {
        groupId: `edinet:${chainRootDocID}`,
        chainRootDocID,
        documents,
        reviewChecklist: reviewChecklist(documents),
      };
    })
    .sort((a, b) => a.chainRootDocID.localeCompare(b.chainRootDocID));

  if (groups.length === 0) throw new Error("acquisition produced no review groups");

  const base: Omit<SanrioEdinetReviewWorkspace, "workspaceHash"> = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: SANRIO_EDINET_CODE,
      secCode: SANRIO_SEC_CODE,
    },
    sourceInventory: acquisition.sourceInventory,
    acquisitionManifest: manifestFile,
    generatedAt,
    retrievalComplete: true,
    acquisitionCount: acquisition.acquisitions.length,
    documentCount: artifacts.size,
    reviewStatus: "pending_human_review",
    groups,
    globalBlockers: [
      "human_review_not_completed",
      "semantic_mapping_not_confirmed",
      "foundation_preview_not_generated",
      "governed_append_not_authorized",
    ],
    appendAuthorized: false,
  };

  return { ...base, workspaceHash: hashWorkspace(base) };
}

export function renderSanrioEdinetReviewChecklist(
  workspace: SanrioEdinetReviewWorkspace,
): string {
  const lines = [
    "# Sanrio EDINET human review checklist",
    "",
    `- generatedAt: ${workspace.generatedAt}`,
    `- sourceInventory: ${workspace.sourceInventory}`,
    `- acquisitionManifest: ${workspace.acquisitionManifest}`,
    `- acquisitions: ${workspace.acquisitionCount}`,
    `- documents: ${workspace.documentCount}`,
    `- groups: ${workspace.groups.length}`,
    `- workspaceHash: ${workspace.workspaceHash}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "This file is a local review aid. Checking boxes does not authorize Foundation append.",
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
        `- submitDateTime: ${document.submitDateTime ?? "unknown"}`,
        `- revisionReviewHint: ${document.revisionReviewHint}`,
        `- parentOutsideInventory: ${document.parentOutsideInventory}`,
      );
      for (const acquisition of document.acquisitions) {
        lines.push(
          `- type ${acquisition.documentType} ${acquisition.format}: ${acquisition.binaryFile}`,
          `  - sha256: ${acquisition.sha256}`,
          `  - bytes: ${acquisition.byteLength}`,
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
    "- [ ] A human-reviewed manifest has been created separately.",
    "- [ ] The reviewed manifest passes the non-appendable Foundation preview CLI.",
    "- [ ] No API key, raw filing, local path, or acquired binary is staged in Git.",
    "- appendAuthorized remains false.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
