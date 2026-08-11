import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioLegacyConfiguredParityWorkspace,
  renderSanrioLegacyConfiguredParityWorkspace,
} from "../src/research/edinet-sanrio-configured-parity-workspace.js";

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

function textHash(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function withHash<T extends JsonObject>(base: T, field: string): T & Record<string, string> {
  return { ...base, [field]: digest(base) };
}

function inventoryAudit(): JsonObject {
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { issuerKey: "sanrio", edinetCode: "E02655", secCode: "81360" },
    registryHash: "a".repeat(64),
    boundaryHash: "b".repeat(64),
    equivalentCoreCandidateSet: true,
    migrationReadyForHumanReview: true,
    reviewStatus: "pending_human_review",
    mismatchCandidateCount: 0,
    legacyOnlyCandidateCount: 0,
    configuredOnlyCandidateCount: 0,
    replacementAuthorized: false,
    appendAuthorized: false,
  };
  return withHash(base, "auditHash");
}

function legacyReview(sourceText = "same evidence", docID = "S900DOC1"): JsonObject {
  const anchorBase = {
    anchorId: "legacy:001",
    candidateId: "candidate:001",
    toDocID: docID,
    path: "XBRL/PublicDoc/main.htm",
    pdfBinaryFile: `${docID}.type2.pdf`,
    pdfSha256: "c".repeat(64),
    sourceLineNumber: 7,
    sourceText,
    contextCount: 1,
    availableContextPages: [2],
    equivalenceDecision: "equivalent_layout_variance",
    selectedContextNumbers: [1],
    manualPdfPages: [2],
    confirmedFacts: ["human confirmed legacy fact"],
    previouslyKnownFacts: [],
    assumptions: [],
    opinions: [],
    exactAmounts: [],
    correctionScope: "governance_disclosure_only",
    financialStatementImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    pdfVisualConfirmation: true,
    reviewerNotes: "checked",
    completed: true,
  };
  const anchor = withHash(anchorBase, "anchorDecisionHash");
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360" },
    sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
    sourceInspectionHash: "d".repeat(64),
    generatedAt: "2026-08-07T00:00:00.000Z",
    reviewer: "legacy-human",
    reviewedAt: "2026-08-07T00:01:00.000Z",
    reviewStatus: "complete_human_review",
    anchorCount: 1,
    completedAnchorCount: 1,
    anchors: [anchor],
    foundationPreviewEligible: false,
    globalBlockers: ["foundation_preview_not_authorized"],
    appendAuthorized: false,
  };
  return withHash(base, "recordHash");
}

function configuredReview(input: { structuredText?: string; pdfText?: string; docID?: string } = {}): JsonObject {
  const docID = input.docID ?? "S900DOC1";
  const structuredText = input.structuredText ?? "same evidence";
  const pdfText = input.pdfText ?? "pdf layout evidence";
  const anchorBase = {
    anchorId: "configured:001",
    sourceResultHash: "e".repeat(64),
    sourceComparisonResult: "not_exact_normalized_match_pending_visual_review",
    expectedRelation: "visual_layout_variance_review",
    rawExactMatch: false,
    normalizedExactMatch: false,
    structured: {
      entryPath: "XBRL/PublicDoc/main.htm",
      lineNumber: 7,
      textHash: textHash(structuredText),
      normalizedTextHash: "f".repeat(64),
      normalizedLength: 13,
    },
    pdf: {
      pageNumber: 2,
      lineNumber: 4,
      textHash: textHash(pdfText),
      normalizedTextHash: "1".repeat(64),
      normalizedLength: 17,
    },
    visualConfirmation: true,
    visualDecision: "visually_equivalent",
    equivalenceDecision: "equivalent",
    confirmedFacts: ["human confirmed configured fact"],
    previouslyKnownFacts: [],
    assumptions: [],
    opinions: [],
    exactAmounts: [],
    accountingImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    materiality: "unknown",
    direction: "unknown",
    reviewNotes: "checked",
    completed: true,
  };
  const anchor = withHash(anchorBase, "decisionHash");
  const documentBase = {
    pairId: "pair:001",
    pairHash: "2".repeat(64),
    extractionHash: "3".repeat(64),
    docID,
    sourceDocumentResultHash: "4".repeat(64),
    anchorCount: 1,
    completedAnchorCount: 1,
    anchors: [anchor],
  };
  const document = withHash(documentBase, "documentDecisionHash");
  const base = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: "a".repeat(64),
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
      boundaryHash: "b".repeat(64),
    },
    sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
    sourceComparisonHash: "5".repeat(64),
    generatedAt: "2026-08-07T00:02:00.000Z",
    reviewer: "configured-human",
    reviewedAt: "2026-08-07T00:03:00.000Z",
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

function build(input: {
  audit?: unknown;
  legacy?: unknown;
  configured?: unknown;
  generatedAt?: string;
} = {}) {
  return buildSanrioLegacyConfiguredParityWorkspace({
    inventoryAudit: input.audit ?? inventoryAudit(),
    sourceInventoryAuditFile: "sanrio-edinet-inventory-compatibility-v1.fixture.json",
    legacyReview: input.legacy ?? legacyReview(),
    sourceLegacyReviewPath: "sanrio-acquisition.fixture/revision-human-review-record-v1.fixture.json",
    configuredReview: input.configured ?? configuredReview(),
    sourceConfiguredReviewPath: "sanrio-acquisition.fixture/configured-human-comparison-record-v1.fixture.json",
    generatedAt: input.generatedAt ?? "2026-08-07T00:04:00.000Z",
  });
}

{
  const workspace = build();
  assert.equal(workspace.machineStatus, "parity_workspace_ready_for_human_mapping");
  assert.equal(workspace.sharedDocumentCount, 1);
  assert.equal(workspace.legacyAnchorCount, 1);
  assert.equal(workspace.configuredAnchorCount, 1);
  assert.equal(workspace.legacyAnchorsWithExactHashMatch, 1);
  assert.equal(workspace.configuredAnchorsWithExactHashMatch, 1);
  assert.equal(workspace.legacyMappings[0]!.machineRelation, "exact_structured_hash_match");
  assert.deepEqual(workspace.legacyMappings[0]!.exactStructuredTextHashMatchAnchorIds, ["configured:001"]);
  assert.equal(workspace.configuredCoverage[0]!.machineRelation, "exact_legacy_source_hash_match");
  assert.equal(workspace.semanticEquivalenceInferred, false);
  assert.equal(workspace.automaticAnchorMappingAuthorized, false);
  assert.equal(workspace.replacementAuthorized, false);
  assert.equal(workspace.appendAuthorized, false);
  assert.ok(!JSON.stringify(workspace).includes("same evidence"));
  assert.match(workspace.workspaceHash, /^[a-f0-9]{64}$/);
  const markdown = renderSanrioLegacyConfiguredParityWorkspace(workspace);
  assert.match(markdown, /Exact hash matches are navigation evidence only/);
  console.log("edinet-sanrio-configured-parity-workspace: exact hash navigation without semantic inference OK");
}

{
  for (const generatedAt of ["2026-08-07T00:04:00", "2026-02-30T00:04:00Z", "2026-08-07T00:04:00-00:00"]) {
    assert.throws(() => build({ generatedAt }), /generatedAt/);
  }
  assert.equal(build({ generatedAt: "2026-08-07T09:04:00+09:00" }).generatedAt, "2026-08-07T09:04:00+09:00");
  console.log("edinet-sanrio-configured-parity-workspace: generatedAt strict explicit-timezone boundary OK");
}

{
  const workspace = build({ configured: configuredReview({ structuredText: "different", pdfText: "also different" }) });
  assert.equal(workspace.legacyMappings[0]!.machineRelation, "same_document_no_exact_hash_match");
  assert.equal(workspace.configuredCoverage[0]!.machineRelation, "same_document_no_legacy_exact_hash_match");
  console.log("edinet-sanrio-configured-parity-workspace: same-document mismatch remains human mapping pending OK");
}

{
  const workspace = build({ configured: configuredReview({ docID: "S900DOC2" }) });
  assert.equal(workspace.sharedDocumentCount, 0);
  assert.equal(workspace.legacyMappings[0]!.machineRelation, "no_configured_document");
  assert.equal(workspace.configuredCoverage[0]!.machineRelation, "no_legacy_document");
  console.log("edinet-sanrio-configured-parity-workspace: missing shared document is explicit OK");
}

{
  const audit = inventoryAudit();
  audit.migrationReadyForHumanReview = false;
  const { auditHash: _old, ...withoutHash } = audit;
  audit.auditHash = digest(withoutHash);
  assert.throws(() => build({ audit }), /not ready for parity human review/);
  console.log("edinet-sanrio-configured-parity-workspace: non-ready inventory audit blocked OK");
}

{
  const configured = configuredReview();
  configured.registryHash = "9".repeat(64);
  const { recordHash: _old, ...withoutHash } = configured;
  configured.recordHash = digest(withoutHash);
  assert.throws(() => build({ configured }), /registryHash does not match inventory audit/);
  console.log("edinet-sanrio-configured-parity-workspace: registry drift blocked OK");
}

{
  const legacy = legacyReview();
  const anchor = (legacy.anchors as JsonObject[])[0]!;
  anchor.sourceText = "tampered source";
  const { recordHash: _oldRecordHash, ...recordWithoutHash } = legacy;
  legacy.recordHash = digest(recordWithoutHash);
  assert.throws(() => build({ legacy }), /anchorDecisionHash mismatch/);
  console.log("edinet-sanrio-configured-parity-workspace: legacy nested tampering blocked OK");
}

{
  const configured = configuredReview();
  const document = (configured.documents as JsonObject[])[0]!;
  const anchor = (document.anchors as JsonObject[])[0]!;
  anchor.equivalenceDecision = "substantively_different";
  const { documentDecisionHash: _oldDocumentHash, ...documentWithoutHash } = document;
  document.documentDecisionHash = digest(documentWithoutHash);
  const { recordHash: _oldRecordHash, ...recordWithoutHash } = configured;
  configured.recordHash = digest(recordWithoutHash);
  assert.throws(() => build({ configured }), /decisionHash mismatch/);
  console.log("edinet-sanrio-configured-parity-workspace: configured nested anchor tampering blocked OK");
}

{
  const audit = inventoryAudit();
  audit.replacementAuthorized = true;
  const { auditHash: _old, ...withoutHash } = audit;
  audit.auditHash = digest(withoutHash);
  assert.throws(() => build({ audit }), /not ready for parity human review/);
  console.log("edinet-sanrio-configured-parity-workspace: unsafe replacement boundary blocked OK");
}

console.log("edinet-sanrio-configured-parity-workspace.test.ts passed");
