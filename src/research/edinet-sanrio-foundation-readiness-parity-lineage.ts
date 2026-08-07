import { createHash } from "node:crypto";
import {
  auditSanrioConfiguredFoundationReadiness,
  type SanrioFoundationReadinessAudit,
} from "./edinet-sanrio-foundation-readiness-audit.js";

type JsonObject = Record<string, unknown>;
const HASH_RE = /^[a-f0-9]{64}$/;

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

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
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
  return [...result].sort();
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

type WorkspaceMapping = {
  anchorId: string;
  sourceShape: unknown;
};

type WorkspaceCoverage = {
  anchorId: string;
  sourceShape: unknown;
};

function workspaceLineage(workspaceValue: unknown): {
  workspaceHash: string;
  mappings: WorkspaceMapping[];
  coverage: WorkspaceCoverage[];
} {
  const workspace = object(workspaceValue, "parityWorkspace");
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
  const rawMappings = array(workspace.legacyMappings, "parityWorkspace.legacyMappings");
  const rawCoverage = array(workspace.configuredCoverage, "parityWorkspace.configuredCoverage");
  if (rawMappings.length !== nonNegativeInteger(workspace.legacyAnchorCount, "parityWorkspace.legacyAnchorCount")) {
    throw new Error("parityWorkspace legacyAnchorCount mismatch");
  }
  if (rawCoverage.length !== nonNegativeInteger(workspace.configuredAnchorCount, "parityWorkspace.configuredAnchorCount")) {
    throw new Error("parityWorkspace configuredAnchorCount mismatch");
  }

  const seenMappings = new Set<string>();
  const mappings = rawMappings.map((value, index) => {
    const mapping = object(value, `parityWorkspace.legacyMappings[${index}]`);
    const mappingHash = verifyHashEnvelope(mapping, "mappingHash", `parityWorkspace.legacyMappings[${index}]`);
    if (
      mapping.humanMappingDecision !== "pending_human_review"
      || mapping.completed !== false
      || array(mapping.selectedConfiguredAnchorIds, `parityWorkspace.legacyMappings[${index}].selectedConfiguredAnchorIds`).length !== 0
    ) {
      throw new Error(`parityWorkspace.legacyMappings[${index}] is not pending human input`);
    }
    const legacy = object(mapping.legacy, `parityWorkspace.legacyMappings[${index}].legacy`);
    const anchorId = required(legacy.anchorId, `parityWorkspace.legacyMappings[${index}].legacy.anchorId`);
    if (seenMappings.has(anchorId)) throw new Error(`parityWorkspace has duplicate legacy anchor ${anchorId}`);
    seenMappings.add(anchorId);
    return {
      anchorId,
      sourceShape: {
        legacy: mapping.legacy,
        sourceMappingHash: mappingHash,
        sameDocumentConfiguredAnchorIds: stringArray(
          mapping.sameDocumentConfiguredAnchorIds,
          `parityWorkspace.legacyMappings[${index}].sameDocumentConfiguredAnchorIds`,
        ),
        exactStructuredTextHashMatchAnchorIds: stringArray(
          mapping.exactStructuredTextHashMatchAnchorIds,
          `parityWorkspace.legacyMappings[${index}].exactStructuredTextHashMatchAnchorIds`,
        ),
        exactPdfTextHashMatchAnchorIds: stringArray(
          mapping.exactPdfTextHashMatchAnchorIds,
          `parityWorkspace.legacyMappings[${index}].exactPdfTextHashMatchAnchorIds`,
        ),
        machineRelation: required(mapping.machineRelation, `parityWorkspace.legacyMappings[${index}].machineRelation`),
      },
    };
  });

  const seenCoverage = new Set<string>();
  const coverage = rawCoverage.map((value, index) => {
    const item = object(value, `parityWorkspace.configuredCoverage[${index}]`);
    const coverageHash = verifyHashEnvelope(item, "coverageHash", `parityWorkspace.configuredCoverage[${index}]`);
    if (item.humanDisposition !== "pending_human_review" || item.completed !== false) {
      throw new Error(`parityWorkspace.configuredCoverage[${index}] is not pending human input`);
    }
    const configured = object(item.configured, `parityWorkspace.configuredCoverage[${index}].configured`);
    const anchorId = required(configured.anchorId, `parityWorkspace.configuredCoverage[${index}].configured.anchorId`);
    if (seenCoverage.has(anchorId)) throw new Error(`parityWorkspace has duplicate configured anchor ${anchorId}`);
    seenCoverage.add(anchorId);
    return {
      anchorId,
      sourceShape: {
        configured: item.configured,
        sourceCoverageHash: coverageHash,
        sameDocumentLegacyAnchorIds: stringArray(
          item.sameDocumentLegacyAnchorIds,
          `parityWorkspace.configuredCoverage[${index}].sameDocumentLegacyAnchorIds`,
        ),
        exactLegacySourceHashMatchAnchorIds: stringArray(
          item.exactLegacySourceHashMatchAnchorIds,
          `parityWorkspace.configuredCoverage[${index}].exactLegacySourceHashMatchAnchorIds`,
        ),
        machineRelation: required(item.machineRelation, `parityWorkspace.configuredCoverage[${index}].machineRelation`),
      },
    };
  });

  return { workspaceHash, mappings, coverage };
}

export function assertSanrioFoundationParityLineage(input: {
  parityWorkspace: unknown;
  parityReview: unknown;
}): void {
  const workspace = workspaceLineage(input.parityWorkspace);
  const review = object(input.parityReview, "parityReview");
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
  verifyHashEnvelope(review, "recordHash", "parityReview");
  if (hash(review.sourceWorkspaceHash, "parityReview.sourceWorkspaceHash") !== workspace.workspaceHash) {
    throw new Error("parityReview sourceWorkspaceHash mismatch");
  }

  const rawMappings = array(review.mappings, "parityReview.mappings");
  const rawCoverage = array(review.coverage, "parityReview.coverage");
  const mappingCount = nonNegativeInteger(review.mappingCount, "parityReview.mappingCount");
  const coverageCount = nonNegativeInteger(review.coverageCount, "parityReview.coverageCount");
  if (rawMappings.length !== mappingCount || rawMappings.length !== workspace.mappings.length) {
    throw new Error("parityReview mapping lineage count mismatch");
  }
  if (rawCoverage.length !== coverageCount || rawCoverage.length !== workspace.coverage.length) {
    throw new Error("parityReview coverage lineage count mismatch");
  }

  const mappingById = new Map(workspace.mappings.map(item => [item.anchorId, item]));
  const seenMappings = new Set<string>();
  for (const [index, value] of rawMappings.entries()) {
    const mapping = object(value, `parityReview.mappings[${index}]`);
    verifyHashEnvelope(mapping, "humanDecisionHash", `parityReview.mappings[${index}]`);
    const legacy = object(mapping.legacy, `parityReview.mappings[${index}].legacy`);
    const anchorId = required(legacy.anchorId, `parityReview.mappings[${index}].legacy.anchorId`);
    if (seenMappings.has(anchorId)) throw new Error(`parityReview has duplicate legacy mapping ${anchorId}`);
    seenMappings.add(anchorId);
    const source = mappingById.get(anchorId);
    if (!source) throw new Error(`parityReview contains unknown legacy mapping ${anchorId}`);
    const proposedSource = {
      legacy: mapping.legacy,
      sourceMappingHash: hash(mapping.sourceMappingHash, `parityReview mapping ${anchorId}.sourceMappingHash`),
      sameDocumentConfiguredAnchorIds: stringArray(
        mapping.sameDocumentConfiguredAnchorIds,
        `parityReview mapping ${anchorId}.sameDocumentConfiguredAnchorIds`,
      ),
      exactStructuredTextHashMatchAnchorIds: stringArray(
        mapping.exactStructuredTextHashMatchAnchorIds,
        `parityReview mapping ${anchorId}.exactStructuredTextHashMatchAnchorIds`,
      ),
      exactPdfTextHashMatchAnchorIds: stringArray(
        mapping.exactPdfTextHashMatchAnchorIds,
        `parityReview mapping ${anchorId}.exactPdfTextHashMatchAnchorIds`,
      ),
      machineRelation: required(mapping.machineRelation, `parityReview mapping ${anchorId}.machineRelation`),
    };
    if (!sameCanonical(proposedSource, source.sourceShape)) {
      throw new Error(`parityReview mapping ${anchorId} source lineage mismatch`);
    }
  }

  const coverageById = new Map(workspace.coverage.map(item => [item.anchorId, item]));
  const seenCoverage = new Set<string>();
  for (const [index, value] of rawCoverage.entries()) {
    const item = object(value, `parityReview.coverage[${index}]`);
    verifyHashEnvelope(item, "humanDecisionHash", `parityReview.coverage[${index}]`);
    const configured = object(item.configured, `parityReview.coverage[${index}].configured`);
    const anchorId = required(configured.anchorId, `parityReview.coverage[${index}].configured.anchorId`);
    if (seenCoverage.has(anchorId)) throw new Error(`parityReview has duplicate configured coverage ${anchorId}`);
    seenCoverage.add(anchorId);
    const source = coverageById.get(anchorId);
    if (!source) throw new Error(`parityReview contains unknown configured coverage ${anchorId}`);
    const proposedSource = {
      configured: item.configured,
      sourceCoverageHash: hash(item.sourceCoverageHash, `parityReview coverage ${anchorId}.sourceCoverageHash`),
      sameDocumentLegacyAnchorIds: stringArray(
        item.sameDocumentLegacyAnchorIds,
        `parityReview coverage ${anchorId}.sameDocumentLegacyAnchorIds`,
      ),
      exactLegacySourceHashMatchAnchorIds: stringArray(
        item.exactLegacySourceHashMatchAnchorIds,
        `parityReview coverage ${anchorId}.exactLegacySourceHashMatchAnchorIds`,
      ),
      machineRelation: required(item.machineRelation, `parityReview coverage ${anchorId}.machineRelation`),
    };
    if (!sameCanonical(proposedSource, source.sourceShape)) {
      throw new Error(`parityReview coverage ${anchorId} source lineage mismatch`);
    }
  }
}

export function auditSanrioConfiguredFoundationReadinessWithParityLineage(input: {
  parityReview: unknown;
  sourceParityReviewFile: string;
  parityWorkspace: unknown;
  sourceParityWorkspaceFile: string;
  configuredReview: unknown;
  sourceConfiguredReviewFile: string;
  generatedAt?: string;
}): SanrioFoundationReadinessAudit {
  assertSanrioFoundationParityLineage({
    parityWorkspace: input.parityWorkspace,
    parityReview: input.parityReview,
  });
  return auditSanrioConfiguredFoundationReadiness(input);
}
