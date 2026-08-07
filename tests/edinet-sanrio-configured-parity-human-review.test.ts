import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioParityHumanReviewTemplate,
  finalizeSanrioParityHumanReview,
  renderSanrioParityHumanReview,
} from "../src/research/edinet-sanrio-configured-parity-human-review.js";

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

function workspace(): JsonObject {
  const legacy = {
    anchorId: "legacy:001",
    toDocID: "S900DOC1",
    sourceTextHash: "a".repeat(64),
    pdfSha256: "b".repeat(64),
    equivalenceDecision: "equivalent_layout_variance",
    correctionScope: "governance_disclosure_only",
    financialStatementImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    confirmedFactCount: 1,
    exactAmountCount: 0,
    anchorDecisionHash: "c".repeat(64),
  };
  const mappingBase = {
    legacy,
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
  const configured = {
    anchorId: "configured:001",
    docID: "S900DOC1",
    structuredTextHash: "a".repeat(64),
    pdfTextHash: "d".repeat(64),
    sourceComparisonResult: "not_exact_normalized_match_pending_visual_review",
    visualDecision: "visually_equivalent",
    equivalenceDecision: "equivalent",
    accountingImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    materiality: "unknown",
    direction: "unknown",
    confirmedFactCount: 1,
    exactAmountCount: 0,
    decisionHash: "e".repeat(64),
  };
  const coverageBase = {
    configured,
    sameDocumentLegacyAnchorIds: ["legacy:001"],
    exactLegacySourceHashMatchAnchorIds: ["legacy:001"],
    machineRelation: "exact_legacy_source_hash_match",
    humanDisposition: "pending_human_review",
    humanNotes: "",
    completed: false,
  };
  const coverage = withHash(coverageBase, "coverageHash");
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
      boundaryHash: "f".repeat(64),
    },
    registryHash: "1".repeat(64),
    sourceInventoryAuditFile: "sanrio-edinet-inventory-compatibility-v1.fixture.json",
    sourceInventoryAuditHash: "2".repeat(64),
    sourceLegacyReviewPath: "sanrio-acquisition.fixture/revision-human-review-record-v1.fixture.json",
    sourceLegacyReviewHash: "3".repeat(64),
    sourceConfiguredReviewPath: "sanrio-acquisition.fixture/configured-human-comparison-record-v1.fixture.json",
    sourceConfiguredReviewHash: "4".repeat(64),
    generatedAt: "2026-08-07T00:10:00.000Z",
    sharedDocumentCount: 1,
    legacyAnchorCount: 1,
    configuredAnchorCount: 1,
    legacyAnchorsWithExactHashMatch: 1,
    configuredAnchorsWithExactHashMatch: 1,
    machineStatus: "parity_workspace_ready_for_human_mapping",
    legacyMappings: [mapping],
    configuredCoverage: [coverage],
    globalBlockers: ["human_replacement_decision_required"],
    semanticEquivalenceInferred: false,
    automaticAnchorMappingAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    replacementReviewStatus: "pending_human_review",
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  return withHash(base, "workspaceHash");
}

function template(source = workspace()): JsonObject {
  return buildSanrioParityHumanReviewTemplate({
    workspace: source,
    sourceWorkspaceFile: "legacy-configured-parity-workspace-v1.fixture.json",
    generatedAt: "2026-08-07T00:11:00.000Z",
  }) as unknown as JsonObject;
}

function complete(input: JsonObject, options: {
  mappingDecision?: string;
  coverageDisposition?: string;
  recommendation?: string;
  mappingNotes?: string;
  coverageNotes?: string;
  selected?: string[];
} = {}): JsonObject {
  const edited = structuredClone(input) as JsonObject;
  edited.reviewer = "parity-human";
  edited.reviewedAt = "2026-08-07T00:12:00.000Z";
  edited.inventoryAuditHumanConfirmed = true;
  edited.replacementRecommendation = options.recommendation ?? "recommend_configured_replacement";
  edited.replacementRationale = "Human reviewed both parity directions and the inventory audit.";
  const mapping = (edited.mappings as JsonObject[])[0]!;
  mapping.selectedConfiguredAnchorIds = options.selected ?? ["configured:001"];
  mapping.humanMappingDecision = options.mappingDecision ?? "equivalent_evidence_coverage";
  mapping.humanNotes = options.mappingNotes ?? "";
  mapping.completed = true;
  const coverage = (edited.coverage as JsonObject[])[0]!;
  coverage.humanDisposition = options.coverageDisposition ?? "mapped_to_legacy_evidence";
  coverage.humanNotes = options.coverageNotes ?? "";
  coverage.completed = true;
  return edited;
}

function finalize(source: JsonObject, edited: JsonObject) {
  return finalizeSanrioParityHumanReview({
    workspace: source,
    sourceWorkspaceFile: "legacy-configured-parity-workspace-v1.fixture.json",
    editedReviewInput: edited,
    generatedAt: "2026-08-07T00:13:00.000Z",
  });
}

{
  const source = workspace();
  const draft = template(source);
  assert.equal(draft.reviewStatus, "draft_human_input");
  assert.equal(draft.inventoryAuditHumanConfirmed, false);
  assert.equal(draft.replacementRecommendation, "pending_human_review");
  assert.equal((draft.mappings as JsonObject[])[0]!.humanMappingDecision, "pending_human_review");
  assert.equal((draft.coverage as JsonObject[])[0]!.humanDisposition, "pending_human_review");
  assert.equal(draft.replacementAuthorized, false);
  console.log("edinet-sanrio-configured-parity-human-review: deterministic pending template OK");
}

{
  const source = workspace();
  const record = finalize(source, complete(template(source)));
  assert.equal(record.reviewStatus, "complete_human_parity_review");
  assert.equal(record.inventoryAuditHumanConfirmed, true);
  assert.equal(record.completedMappingCount, 1);
  assert.equal(record.completedCoverageCount, 1);
  assert.equal(record.replacementRecommendation, "recommend_configured_replacement");
  assert.equal(record.materiallyInconsistentMappingCount, 0);
  assert.equal(record.blockingCoverageCount, 0);
  assert.equal(record.insufficientEvidenceCount, 0);
  assert.equal(record.legacyEntryPointMutationAuthorized, false);
  assert.equal(record.replacementAuthorized, false);
  assert.equal(record.appendAuthorized, false);
  assert.match(record.recordHash, /^[a-f0-9]{64}$/);
  const markdown = renderSanrioParityHumanReview(record);
  assert.match(markdown, /never changes the legacy entry point by itself/);
  console.log("edinet-sanrio-configured-parity-human-review: replacement recommendation remains non-authorizing OK");
}

{
  const source = workspace();
  const edited = complete(template(source));
  edited.inventoryAuditHumanConfirmed = false;
  assert.throws(() => finalize(source, edited), /requires inventory audit human confirmation/);
  console.log("edinet-sanrio-configured-parity-human-review: inventory audit human confirmation required OK");
}

{
  const source = workspace();
  const edited = complete(template(source), { selected: ["configured:999"] });
  assert.throws(() => finalize(source, edited), /not a same-document configured candidate/);
  console.log("edinet-sanrio-configured-parity-human-review: cross-document or unknown mapping selection blocked OK");
}

{
  const source = workspace();
  const edited = complete(template(source), { coverageDisposition: "additional_coverage_acceptable" });
  assert.throws(() => finalize(source, edited), /must be mapped_to_legacy_evidence/);
  console.log("edinet-sanrio-configured-parity-human-review: selected configured coverage consistency enforced OK");
}

{
  const source = workspace();
  const edited = complete(template(source), {
    mappingDecision: "materially_inconsistent",
    mappingNotes: "Legacy and configured reviewed evidence conflict.",
    recommendation: "recommend_configured_replacement",
  });
  assert.throws(() => finalize(source, edited), /cannot recommend configured replacement/);
  console.log("edinet-sanrio-configured-parity-human-review: configured replacement recommendation blocked by material inconsistency OK");
}

{
  const source = workspace();
  const edited = complete(template(source), {
    mappingDecision: "materially_inconsistent",
    mappingNotes: "",
    recommendation: "recommend_keep_legacy",
  });
  assert.throws(() => finalize(source, edited), /requires human notes/);
  console.log("edinet-sanrio-configured-parity-human-review: risky mapping decision requires notes OK");
}

{
  const source = workspace();
  const edited = complete(template(source));
  const mapping = (edited.mappings as JsonObject[])[0]!;
  mapping.machineRelation = "tampered_relation";
  assert.throws(() => finalize(source, edited), /source fields changed/);
  console.log("edinet-sanrio-configured-parity-human-review: immutable machine source fields protected OK");
}

{
  const source = workspace();
  const mapping = (source.legacyMappings as JsonObject[])[0]!;
  mapping.machineRelation = "tampered_relation";
  const { workspaceHash: _oldWorkspaceHash, ...withoutHash } = source;
  source.workspaceHash = digest(withoutHash);
  assert.throws(() => template(source), /mappingHash mismatch/);
  console.log("edinet-sanrio-configured-parity-human-review: nested workspace tampering blocked OK");
}

{
  const source = workspace();
  const edited = complete(template(source));
  edited.replacementAuthorized = true;
  assert.throws(() => finalize(source, edited), /reviewInput safety boundary is invalid/);
  console.log("edinet-sanrio-configured-parity-human-review: unsafe replacement boundary blocked OK");
}

console.log("edinet-sanrio-configured-parity-human-review.test.ts passed");
