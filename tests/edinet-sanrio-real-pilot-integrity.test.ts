import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSanrioRealPilotPreflightIntegrity,
} from "../src/research/edinet-sanrio-real-pilot-integrity.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

type JsonObject = Record<string, unknown>;
const H = "a".repeat(64);
const OTHER_H = "b".repeat(64);

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

function envelope(base: JsonObject, field: "recordHash" | "workspaceHash"): JsonObject {
  return { ...base, [field]: digest(base) };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function fixture(): {
  root: string;
  acquisition: string;
  configuredAcquisition: string;
  result: SanrioRealPilotPreflightResult;
  inspection: JsonObject;
  decision: JsonObject;
  inventory: JsonObject;
  configured: JsonObject;
  workspace: JsonObject;
  parityRecord: JsonObject;
} {
  const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-integrity-"));
  const root = join(base, "data", "edinet");
  const acquisition = join(root, "sanrio-acquisition.legacy");
  const configuredAcquisition = join(root, "sanrio-acquisition.configured");
  mkdirSync(acquisition, { recursive: true });
  mkdirSync(configuredAcquisition, { recursive: true });

  const inspectionBase = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360" },
    sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
    sourceFidelityReportHash: H,
    generatedAt: "2026-08-07T00:00:00.000Z",
    candidateCount: 1,
    unmatchedAnchorCount: 1,
    contextCandidateCount: 1,
    reviewStatus: "pending_human_review",
    candidates: [{ candidateId: "c1", anchors: [] }],
    globalBlockers: [],
    appendAuthorized: false,
  };
  const inspectionHash = digest({
    schemaVersion: 1,
    source: "edinet",
    sourceFidelityReportHash: H,
    candidates: inspectionBase.candidates,
    appendAuthorized: false,
  });
  const inspection = { ...inspectionBase, reportHash: inspectionHash };
  const inspectionName = "revision-unmatched-anchor-inspection-v1.fixture.json";
  writeJson(join(acquisition, inspectionName), inspection);

  const decisionBase = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360" },
    sourceInspectionFile: inspectionName,
    sourceInspectionHash: inspectionHash,
    generatedAt: "2026-08-07T00:01:00.000Z",
    reviewer: "human:test",
    reviewedAt: "2026-08-07T00:02:00.000Z",
    reviewStatus: "complete_human_review",
    anchorCount: 1,
    completedAnchorCount: 1,
    anchors: [],
    foundationPreviewEligible: false,
    globalBlockers: [],
    appendAuthorized: false,
  };
  const decision = envelope(decisionBase, "recordHash");
  const decisionName = "revision-human-review-decision-v1.fixture.json";
  writeJson(join(acquisition, decisionName), decision);

  const inventoryHashBase = {
    schemaVersion: 1,
    source: "edinet",
    configuredInventoryHash: H,
    legacyInventoryFile: "legacy.json",
    configuredInventoryFile: "configured.json",
    rangeMatch: true,
    completenessMatch: true,
    comparisons: [],
    replacementAuthorized: false,
    appendAuthorized: false,
  };
  const inventory = {
    ...inventoryHashBase,
    issuer: { issuerKey: "sanrio", edinetCode: "E02655", secCode: "81360" },
    registryHash: H,
    boundaryHash: H,
    generatedAt: "2026-08-07T00:03:00.000Z",
    legacyCandidateCount: 1,
    configuredCandidateCount: 1,
    matchedCandidateCount: 1,
    mismatchCandidateCount: 0,
    legacyOnlyCandidateCount: 0,
    configuredOnlyCandidateCount: 0,
    equivalentCoreCandidateSet: true,
    migrationReadyForHumanReview: true,
    reviewStatus: "pending_human_review",
    blockers: [],
    auditHash: digest(inventoryHashBase),
  };
  const inventoryName = "sanrio-edinet-inventory-compatibility-v1.fixture.json";
  writeJson(join(root, inventoryName), inventory);

  const configuredBase = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: H,
    issuer: { issuerKey: "sanrio", name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360", boundaryHash: H },
    sourceComparisonFile: "comparison.json",
    sourceComparisonHash: H,
    generatedAt: "2026-08-07T00:04:00.000Z",
    reviewer: "human:test",
    reviewedAt: "2026-08-07T00:05:00.000Z",
    reviewStatus: "complete_human_comparison_review",
    documentCount: 1,
    anchorCount: 1,
    completedAnchorCount: 1,
    documents: [],
    globalBlockers: [],
    automaticFactPromotionAuthorized: false,
    automaticImpactDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const configured = envelope(configuredBase, "recordHash");
  const configuredName = "configured-human-comparison-record-v1.fixture.json";
  writeJson(join(configuredAcquisition, configuredName), configured);

  const legacyRelative = `sanrio-acquisition.legacy/${decisionName}`;
  const configuredRelative = `sanrio-acquisition.configured/${configuredName}`;
  const workspaceBase = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { issuerKey: "sanrio", name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360", boundaryHash: H },
    registryHash: H,
    sourceInventoryAuditFile: inventoryName,
    sourceInventoryAuditHash: inventory.auditHash,
    sourceLegacyReviewPath: legacyRelative,
    sourceLegacyReviewHash: decision.recordHash,
    sourceConfiguredReviewPath: configuredRelative,
    sourceConfiguredReviewHash: configured.recordHash,
    generatedAt: "2026-08-07T00:06:00.000Z",
    sharedDocumentCount: 1,
    legacyAnchorCount: 1,
    configuredAnchorCount: 1,
    legacyAnchorsWithExactHashMatch: 1,
    configuredAnchorsWithExactHashMatch: 1,
    machineStatus: "parity_workspace_ready_for_human_mapping",
    legacyMappings: [],
    configuredCoverage: [],
    globalBlockers: [],
    semanticEquivalenceInferred: false,
    automaticAnchorMappingAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    replacementReviewStatus: "pending_human_review",
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const workspace = envelope(workspaceBase, "workspaceHash");
  const workspaceName = "legacy-configured-parity-workspace-v1.fixture.json";
  writeJson(join(configuredAcquisition, workspaceName), workspace);

  const parityBase = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { issuerKey: "sanrio", name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360", boundaryHash: H },
    registryHash: H,
    sourceWorkspaceFile: workspaceName,
    sourceWorkspaceHash: workspace.workspaceHash,
    generatedAt: "2026-08-07T00:07:00.000Z",
    reviewer: "human:test",
    reviewedAt: "2026-08-07T00:08:00.000Z",
    inventoryAuditHumanConfirmed: true,
    mappingCount: 1,
    completedMappingCount: 1,
    coverageCount: 1,
    completedCoverageCount: 1,
    materiallyInconsistentMappingCount: 0,
    blockingCoverageCount: 0,
    insufficientEvidenceCount: 0,
    mappings: [],
    coverage: [],
    replacementRecommendation: "recommend_keep_legacy",
    replacementRationale: "fixture",
    reviewStatus: "complete_human_parity_review",
    globalBlockers: [],
    semanticEquivalenceInferred: false,
    automaticMappingDecisionAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    legacyEntryPointMutationAuthorized: false,
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const parityRecord = envelope(parityBase, "recordHash");
  const parityName = "legacy-configured-parity-review-record-v1.fixture.json";
  writeJson(join(configuredAcquisition, parityName), parityRecord);

  const result: SanrioRealPilotPreflightResult = {
    schemaVersion: 1,
    root,
    stage: "parity_complete_foundation_gate_pending",
    nextCommand: null,
    requiresHumanAction: false,
    missingInputs: [],
    selectedFiles: {
      inspection: `sanrio-acquisition.legacy/${inspectionName}`,
      humanReviewDecision: legacyRelative,
      inventoryAudit: inventoryName,
      configuredReview: configuredRelative,
      parityWorkspace: `sanrio-acquisition.configured/${workspaceName}`,
      parityReviewRecord: `sanrio-acquisition.configured/${parityName}`,
    },
    warnings: [],
    safety: {
      rawContentPrinted: false,
      automaticReplacementAuthorized: false,
      foundationAppendAuthorized: false,
      automaticTradingAuthorized: false,
    },
  };

  return { root, acquisition, configuredAcquisition, result, inspection, decision, inventory, configured, workspace, parityRecord };
}

{
  const f = fixture();
  assert.doesNotThrow(() => assertSanrioRealPilotPreflightIntegrity(f.result, f.root));
  console.log("edinet-sanrio-real-pilot-integrity: valid selected lineage passes integrity gate OK");
}

{
  const f = fixture();
  const decisionPath = join(f.acquisition, "revision-human-review-decision-v1.fixture.json");
  writeJson(decisionPath, { ...f.decision, reviewer: "tampered" });
  assert.throws(
    () => assertSanrioRealPilotPreflightIntegrity(f.result, f.root),
    /humanReviewDecision\.recordHash mismatch/,
  );
  console.log("edinet-sanrio-real-pilot-integrity: tampered finalized human decision is rejected OK");
}

{
  const f = fixture();
  const workspaceName = "legacy-configured-parity-workspace-v1.fixture.json";
  const workspacePath = join(f.configuredAcquisition, workspaceName);
  const { workspaceHash: _ignored, ...workspaceWithoutHash } = f.workspace;
  const relinked = {
    ...workspaceWithoutHash,
    sourceLegacyReviewHash: OTHER_H,
  };
  writeJson(workspacePath, { ...relinked, workspaceHash: digest(relinked) });
  assert.throws(
    () => assertSanrioRealPilotPreflightIntegrity(f.result, f.root),
    /parityWorkspace\.sourceLegacyReviewHash mismatch/,
  );
  console.log("edinet-sanrio-real-pilot-integrity: rehashed workspace cannot relink to a different legacy decision OK");
}

{
  const f = fixture();
  const inputName = "revision-human-review-input-v1.fixture.json";
  writeJson(join(f.acquisition, inputName), {
    schemaVersion: 1,
    sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
    sourceInspectionHash: f.inspection.reportHash,
    reviewStatus: "draft_human_input",
    appendAuthorized: false,
    reviewer: "human:editing",
    editedFreeText: "manual draft content intentionally has no refreshed envelope hash",
  });
  const draftResult: SanrioRealPilotPreflightResult = {
    ...f.result,
    stage: "human_review_finalize_required",
    requiresHumanAction: true,
    selectedFiles: {
      inspection: "sanrio-acquisition.legacy/revision-unmatched-anchor-inspection-v1.fixture.json",
      humanReviewInput: `sanrio-acquisition.legacy/${inputName}`,
    },
  };
  assert.doesNotThrow(() => assertSanrioRealPilotPreflightIntegrity(draftResult, f.root));
  console.log("edinet-sanrio-real-pilot-integrity: human-editable draft is parent-pinned without requiring refreshed envelope hash OK");
}

console.log("edinet-sanrio-real-pilot-integrity.test.ts passed");
