import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertSanrioFoundationParityLineage,
} from "../src/research/edinet-sanrio-foundation-readiness-parity-lineage.js";

type JsonObject = Record<string, unknown>;

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

function withHash<T extends JsonObject>(base: T, field: string): T & Record<string, string> {
  return { ...base, [field]: digest(base) };
}

function fixture(): { workspace: JsonObject; review: JsonObject } {
  const mappingBase = {
    legacy: {
      anchorId: "legacy:001",
      toDocID: "S900DOC1",
      sourceTextHash: "1".repeat(64),
      anchorDecisionHash: "2".repeat(64),
    },
    sameDocumentConfiguredAnchorIds: ["configured:001"],
    exactStructuredTextHashMatchAnchorIds: ["configured:001"],
    exactPdfTextHashMatchAnchorIds: [],
    machineRelation: "exact_structured_hash_match",
    selectedConfiguredAnchorIds: [],
    humanMappingDecision: "pending_human_review",
    humanNotes: "",
    completed: false,
  };
  const mapping = withHash(mappingBase, "mappingHash");
  const coverageBase = {
    configured: {
      anchorId: "configured:001",
      docID: "S900DOC1",
      structuredTextHash: "3".repeat(64),
      pdfTextHash: "4".repeat(64),
      decisionHash: "5".repeat(64),
    },
    sameDocumentLegacyAnchorIds: ["legacy:001"],
    exactLegacySourceHashMatchAnchorIds: ["legacy:001"],
    machineRelation: "exact_legacy_source_hash_match",
    humanDisposition: "pending_human_review",
    humanNotes: "",
    completed: false,
  };
  const coverage = withHash(coverageBase, "coverageHash");
  const workspaceBase = {
    schemaVersion: 1,
    source: "edinet",
    legacyAnchorCount: 1,
    configuredAnchorCount: 1,
    machineStatus: "parity_workspace_ready_for_human_mapping",
    legacyMappings: [mapping],
    configuredCoverage: [coverage],
    semanticEquivalenceInferred: false,
    automaticAnchorMappingAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    replacementReviewStatus: "pending_human_review",
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const workspace = withHash(workspaceBase, "workspaceHash");

  const reviewMappingBase = {
    legacy: mapping.legacy,
    sourceMappingHash: mapping.mappingHash,
    sameDocumentConfiguredAnchorIds: mapping.sameDocumentConfiguredAnchorIds,
    exactStructuredTextHashMatchAnchorIds: mapping.exactStructuredTextHashMatchAnchorIds,
    exactPdfTextHashMatchAnchorIds: mapping.exactPdfTextHashMatchAnchorIds,
    machineRelation: mapping.machineRelation,
    selectedConfiguredAnchorIds: ["configured:001"],
    humanMappingDecision: "equivalent_evidence_coverage",
    humanNotes: "",
    completed: true,
  };
  const reviewMapping = withHash(reviewMappingBase, "humanDecisionHash");
  const reviewCoverageBase = {
    configured: coverage.configured,
    sourceCoverageHash: coverage.coverageHash,
    sameDocumentLegacyAnchorIds: coverage.sameDocumentLegacyAnchorIds,
    exactLegacySourceHashMatchAnchorIds: coverage.exactLegacySourceHashMatchAnchorIds,
    machineRelation: coverage.machineRelation,
    humanDisposition: "mapped_to_legacy_evidence",
    humanNotes: "",
    completed: true,
  };
  const reviewCoverage = withHash(reviewCoverageBase, "humanDecisionHash");
  const reviewBase = {
    schemaVersion: 1,
    source: "edinet",
    sourceWorkspaceHash: workspace.workspaceHash,
    reviewStatus: "complete_human_parity_review",
    inventoryAuditHumanConfirmed: true,
    mappingCount: 1,
    completedMappingCount: 1,
    coverageCount: 1,
    completedCoverageCount: 1,
    mappings: [reviewMapping],
    coverage: [reviewCoverage],
    semanticEquivalenceInferred: false,
    automaticMappingDecisionAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    legacyEntryPointMutationAuthorized: false,
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const review = withHash(reviewBase, "recordHash");
  return { workspace, review };
}

function rehashRecord(record: JsonObject, field: string): void {
  const { [field]: _oldHash, ...withoutHash } = record;
  record[field] = digest(withoutHash);
}

{
  const { workspace, review } = fixture();
  assert.doesNotThrow(() => assertSanrioFoundationParityLineage({ parityWorkspace: workspace, parityReview: review }));
  console.log("edinet-sanrio-foundation-readiness-parity-lineage: exact workspace source lineage passes OK");
}

{
  const { workspace, review } = fixture();
  const mapping = (review.mappings as JsonObject[])[0]!;
  mapping.sameDocumentConfiguredAnchorIds = ["configured:forged"];
  rehashRecord(mapping, "humanDecisionHash");
  rehashRecord(review, "recordHash");
  assert.throws(
    () => assertSanrioFoundationParityLineage({ parityWorkspace: workspace, parityReview: review }),
    /mapping legacy:001 source lineage mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-lineage: rehashed mapping source drift blocked OK");
}

{
  const { workspace, review } = fixture();
  const coverage = (review.coverage as JsonObject[])[0]!;
  coverage.machineRelation = "forged_relation";
  rehashRecord(coverage, "humanDecisionHash");
  rehashRecord(review, "recordHash");
  assert.throws(
    () => assertSanrioFoundationParityLineage({ parityWorkspace: workspace, parityReview: review }),
    /coverage configured:001 source lineage mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-lineage: rehashed coverage source drift blocked OK");
}

{
  const { workspace, review } = fixture();
  const mapping = (workspace.legacyMappings as JsonObject[])[0]!;
  mapping.machineRelation = "forged_workspace_relation";
  rehashRecord(workspace, "workspaceHash");
  review.sourceWorkspaceHash = workspace.workspaceHash;
  rehashRecord(review, "recordHash");
  assert.throws(
    () => assertSanrioFoundationParityLineage({ parityWorkspace: workspace, parityReview: review }),
    /parityWorkspace\.legacyMappings\[0\]\.mappingHash mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-lineage: workspace nested hash drift blocked OK");
}

{
  const { workspace, review } = fixture();
  review.mappings = [];
  review.mappingCount = 0;
  review.completedMappingCount = 0;
  rehashRecord(review, "recordHash");
  assert.throws(
    () => assertSanrioFoundationParityLineage({ parityWorkspace: workspace, parityReview: review }),
    /mapping lineage count mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-lineage: omitted workspace mapping blocked OK");
}

console.log("edinet-sanrio-foundation-readiness-parity-lineage.test.ts passed");
