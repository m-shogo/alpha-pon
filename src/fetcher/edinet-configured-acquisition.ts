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

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function verifyReviewPlanHash(record: JsonObject): string {
  const expected = hash(record.reviewPlanHash, "reviewPlan.reviewPlanHash");
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
  if (text(reviewPlan.registryHash) !== registry.registryHash) {
    throw new Error("reviewPlan.registryHash does not match configured registry");
  }
  const issuer = object(reviewPlan.issuer, "reviewPlan.issuer");
  const boundary = resolveEdinetIssuerBoundary(
    registry,
    required(issuer.issuerKey, "reviewPlan.issuer.issuerKey"),
  );
  if (
    text(issuer.name) !== boundary.name
    || text(issuer.edinetCode).toUpperCase() !== boundary.edinetCode
    || text(issuer.secCode) !== boundary.secCode
    || text(issuer.boundaryHash) !== boundary.boundaryHash
  ) {
    throw new Error("reviewPlan issuer identity does not match configured boundary");
  }
  if (!boundary.allowedDocumentTypes.includes("1") || !boundary.allowedDocumentTypes.includes("2")) {
    throw new Error("configured acquisition v1 requires document types 1 and 2");
  }
  return boundary;
}

function makeTask(doc: string, type: "1" | "2"): ConfiguredEdinetAcquisitionTask {
  return {
    docID: doc,
    documentType: type,
    format: type === "2" ? "pdf" : "zip",
    reason: type === "2"
      ? "configured_official_pdf_review"
      : "configured_structured_review",
    sourceDocID: doc,
    parentOutsidePlan: false,
  };
}

function tasksFromReviewPlan(
  reviewPlan: JsonObject,
  boundary: EdinetIssuerBoundary,
): ConfiguredEdinetAcquisitionTask[] {
  const documents = new Map<string, { parentDocID: string | null; types: Array<"1" | "2"> }>();
  for (const [groupIndex, groupValue] of array(reviewPlan.groups, "reviewPlan.groups").entries()) {
    const group = object(groupValue, `reviewPlan.groups[${groupIndex}]`);
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
      if (document.reviewStatus !== "pending_human_review") {
        throw new Error(`reviewPlan document ${id} is not pending human review`);
      }
      if (document.retrievableByLegalStatus !== true) {
        throw new Error(`reviewPlan document ${id} is not retrievable by legal status`);
      }
      const parent = text(document.parentDocID);
      if (parent && !DOC_ID_RE.test(parent)) throw new Error(`reviewPlan document ${id} has invalid parentDocID`);
      const planned = array(
        document.plannedDocumentTypes,
        `reviewPlan document ${id}.plannedDocumentTypes`,
      ).map((value, index) => {
        const type = required(value, `reviewPlan document ${id}.plannedDocumentTypes[${index}]`);
        assertEdinetDocumentTypeAllowed(boundary, type);
        if (type !== "1" && type !== "2") {
          throw new Error(`reviewPlan document ${id} contains non-core document type ${type}`);
        }
        return type;
      });
      if (new Set(planned).size !== planned.length) {
        throw new Error(`reviewPlan document ${id} has duplicate planned document types`);
      }
      if (!planned.includes("1") || !planned.includes("2")) {
        throw new Error(`reviewPlan document ${id} requires both document types 1 and 2`);
      }
      if (document.structuredDocumentPlanned !== true || document.officialPdfPlanned !== true) {
        throw new Error(`reviewPlan document ${id} core coverage flags are incomplete`);
      }
      documents.set(id, { parentDocID: parent || null, types: planned as Array<"1" | "2"> });
    }
  }
  if (documents.size === 0) throw new Error("reviewPlan has no acquisition documents");
  for (const [id, document] of documents) {
    if (document.parentDocID && !documents.has(document.parentDocID)) {
      throw new Error(`reviewPlan document ${id} has unresolved external parent ${document.parentDocID}`);
    }
  }
  return [...documents.entries()]
    .flatMap(([id, document]) => document.types.map(type => makeTask(id, type)))
    .sort((left, right) =>
      `${left.docID}|${left.documentType}`.localeCompare(`${right.docID}|${right.documentType}`),
    );
}

export function buildConfiguredEdinetAcquisitionPlan(input: {
  reviewPlan: unknown;
  registry: unknown;
  sourceReviewPlanFile: string;
  generatedAt?: string;
}): ConfiguredEdinetAcquisitionPlan {
  const registry = buildEdinetIssuerRegistry(input.registry);
  const reviewPlan = object(input.reviewPlan, "reviewPlan");
  const sourceReviewPlanHash = verifyReviewPlanHash(reviewPlan);
  const boundary = verifyBoundary(registry, reviewPlan);
  const sourceReviewPlanFile = basename(input.sourceReviewPlanFile, "sourceReviewPlanFile");
  if (!sourceReviewPlanFile.endsWith(".json")) throw new Error("sourceReviewPlanFile must be JSON");
  const tasks = tasksFromReviewPlan(reviewPlan, boundary);
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
    sourceInventoryFile: basename(reviewPlan.sourceInventoryFile, "reviewPlan.sourceInventoryFile"),
    sourceInventoryHash: hash(reviewPlan.sourceInventoryHash, "reviewPlan.sourceInventoryHash"),
    generatedAt: input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString(),
    taskCount: tasks.length,
    tasks,
    executionPolicy: "explicit_local_command_only" as const,
    storageBoundary: "local_only" as const,
    automaticAcquisitionAuthorized: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, planHash: digest(base) };
}

function validatePlan(plan: ConfiguredEdinetAcquisitionPlan): void {
  const { planHash, ...withoutHash } = plan;
  if (!HASH_RE.test(planHash) || digest(withoutHash) !== planHash) {
    throw new Error("acquisition plan hash mismatch");
  }
}

function validateResults(
  plan: ConfiguredEdinetAcquisitionPlan,
  succeeded: ConfiguredEdinetAcquisitionSuccess[],
  failed: ConfiguredEdinetAcquisitionFailure[],
): void {
  const expected = new Map(plan.tasks.map(item => [`${item.docID}|${item.documentType}`, item]));
  const seen = new Set<string>();
  for (const [kind, values] of [["succeeded", succeeded], ["failed", failed]] as const) {
    for (const value of values) {
      const key = `${value.task.docID}|${value.task.documentType}`;
      const planned = expected.get(key);
      if (!planned) throw new Error(`${kind} contains unexpected task ${key}`);
      if (seen.has(key)) throw new Error(`acquisition result duplicates task ${key}`);
      if (!same(value.task, planned)) throw new Error(`${kind} task ${key} changed from acquisition plan`);
      seen.add(key);
    }
  }
  if (seen.size !== plan.taskCount) throw new Error("acquisition result does not cover every planned task");
  for (const [index, item] of succeeded.entries()) {
    basename(item.binaryFile, `succeeded[${index}].binaryFile`);
    basename(item.metadataFile, `succeeded[${index}].metadataFile`);
    hash(item.sha256, `succeeded[${index}].sha256`);
    if (!Number.isSafeInteger(item.byteLength) || item.byteLength <= 0) {
      throw new Error(`succeeded[${index}].byteLength must be positive`);
    }
    timestamp(item.retrievedAt, `succeeded[${index}].retrievedAt`);
  }
  failed.forEach((item, index) => required(item.code, `failed[${index}].code`));
}

function resultBase(input: {
  plan: ConfiguredEdinetAcquisitionPlan;
  generatedAt: string;
  outputDirectory: string;
  succeeded: ConfiguredEdinetAcquisitionSuccess[];
  failed: ConfiguredEdinetAcquisitionFailure[];
}) {
  validatePlan(input.plan);
  validateResults(input.plan, input.succeeded, input.failed);
  return {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: input.plan.registryHash,
    issuer: input.plan.issuer,
    sourceReviewPlanFile: input.plan.sourceReviewPlanFile,
    sourceReviewPlanHash: input.plan.sourceReviewPlanHash,
    acquisitionPlanHash: input.plan.planHash,
    generatedAt: timestamp(input.generatedAt, "generatedAt"),
    outputDirectory: basename(input.outputDirectory, "outputDirectory"),
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
