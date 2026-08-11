import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  auditSanrioConfiguredFoundationReadiness,
  renderSanrioConfiguredFoundationReadinessAudit,
} from "../src/research/edinet-sanrio-foundation-readiness-audit.js";

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

function configuredReview(): JsonObject {
  const anchorBase = {
    anchorId: "configured:001",
    sourceResultHash: "1".repeat(64),
    sourceComparisonResult: "not_exact_normalized_match_pending_visual_review",
    expectedRelation: "visual_layout_variance_review",
    rawExactMatch: false,
    normalizedExactMatch: false,
    structured: {
      entryPath: "XBRL/PublicDoc/main.htm",
      lineNumber: 12,
      textHash: "2".repeat(64),
      normalizedTextHash: "3".repeat(64),
      normalizedLength: 18,
    },
    pdf: {
      pageNumber: 4,
      lineNumber: 7,
      textHash: "4".repeat(64),
      normalizedTextHash: "5".repeat(64),
      normalizedLength: 18,
    },
    visualConfirmation: true,
    visualDecision: "visually_equivalent",
    equivalenceDecision: "equivalent",
    confirmedFacts: ["confirmed fact that must not be copied to the readiness artifact"],
    previouslyKnownFacts: ["previously known fact that must not be copied"],
    assumptions: ["assumption that must not be copied"],
    opinions: ["opinion that must not be copied"],
    exactAmounts: [{
      amountText: "100",
      currency: "JPY",
      period: "FY2026",
      recipient: "recipient",
      payer: "payer",
      sourcePage: 4,
    }],
    accountingImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    materiality: "unknown",
    direction: "unknown",
    reviewNotes: "",
    completed: true,
  };
  const anchor = withHash(anchorBase, "decisionHash");
  const documentBase = {
    pairId: "pair:001",
    pairHash: "6".repeat(64),
    extractionHash: "7".repeat(64),
    docID: "S900DOC1",
    sourceDocumentResultHash: "8".repeat(64),
    anchorCount: 1,
    completedAnchorCount: 1,
    anchors: [anchor],
  };
  const document = withHash(documentBase, "documentDecisionHash");
  const base = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: "9".repeat(64),
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
      boundaryHash: "a".repeat(64),
    },
    sourceComparisonFile: "configured-fidelity-comparison-v1.fixture.json",
    sourceComparisonHash: "b".repeat(64),
    generatedAt: "2026-08-07T00:20:00.000Z",
    reviewer: "configured-human",
    reviewedAt: "2026-08-07T00:21:00.000Z",
    reviewStatus: "complete_human_comparison_review",
    documentCount: 1,
    anchorCount: 1,
    completedAnchorCount: 1,
    documents: [document],
    globalBlockers: ["foundation_preview_not_eligible"],
    automaticFactPromotionAuthorized: false,
    automaticImpactDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  return withHash(base, "recordHash");
}

function parityWorkspace(configured: JsonObject): JsonObject {
  const configuredAnchor = (((configured.documents as JsonObject[])[0]!.anchors as JsonObject[])[0]!);
  const configuredSnapshot = {
    anchorId: configuredAnchor.anchorId,
    docID: "S900DOC1",
    structuredTextHash: (configuredAnchor.structured as JsonObject).textHash,
    pdfTextHash: (configuredAnchor.pdf as JsonObject).textHash,
    sourceComparisonResult: configuredAnchor.sourceComparisonResult,
    visualDecision: configuredAnchor.visualDecision,
    equivalenceDecision: configuredAnchor.equivalenceDecision,
    accountingImpact: configuredAnchor.accountingImpact,
    internalControlImpact: configuredAnchor.internalControlImpact,
    auditOpinionImpact: configuredAnchor.auditOpinionImpact,
    materiality: configuredAnchor.materiality,
    direction: configuredAnchor.direction,
    confirmedFactCount: 1,
    exactAmountCount: 1,
    decisionHash: configuredAnchor.decisionHash,
  };
  const coverageBase = {
    configured: configuredSnapshot,
    sameDocumentLegacyAnchorIds: ["legacy:001"],
    exactLegacySourceHashMatchAnchorIds: ["legacy:001"],
    machineRelation: "exact_legacy_source_hash_match",
    humanDisposition: "pending_human_review",
    humanNotes: "",
    completed: false,
  };
  const coverage = withHash(coverageBase, "coverageHash");
  const mappingBase = {
    legacy: {
      anchorId: "legacy:001",
      toDocID: "S900DOC1",
      sourceTextHash: "2".repeat(64),
      pdfSha256: "c".repeat(64),
      equivalenceDecision: "equivalent_layout_variance",
      correctionScope: "governance_disclosure_only",
      financialStatementImpact: "unknown",
      internalControlImpact: "unknown",
      auditOpinionImpact: "unknown",
      confirmedFactCount: 1,
      exactAmountCount: 0,
      anchorDecisionHash: "d".repeat(64),
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
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
      boundaryHash: "a".repeat(64),
    },
    registryHash: "9".repeat(64),
    sourceInventoryAuditFile: "sanrio-edinet-inventory-compatibility-v1.fixture.json",
    sourceInventoryAuditHash: "e".repeat(64),
    sourceLegacyReviewPath: "sanrio-acquisition.fixture/revision-human-review-record-v1.fixture.json",
    sourceLegacyReviewHash: "f".repeat(64),
    sourceConfiguredReviewPath: "sanrio-acquisition.fixture/configured-human-comparison-record-v1.fixture.json",
    sourceConfiguredReviewHash: configured.recordHash,
    generatedAt: "2026-08-07T00:22:00.000Z",
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

function parityReview(workspace: JsonObject): JsonObject {
  const sourceMapping = (workspace.legacyMappings as JsonObject[])[0]!;
  const legacy = sourceMapping.legacy as JsonObject;
  const mappingBase = {
    legacy,
    sourceMappingHash: sourceMapping.mappingHash,
    sameDocumentConfiguredAnchorIds: sourceMapping.sameDocumentConfiguredAnchorIds,
    exactStructuredTextHashMatchAnchorIds: sourceMapping.exactStructuredTextHashMatchAnchorIds,
    exactPdfTextHashMatchAnchorIds: sourceMapping.exactPdfTextHashMatchAnchorIds,
    machineRelation: sourceMapping.machineRelation,
    selectedConfiguredAnchorIds: ["configured:001"],
    humanMappingDecision: "equivalent_evidence_coverage",
    humanNotes: "",
    completed: true,
  };
  const mapping = withHash(mappingBase, "humanDecisionHash");
  const sourceCoverage = (workspace.configuredCoverage as JsonObject[])[0]!;
  const coverageBase = {
    configured: sourceCoverage.configured,
    sourceCoverageHash: sourceCoverage.coverageHash,
    sameDocumentLegacyAnchorIds: sourceCoverage.sameDocumentLegacyAnchorIds,
    exactLegacySourceHashMatchAnchorIds: sourceCoverage.exactLegacySourceHashMatchAnchorIds,
    machineRelation: sourceCoverage.machineRelation,
    humanDisposition: "mapped_to_legacy_evidence",
    humanNotes: "",
    completed: true,
  };
  const coverage = withHash(coverageBase, "humanDecisionHash");
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: workspace.issuer,
    registryHash: workspace.registryHash,
    sourceWorkspaceFile: "legacy-configured-parity-workspace-v1.fixture.json",
    sourceWorkspaceHash: workspace.workspaceHash,
    generatedAt: "2026-08-07T00:23:00.000Z",
    reviewer: "parity-human",
    reviewedAt: "2026-08-07T00:24:00.000Z",
    inventoryAuditHumanConfirmed: true,
    mappingCount: 1,
    completedMappingCount: 1,
    coverageCount: 1,
    completedCoverageCount: 1,
    materiallyInconsistentMappingCount: 0,
    blockingCoverageCount: 0,
    insufficientEvidenceCount: 0,
    mappings: [mapping],
    coverage: [coverage],
    replacementRecommendation: "recommend_configured_replacement",
    replacementRationale: "Human parity review supports a future separately reviewed change.",
    reviewStatus: "complete_human_parity_review",
    globalBlockers: ["replacement_not_authorized"],
    semanticEquivalenceInferred: false,
    automaticMappingDecisionAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    legacyEntryPointMutationAuthorized: false,
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  return withHash(base, "recordHash");
}

function setup() {
  const configured = configuredReview();
  const workspace = parityWorkspace(configured);
  const parity = parityReview(workspace);
  return { configured, workspace, parity };
}

function audit(input = setup(), generatedAt = "2026-08-07T00:25:00.000Z") {
  return auditSanrioConfiguredFoundationReadiness({
    parityReview: input.parity,
    sourceParityReviewFile: "legacy-configured-parity-review-record-v1.fixture.json",
    parityWorkspace: input.workspace,
    sourceParityWorkspaceFile: "legacy-configured-parity-workspace-v1.fixture.json",
    configuredReview: input.configured,
    sourceConfiguredReviewFile: "configured-human-comparison-record-v1.fixture.json",
    generatedAt,
  });
}

{
  const result = audit();
  assert.equal(result.readinessStatus, "blocked_missing_foundation_mapping_evidence");
  assert.equal(result.foundationMappingGateReady, false);
  assert.equal(result.automaticFieldSynthesisAuthorized, false);
  assert.equal(result.legacyEntryPointMutationAuthorized, false);
  assert.equal(result.replacementAuthorized, false);
  assert.equal(result.foundationPreviewEligible, false);
  assert.equal(result.appendAuthorized, false);
  assert.ok(result.missingFields.includes("entityIds"));
  assert.ok(result.missingFields.includes("sourceContentHash"));
  assert.ok(result.missingFields.includes("publishedAt"));
  assert.ok(result.missingFields.includes("firstExecutableAt"));
  assert.ok(result.missingFields.includes("license"));
  assert.ok(result.missingFields.includes("sections[].titleHash"));
  const sourceHashGroup = result.readinessGroups.find(item => item.groupId === "document_metadata")!;
  assert.equal(sourceHashGroup.status, "missing_required_evidence");
  assert.match(sourceHashGroup.note, /must not be promoted/);
  const sectionGroup = result.readinessGroups.find(item => item.groupId === "section_mapping")!;
  assert.equal(sectionGroup.status, "partial_navigation_only");
  assert.match(result.auditHash, /^[a-f0-9]{64}$/);
  const markdown = renderSanrioConfiguredFoundationReadinessAudit(result);
  assert.match(markdown, /blocked_missing_foundation_mapping_evidence/);
  console.log("edinet-sanrio-foundation-readiness-audit: measured Foundation evidence gap remains fail-closed OK");
}

{
  const result = audit();
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("confirmed fact that must not be copied"));
  assert.ok(!serialized.includes("previously known fact that must not be copied"));
  assert.ok(!serialized.includes("assumption that must not be copied"));
  assert.ok(!serialized.includes("opinion that must not be copied"));
  console.log("edinet-sanrio-foundation-readiness-audit: reviewed source strings are not copied OK");
}

{
  const input = setup();
  input.configured.reviewer = "tampered";
  assert.throws(() => audit(input), /configuredReview\.recordHash mismatch/);
  console.log("edinet-sanrio-foundation-readiness-audit: configured outer hash tampering blocked OK");
}

{
  const input = setup();
  const document = (input.configured.documents as JsonObject[])[0]!;
  const anchor = (document.anchors as JsonObject[])[0]!;
  anchor.confirmedFacts = ["tampered nested fact"];
  const { recordHash: _oldHash, ...withoutHash } = input.configured;
  input.configured.recordHash = digest(withoutHash);
  assert.throws(() => audit(input), /documentDecisionHash mismatch/);
  console.log("edinet-sanrio-foundation-readiness-audit: configured nested hash tampering blocked OK");
}

{
  const input = setup();
  input.workspace.sourceConfiguredReviewHash = "0".repeat(64);
  const { workspaceHash: _oldHash, ...withoutHash } = input.workspace;
  input.workspace.workspaceHash = digest(withoutHash);
  input.parity.sourceWorkspaceHash = input.workspace.workspaceHash;
  const { recordHash: _oldParityHash, ...withoutParityHash } = input.parity;
  input.parity.recordHash = digest(withoutParityHash);
  assert.throws(() => audit(input), /sourceConfiguredReviewHash mismatch/);
  console.log("edinet-sanrio-foundation-readiness-audit: configured review lineage mismatch blocked OK");
}

{
  const input = setup();
  input.parity.mappings = [];
  const { recordHash: _oldHash, ...withoutHash } = input.parity;
  input.parity.recordHash = digest(withoutHash);
  assert.throws(() => audit(input), /parityReview mappingCount mismatch/);
  console.log("edinet-sanrio-foundation-readiness-audit: declared mapping count must match actual mappings OK");
}

{
  const input = setup();
  input.parity.coverage = [];
  const { recordHash: _oldHash, ...withoutHash } = input.parity;
  input.parity.recordHash = digest(withoutHash);
  assert.throws(() => audit(input), /parityReview coverageCount mismatch/);
  console.log("edinet-sanrio-foundation-readiness-audit: declared coverage count must match actual coverage OK");
}

{
  const input = setup();
  input.parity.replacementAuthorized = true;
  const { recordHash: _oldHash, ...withoutHash } = input.parity;
  input.parity.recordHash = digest(withoutHash);
  assert.throws(() => audit(input), /parityReview safety boundary is invalid/);
  console.log("edinet-sanrio-foundation-readiness-audit: unsafe replacement boundary blocked OK");
}

{
  const input = setup();
  input.configured.reviewedAt = "2026-08-07T24:00:00Z";
  const { recordHash: _oldHash, ...withoutHash } = input.configured;
  input.configured.recordHash = digest(withoutHash);
  assert.throws(
    () => audit(input),
    /configuredReview\.reviewedAt must be a valid Gregorian ISO-8601 timestamp/,
  );
  console.log("edinet-sanrio-foundation-readiness-audit: normalized 24-hour reviewedAt blocked OK");
}

{
  assert.throws(
    () => audit(setup(), "2026-08-07T00:25:00"),
    /generatedAt must be an ISO-8601 timestamp with explicit timezone/,
  );
  console.log("edinet-sanrio-foundation-readiness-audit: timezone-less generatedAt blocked OK");
}

{
  const result = audit(setup(), "2026-08-07T09:25:00+09:00");
  assert.equal(result.generatedAt, "2026-08-07T09:25:00+09:00");
  console.log("edinet-sanrio-foundation-readiness-audit: explicit offset generatedAt accepted OK");
}

console.log("edinet-sanrio-foundation-readiness-audit.test.ts passed");
