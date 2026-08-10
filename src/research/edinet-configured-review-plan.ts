import { createHash } from "node:crypto";
import {
  assertEdinetDocumentTypeAllowed,
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
  type EdinetIssuerBoundary,
  type EdinetIssuerRegistry,
} from "./edinet-issuer-boundary.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetReviewDocument = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  submitDateTime: string;
  description: string;
  reviewPriority: "high" | "normal";
  reviewReasons: string[];
  retrievableByLegalStatus: boolean;
  plannedDocumentTypes: string[];
  structuredDocumentPlanned: boolean;
  officialPdfPlanned: boolean;
  reviewStatus: "pending_human_review";
  blockers: string[];
};

export type ConfiguredEdinetReviewGroup = {
  groupId: string;
  chainRootDocID: string;
  documents: ConfiguredEdinetReviewDocument[];
  reviewChecklist: string[];
};

export type ConfiguredEdinetReviewPlan = {
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
  sourceInventoryFile: string;
  sourceInventoryHash: string;
  generatedAt: string;
  inventoryRange: {
    from: string;
    to: string;
  };
  candidateCount: number;
  groupCount: number;
  plannedAcquisitionCount: number;
  structuredDocumentPlanCount: number;
  officialPdfPlanCount: number;
  reviewStatus: "inventory_review_planned";
  groups: ConfiguredEdinetReviewGroup[];
  globalBlockers: string[];
  acquisitionAuthorized: false;
  appendAuthorized: false;
  reviewPlanHash: string;
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
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function requireTimestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function requireIsoDate(value: unknown, field: string): string {
  const result = required(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${field} must be YYYY-MM-DD`);
  const [year, month, day] = result.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid calendar date`);
  }
  return result;
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

function strings(value: unknown, field: string): string[] {
  const values = arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
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

function verifyInventoryHash(record: JsonObject): string {
  const expected = requireHash(record.inventoryHash, "inventory.inventoryHash");
  const { inventoryHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("inventory.inventoryHash mismatch");
  return expected;
}

function verifyBoundary(
  registry: EdinetIssuerRegistry,
  inventory: JsonObject,
): EdinetIssuerBoundary {
  if (inventory.schemaVersion !== 1 || inventory.source !== "edinet") {
    throw new Error("inventory schema/source is unsupported");
  }
  if (inventory.completeness !== "complete") throw new Error("inventory must be complete");
  if (arr(inventory.failedDates, "inventory.failedDates").length > 0) {
    throw new Error("inventory.failedDates must be empty");
  }
  if (inventory.factPromotionPolicy !== "human_review_required") {
    throw new Error("inventory.factPromotionPolicy must be human_review_required");
  }
  if (inventory.requireOfficialPdfVisualReview !== true) {
    throw new Error("inventory.requireOfficialPdfVisualReview must be true");
  }
  if (inventory.appendAuthorized !== false) {
    throw new Error("inventory.appendAuthorized must be false");
  }
  if (str(inventory.registryHash) !== registry.registryHash) {
    throw new Error("inventory.registryHash does not match configured registry");
  }
  const issuer = obj(inventory.issuer, "inventory.issuer");
  const boundary = resolveEdinetIssuerBoundary(
    registry,
    required(issuer.issuerKey, "inventory.issuer.issuerKey"),
  );
  if (
    str(issuer.name) !== boundary.name
    || str(issuer.edinetCode).toUpperCase() !== boundary.edinetCode
    || str(issuer.secCode) !== boundary.secCode
    || str(issuer.boundaryHash) !== boundary.boundaryHash
  ) {
    throw new Error("inventory issuer identity does not match configured boundary");
  }
  if (!boundary.allowedDocumentTypes.includes("1")) {
    throw new Error("configured issuer must allow document type 1");
  }
  return boundary;
}

function lineageRoots(record: JsonObject): Map<string, {
  parentDocID: string | null;
  chainRootDocID: string;
}> {
  const lineage = obj(record.lineage, "inventory.lineage");
  if (lineage.hasBlockingIssues === true) {
    throw new Error("inventory lineage has blocking issues");
  }
  const result = new Map<string, { parentDocID: string | null; chainRootDocID: string }>();
  for (const [index, value] of arr(lineage.nodes, "inventory.lineage.nodes").entries()) {
    const node = obj(value, `inventory.lineage.nodes[${index}]`);
    const docID = requireDocID(node.docID, `inventory.lineage.nodes[${index}].docID`);
    if (result.has(docID)) throw new Error(`inventory.lineage has duplicate ${docID}`);
    const parentText = str(node.parentDocID);
    if (parentText && !DOC_ID_RE.test(parentText)) {
      throw new Error(`inventory.lineage.nodes[${index}].parentDocID is invalid`);
    }
    result.set(docID, {
      parentDocID: parentText || null,
      chainRootDocID: requireDocID(
        node.chainRootDocID,
        `inventory.lineage.nodes[${index}].chainRootDocID`,
      ),
    });
  }
  return result;
}

function documentBlockers(input: {
  parentDocID: string | null;
  retrievableByLegalStatus: boolean;
  structuredDocumentPlanned: boolean;
  officialPdfPlanned: boolean;
}): string[] {
  const blockers = [
    "local_acquisition_not_executed",
    "source_hashes_not_recorded",
    "human_document_review_required",
    "semantic_summary_required",
    "security_master_entity_resolution_required",
    "pit_timestamp_confirmation_required",
  ];
  if (!input.retrievableByLegalStatus) blockers.push("document_not_retrievable_by_legal_status");
  if (!input.structuredDocumentPlanned) blockers.push("structured_document_type_1_not_planned");
  if (!input.officialPdfPlanned) blockers.push("official_pdf_type_2_not_planned");
  if (input.parentDocID) blockers.push("revision_relation_confirmation_required");
  return blockers.sort();
}

function groupChecklist(documents: ConfiguredEdinetReviewDocument[]): string[] {
  const checklist = [
    "Confirm the inventory issuer key, EDINET code, security code, registry hash, and boundary hash.",
    "Acquire only explicitly allowed document types through a separate local-only acquisition action.",
    "Verify every acquired binary against its recorded SHA-256 before opening it.",
    "Read the official PDF and separate confirmed facts, previously known facts, assumptions, and opinion.",
    "Resolve entity IDs through the governed Security Master without ticker or name inference.",
    "Confirm publishedAt, observedAt, retrievedAt, effectiveFrom, and firstExecutableAt.",
  ];
  if (documents.some(document => document.parentDocID)) {
    checklist.push(
      "Compare parent and child filings and confirm correction scope, prior record IDs, and supersession strength.",
    );
  }
  return checklist;
}

function parseDocuments(
  inventory: JsonObject,
  boundary: EdinetIssuerBoundary,
): ConfiguredEdinetReviewDocument[] {
  const roots = lineageRoots(inventory);
  const documents: ConfiguredEdinetReviewDocument[] = [];
  const seen = new Set<string>();
  for (const [index, value] of arr(inventory.candidates, "inventory.candidates").entries()) {
    const candidate = obj(value, `inventory.candidates[${index}]`);
    const doc = obj(candidate.doc, `inventory.candidates[${index}].doc`);
    const docID = requireDocID(doc.docID, `inventory.candidates[${index}].doc.docID`);
    if (seen.has(docID)) throw new Error(`inventory has duplicate candidate ${docID}`);
    seen.add(docID);
    const edinetCode = str(doc.edinetCode).toUpperCase();
    const secCode = str(doc.secCode);
    if (
      (edinetCode && edinetCode !== boundary.edinetCode)
      || (secCode && secCode !== boundary.secCode)
      || (!edinetCode && !secCode)
    ) {
      throw new Error(`inventory candidate ${docID} crossed the configured issuer boundary`);
    }
    const lineage = roots.get(docID);
    if (!lineage) throw new Error(`inventory candidate ${docID} is missing from lineage`);
    const reviewPriority = required(candidate.reviewPriority, `inventory.candidates[${index}].reviewPriority`);
    if (reviewPriority !== "high" && reviewPriority !== "normal") {
      throw new Error(`inventory.candidates[${index}].reviewPriority is invalid`);
    }
    if (typeof candidate.retrievableByLegalStatus !== "boolean") {
      throw new Error(`inventory.candidates[${index}].retrievableByLegalStatus must be boolean`);
    }
    const documentTypes = arr(
      candidate.documentTypePlan,
      `inventory.candidates[${index}].documentTypePlan`,
    ).map((planValue, planIndex) => {
      const plan = obj(
        planValue,
        `inventory.candidates[${index}].documentTypePlan[${planIndex}]`,
      );
      const type = required(
        plan.type,
        `inventory.candidates[${index}].documentTypePlan[${planIndex}].type`,
      );
      assertEdinetDocumentTypeAllowed(boundary, type);
      return type;
    });
    if (new Set(documentTypes).size !== documentTypes.length) {
      throw new Error(`inventory candidate ${docID} has duplicate document types`);
    }
    const plannedDocumentTypes = [...documentTypes].sort();
    const structuredDocumentPlanned = plannedDocumentTypes.includes("1");
    const officialPdfPlanned = plannedDocumentTypes.includes("2");
    const parentDocID = lineage.parentDocID;
    documents.push({
      docID,
      parentDocID,
      chainRootDocID: lineage.chainRootDocID,
      submitDateTime: requireTimestamp(
        doc.submitDateTime,
        `inventory.candidates[${index}].doc.submitDateTime`,
      ),
      description: str(doc.docDescription) || "(description unavailable)",
      reviewPriority,
      reviewReasons: strings(candidate.reviewReasons, `inventory.candidates[${index}].reviewReasons`),
      retrievableByLegalStatus: candidate.retrievableByLegalStatus,
      plannedDocumentTypes,
      structuredDocumentPlanned,
      officialPdfPlanned,
      reviewStatus: "pending_human_review",
      blockers: documentBlockers({
        parentDocID,
        retrievableByLegalStatus: candidate.retrievableByLegalStatus,
        structuredDocumentPlanned,
        officialPdfPlanned,
      }),
    });
  }
  if (documents.length === 0) throw new Error("inventory has no review candidates");
  if (roots.size !== documents.length) {
    throw new Error("inventory lineage/candidate count mismatch");
  }
  return documents.sort((left, right) =>
    `${left.chainRootDocID}|${left.submitDateTime}|${left.docID}`.localeCompare(
      `${right.chainRootDocID}|${right.submitDateTime}|${right.docID}`,
    ),
  );
}

export function buildConfiguredEdinetReviewPlan(input: {
  inventory: unknown;
  registry: unknown;
  sourceInventoryFile: string;
  generatedAt?: string;
}): ConfiguredEdinetReviewPlan {
  const registry = buildEdinetIssuerRegistry(input.registry);
  const inventory = obj(input.inventory, "inventory");
  const boundary = verifyBoundary(registry, inventory);
  const sourceInventoryHash = verifyInventoryHash(inventory);
  const sourceInventoryFile = localJsonBasename(input.sourceInventoryFile, "sourceInventoryFile");
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  const range = obj(inventory.range, "inventory.range");
  const inventoryRange = {
    from: requireIsoDate(range.from, "inventory.range.from"),
    to: requireIsoDate(range.to, "inventory.range.to"),
  };
  if (inventoryRange.from > inventoryRange.to) throw new Error("inventory range is inverted");

  const documents = parseDocuments(inventory, boundary);
  const grouped = new Map<string, ConfiguredEdinetReviewDocument[]>();
  for (const document of documents) {
    const current = grouped.get(document.chainRootDocID) ?? [];
    current.push(document);
    grouped.set(document.chainRootDocID, current);
  }
  const groups = [...grouped.entries()]
    .map(([chainRootDocID, groupDocuments]): ConfiguredEdinetReviewGroup => ({
      groupId: `edinet:${boundary.issuerKey}:${chainRootDocID}`,
      chainRootDocID,
      documents: groupDocuments,
      reviewChecklist: groupChecklist(groupDocuments),
    }))
    .sort((left, right) => left.chainRootDocID.localeCompare(right.chainRootDocID));

  const plannedAcquisitionCount = documents.reduce(
    (sum, document) => sum + document.plannedDocumentTypes.length,
    0,
  );
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: registry.registryHash,
    issuer: {
      issuerKey: boundary.issuerKey,
      name: boundary.name,
      edinetCode: boundary.edinetCode,
      secCode: boundary.secCode,
      boundaryHash: boundary.boundaryHash,
    },
    sourceInventoryFile,
    sourceInventoryHash,
    generatedAt,
    inventoryRange,
    candidateCount: documents.length,
    groupCount: groups.length,
    plannedAcquisitionCount,
    structuredDocumentPlanCount: documents.filter(document => document.structuredDocumentPlanned).length,
    officialPdfPlanCount: documents.filter(document => document.officialPdfPlanned).length,
    reviewStatus: "inventory_review_planned" as const,
    groups,
    globalBlockers: [
      "local_acquisition_not_executed",
      "binary_sha256_not_recorded",
      "official_pdf_visual_review_not_completed",
      "human_fact_classification_not_completed",
      "foundation_preview_not_generated",
      "governed_store_append_not_authorized",
    ].sort(),
    acquisitionAuthorized: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, reviewPlanHash: digest(base) };
}

export function renderConfiguredEdinetReviewPlan(plan: ConfiguredEdinetReviewPlan): string {
  const lines = [
    `# ${plan.issuer.name} EDINET configured review plan`,
    "",
    `- generatedAt: ${plan.generatedAt}`,
    `- issuerKey: ${plan.issuer.issuerKey}`,
    `- edinetCode/secCode: ${plan.issuer.edinetCode}/${plan.issuer.secCode}`,
    `- registryHash: ${plan.registryHash}`,
    `- boundaryHash: ${plan.issuer.boundaryHash}`,
    `- sourceInventoryFile: ${plan.sourceInventoryFile}`,
    `- sourceInventoryHash: ${plan.sourceInventoryHash}`,
    `- range: ${plan.inventoryRange.from} .. ${plan.inventoryRange.to}`,
    `- candidates/groups: ${plan.candidateCount}/${plan.groupCount}`,
    `- planned acquisitions: ${plan.plannedAcquisitionCount}`,
    `- type 1/type 2 candidates: ${plan.structuredDocumentPlanCount}/${plan.officialPdfPlanCount}`,
    `- reviewPlanHash: ${plan.reviewPlanHash}`,
    "- reviewStatus: inventory_review_planned",
    "- acquisitionAuthorized: false",
    "- appendAuthorized: false",
    "",
    "This plan is a fail-closed review boundary. It does not download or append anything.",
    "",
  ];
  for (const group of plan.groups) {
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
        `- plannedDocumentTypes: ${document.plannedDocumentTypes.join(", ") || "(none)"}`,
        `- retrievableByLegalStatus: ${document.retrievableByLegalStatus}`,
        "",
        "Blockers:",
      );
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
    "- Acquisition requires a separate explicit local-only action.",
    "- Official PDF and structured document review remain mandatory.",
    "- The plan cannot create Evidence, Foundation, recommendations, BUY, or orders.",
    "- acquisitionAuthorized and appendAuthorized remain false.",
    "",
  );
  return `${lines.join("\n")}\n`;
}
