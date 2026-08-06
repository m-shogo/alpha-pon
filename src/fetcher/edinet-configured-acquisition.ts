import { createHash } from "node:crypto";
import type { EdinetDocumentTypeCode } from "./edinet-document.js";
import {
  assertEdinetDocumentTypeAllowed,
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
  type EdinetIssuerBoundary,
  type EdinetIssuerRegistry,
} from "../research/edinet-issuer-boundary.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetAcquisitionTask = {
  docID: string;
  documentType: Extract<EdinetDocumentTypeCode, "1" | "2">;
  format: "zip" | "pdf";
  reason: "configured_structured_review" | "configured_official_pdf_review";
  sourceDocID: string;
  parentOutsidePlan: false;
};

export type ConfiguredEdinetAcquisitionPlan = {
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
  sourceReviewPlanFile: string;
  sourceReviewPlanHash: string;
  sourceInventoryFile: string;
  sourceInventoryHash: string;
  generatedAt: string;
  taskCount: number;
  tasks: ConfiguredEdinetAcquisitionTask[];
  executionPolicy: "explicit_local_command_only";
  storageBoundary: "local_only";
  automaticAcquisitionAuthorized: false;
  appendAuthorized: false;
  planHash: string;
};

export type ConfiguredEdinetAcquisitionSuccess = {
  task: ConfiguredEdinetAcquisitionTask;
  binaryFile: string;
  metadataFile: string;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
};

export type ConfiguredEdinetAcquisitionFailure = {
  task: ConfiguredEdinetAcquisitionTask;
  code: string;
};

export type ConfiguredEdinetAcquisitionAttempt = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: ConfiguredEdinetAcquisitionPlan["issuer"];
  sourceReviewPlanFile: string;
  sourceReviewPlanHash: string;
  acquisitionPlanHash: string;
  generatedAt: string;
  outputDirectory: string;
  totalTasks: number;
  succeeded: ConfiguredEdinetAcquisitionSuccess[];
  failed: ConfiguredEdinetAcquisitionFailure[];
  complete: false;
  canonicalManifestWritten: false;
  executionMode: "explicit_local_command";
  storageBoundary: "local_only";
  appendAuthorized: false;
  attemptHash: string;
};

export type ConfiguredEdinetAcquisitionManifest = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: ConfiguredEdinetAcquisitionPlan["issuer"];
  sourceReviewPlanFile: string;
  sourceReviewPlanHash: string;
  acquisitionPlanHash: string;
  generatedAt: string;
  outputDirectory: string;
  totalTasks: number;
  succeeded: ConfiguredEdinetAcquisitionSuccess[];
  failed: [];
  complete: true;
  canonicalManifestWritten: true;
  executionMode: "explicit_local_command";
  storageBoundary: "local_only";
  reviewStatus: "pending_human_review";
  appendAuthorized: false;
  manifestHash: string;
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
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
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

function verifyReviewPlanHash(record: JsonObject): string {
  const expected = requireHash(record.reviewPlanHash, "reviewPlan.reviewPlanHash");
  const { reviewPlanHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("reviewPlan.reviewPlanHash mismatch");
  return expected;
}

function verifyBoundary(
  registry: EdinetIssuerRegistry,
  reviewPlan: JsonObject,
): EdinetIssuerBoundary {
  if (reviewPlan.schemaVersion !== 1 || reviewPlan.source !== "edinet") {
    throw new Error("reviewPlan schema/source is unsupported");
  }
  if (reviewPlan.reviewStatus !== "inventory_review_planned") {
    throw new Error("reviewPlan.reviewStatus must be inventory_review_planned");
  }
  if (reviewPlan.acquisitionAuthorized !== false || reviewPlan.appendAuthorized !== false) {
    throw new Error("reviewPlan safety boundary is invalid");
  }
  if (str(reviewPlan.registryHash) !== registry.registryHash) {
    throw new Error("reviewPlan.registryHash does not match configured registry");
  }
  const issuer = obj(reviewPlan.issuer, "reviewPlan.issuer");
  const boundary = resolveEdinetIssuerBoundary(
    registry,
    required(issuer.issuerKey, "reviewPlan.issuer.issuerKey"),
  );
  if (
    str(issuer.name) !== boundary.name
    || str(issuer.edinetCode).toUpperCase() !== boundary.edinetCode
    || str(issuer.secCode) !== boundary.secCode
    || str(issuer.boundaryHash) !== boundary.boundaryHash
  ) {
    throw new Error("reviewPlan issuer identity does not match configured boundary");
  }
  if (!boundary.allowedDocumentTypes.includes("1") || !boundary.allowedDocumentTypes.includes("2")) {
    throw new Error("configured acquisition v1 requires document types 1 and 2");
  }
  return boundary;
}

function task(
  docID: string,
  documentType: ConfiguredEdinetAcquisitionTask["documentType"],
): ConfiguredEdinetAcquisitionTask {
  return {
    docID,
    documentType,
    format: documentType === "2" ? "pdf" : "zip",
    reason: documentType === "2"
      ? "configured_official_pdf_review"
      : "configured_structured_review",
    sourceDocID: docID,
    parentOutsidePlan: false,
  };
}

function parseTasks(
  reviewPlan: JsonObject,
  boundary: EdinetIssuerBoundary,
): ConfiguredEdinetAcquisitionTask[] {
  const documents = new Map<string, { parentDocID: string | null; types: string[] }>();
  for (const [groupIndex, groupValue] of arr(reviewPlan.groups, "reviewPlan.groups").entries()) {
    const group = obj(groupValue, `reviewPlan.groups[${groupIndex}]`);
    for (const [documentIndex, documentValue] of arr(
      group.documents,
      `reviewPlan.groups[${groupIndex}].documents`,
    ).entries()) {
      const document = obj(
        documentValue,
        `reviewPlan.groups[${groupIndex}].documents[${documentIndex}]`,
      );
      const docID = requireDocID(
        document.docID,
        `reviewPlan.groups[${groupIndex}].documents[${documentIndex}].docID`,
      );
      if (documents.has(docID)) throw new Error(`reviewPlan has duplicate document ${docID}`);
      if (document.reviewStatus !== "pending_human_review") {
        throw new Error(`reviewPlan document ${docID} is not pending human review`);
      }
      if (document.retrievableByLegalStatus !== true) {
        throw new Error(`reviewPlan document ${docID} is not retrievable by legal status`);
      }
      const parentText = str(document.parentDocID);
      if (parentText && !DOC_ID_RE.test(parentText)) {
        throw new Error(`reviewPlan document ${docID} has invalid parentDocID`);
      }
      const types = arr(
        document.plannedDocumentTypes,
        `reviewPlan document ${docID}.plannedDocumentTypes`,
      ).map((value, index) => {
        const type = required(value, `reviewPlan document ${docID}.plannedDocumentTypes[${index}]`);
        assertEdinetDocumentTypeAllowed(boundary, type);
        if (type !== "1" && type !== "2") {
          throw new Error(`reviewPlan document ${docID} contains non-core document type ${type}`);
        }
        return type;
      });
      if (new Set(types).size !== types.length) {
        throw new Error(`reviewPlan document ${docID} has duplicate planned document types`);
      }
      if (!types.includes("1") || !types.includes("2")) {
        throw new Error(`reviewPlan document ${docID} requires both document types 1 and 2`);
      }
      if (document.structuredDocumentPlanned !== true || document.officialPdfPlanned !== true) {
        throw new Error(`reviewPlan document ${docID} core coverage flags are incomplete`);
      }
      documents.set(docID, { parentDocID: parentText || null, types });
    }
  }
  if (documents.size === 0) throw new Error("reviewPlan has no acquisition documents");

  for (const [docID, document] of documents) {
    if (document.parentDocID && !documents.has(document.parentDocID)) {
      throw new Error(`reviewPlan document ${docID} has unresolved external parent ${document.parentDocID}`);
    }
  }

  const tasks: ConfiguredEdinetAcquisitionTask[] = [];
  for (const [docID, document] of documents) {
    for (const type of document.types) tasks.push(task(docID, type as "1" | "2"));
  }
  tasks.sort((left, right) =>
    `${left.docID}|${left.documentType}`.localeCompare(`${right.docID}|${right.documentType}`),
  );
  return tasks;
}

export function buildConfiguredEdinetAcquisitionPlan(input: {
  reviewPlan: unknown;
  registry: unknown;
  sourceReviewPlanFile: string;
  generatedAt?: string;
}): ConfiguredEdinetAcquisitionPlan {
  const registry = buildEdinetIssuerRegistry(input.registry);
  const reviewPlan = obj(input.reviewPlan, "reviewPlan");
  const sourceReviewPlanHash = verifyReviewPlanHash(reviewPlan);
  const boundary = verifyBoundary(registry, reviewPlan);
  const sourceReviewPlanFile = localBasename(input.sourceReviewPlanFile, "sourceReviewPlanFile");
  if (!sourceReviewPlanFile.endsWith(".json")) {
    throw new Error("sourceReviewPlanFile must be JSON");
  }
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  const tasks = parseTasks(reviewPlan, boundary);
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
    sourceReviewPlanFile,
    sourceReviewPlanHash,
    sourceInventoryFile: localBasename(reviewPlan.sourceInventoryFile, "reviewPlan.sourceInventoryFile"),
    sourceInventoryHash: requireHash(reviewPlan.sourceInventoryHash, "reviewPlan.sourceInventoryHash"),
    generatedAt,
    taskCount: tasks.length,
    tasks,
    executionPolicy: "explicit_local_command_only" as const,
    storageBoundary: "local_only" as const,
    automaticAcquisitionAuthorized: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, planHash: digest(base) };
}

function validateResultIdentity(
  plan: ConfiguredEdinetAcquisitionPlan,
  succeeded: ConfiguredEdinetAcquisitionSuccess[],
  failed: ConfiguredEdinetAcquisitionFailure[],
): void {
  const expected = new Map(plan.tasks.map(item => [`${item.docID}|${item.documentType}`, item]));
  const seen = new Set<string>();
  for (const [kind, values] of [["succeeded", succeeded], ["failed", failed]] as const) {
    for (const value of values) {
      const key = `${value.task.docID}|${value.task.documentType}`;
      if (!expected.has(key)) throw new Error(`${kind} contains unexpected task ${key}`);
      if (seen.has(key)) throw new Error(`acquisition result duplicates task ${key}`);
      seen.add(key);
      if (JSON.stringify(canonical(value.task)) !== JSON.stringify(canonical(expected.get(key)))) {
        throw new Error(`${kind} task ${key} changed from acquisition plan`);
      }
    }
  }
  if (seen.size !== plan.taskCount) throw new Error("acquisition result does not cover every planned task");
}

function resultBase(input: {
  plan: ConfiguredEdinetAcquisitionPlan;
  generatedAt: string;
  outputDirectory: string;
  succeeded: ConfiguredEdinetAcquisitionSuccess[];
  failed: ConfiguredEdinetAcquisitionFailure[];
}) {
  if (digest(({ planHash: _ignored, ...withoutHash }) => withoutHash)(input.plan as never) !== "") {
    // Unreachable placeholder avoided below; plan hash is verified explicitly.
  }
  const { planHash, ...withoutPlanHash } = input.plan;
  if (digest(withoutPlanHash) !== planHash) throw new Error("acquisition plan hash mismatch");
  requireTimestamp(input.generatedAt, "generatedAt");
  localBasename(input.outputDirectory, "outputDirectory");
  validateResultIdentity(input.plan, input.succeeded, input.failed);
  for (const [index, item] of input.succeeded.entries()) {
    localBasename(item.binaryFile, `succeeded[${index}].binaryFile`);
    localBasename(item.metadataFile, `succeeded[${index}].metadataFile`);
    requireHash(item.sha256, `succeeded[${index}].sha256`);
    if (!Number.isSafeInteger(item.byteLength) || item.byteLength <= 0) {
      throw new Error(`succeeded[${index}].byteLength must be positive`);
    }
    requireTimestamp(item.retrievedAt, `succeeded[${index}].retrievedAt`);
  }
  for (const [index, item] of input.failed.entries()) {
    required(item.code, `failed[${index}].code`);
  }
  return {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: input.plan.registryHash,
    issuer: input.plan.issuer,
    sourceReviewPlanFile: input.plan.sourceReviewPlanFile,
    sourceReviewPlanHash: input.plan.sourceReviewPlanHash,
    acquisitionPlanHash: input.plan.planHash,
    generatedAt: input.generatedAt,
    outputDirectory: input.outputDirectory,
    totalTasks: input.plan.taskCount,
    succeeded: [...input.succeeded].sort((left, right) =>
      `${left.task.docID}|${left.task.documentType}`.localeCompare(
        `${right.task.docID}|${right.task.documentType}`,
      ),
    ),
    failed: [...input.failed].sort((left, right) =>
      `${left.task.docID}|${left.task.documentType}`.localeCompare(
        `${right.task.docID}|${right.task.documentType}`,
      ),
    ),
    executionMode: "explicit_local_command" as const,
    storageBoundary: "local_only" as const,
    appendAuthorized: false as const,
  };
}

export function buildConfiguredEdinetAcquisitionAttempt(input: {
  plan: ConfiguredEdinetAcquisitionPlan;
  generatedAt: string;
  outputDirectory: string;
  succeeded: ConfiguredEdinetAcquisitionSuccess[];
  failed: ConfiguredEdinetAcquisitionFailure[];
}): ConfiguredEdinetAcquisitionAttempt {
  if (input.failed.length === 0) throw new Error("failed acquisition attempt requires failures");
  const base = {
    ...resultBase(input),
    complete: false as const,
    canonicalManifestWritten: false as const,
  };
  return { ...base, attemptHash: digest(base) };
}

export function buildConfiguredEdinetAcquisitionManifest(input: {
  plan: ConfiguredEdinetAcquisitionPlan;
  generatedAt: string;
  outputDirectory: string;
  succeeded: ConfiguredEdinetAcquisitionSuccess[];
  failed: ConfiguredEdinetAcquisitionFailure[];
}): ConfiguredEdinetAcquisitionManifest {
  if (input.failed.length > 0) throw new Error("canonical acquisition manifest cannot include failures");
  if (input.succeeded.length !== input.plan.taskCount) {
    throw new Error("canonical acquisition manifest requires every planned task");
  }
  const result = resultBase(input);
  const base = {
    ...result,
    failed: [] as [],
    complete: true as const,
    canonicalManifestWritten: true as const,
    reviewStatus: "pending_human_review" as const,
  };
  return { ...base, manifestHash: digest(base) };
}
