import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildFoundationReadinessRemediationPlan,
  renderFoundationReadinessRemediationPlan,
} from "../src/research/foundation-readiness-remediation-plan.js";

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

function audit(): JsonObject {
  const readinessGroups = [
    {
      groupId: "verified_record_lineage",
      status: "verified_present",
      verifiedFields: ["docID", "registryHash"],
      missingFields: [],
      evidenceRefs: ["a".repeat(64)],
      note: "Verified lineage exists.",
    },
    {
      groupId: "security_master",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: ["entityIds"],
      evidenceRefs: [],
      note: "Governed Security Master identity is required.",
    },
    {
      groupId: "document_metadata",
      status: "missing_required_evidence",
      verifiedFields: ["docID"],
      missingFields: [
        "chainRootDocID",
        "documentTypeCode",
        "sourceContentHash",
        "title",
        "summary",
        "language",
      ],
      evidenceRefs: ["S900DOC1"],
      note: "Document-level metadata is incomplete.",
    },
    {
      groupId: "pit_timestamps",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: [
        "publishedAt",
        "observedAt",
        "retrievedAt",
        "effectiveFrom",
        "firstExecutableAt",
        "eventAtStatus",
        "eventAt",
      ],
      evidenceRefs: [],
      note: "PIT clocks are incomplete.",
    },
    {
      groupId: "retrieval_and_normalization",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: ["retrievalRunId", "parserVersion", "normalizationVersion", "normalizedStructureHash"],
      evidenceRefs: [],
      note: "Retrieval and normalization lineage is incomplete.",
    },
    {
      groupId: "revision_chain",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: ["revisionKind", "revisionSequence", "evidenceStatus", "documentRevisionStatus", "prior"],
      evidenceRefs: [],
      note: "Revision lineage is incomplete.",
    },
    {
      groupId: "rights_and_storage",
      status: "missing_required_evidence",
      verifiedFields: [],
      missingFields: ["license", "storagePolicy"],
      evidenceRefs: [],
      note: "Rights and storage policy are incomplete.",
    },
    {
      groupId: "section_mapping",
      status: "partial_navigation_only",
      verifiedFields: ["sections[].path", "anchor.structured.textHash"],
      missingFields: [
        "sections[].sectionId",
        "sections[].ordinal",
        "sections[].titleHash",
        "sections[].contentHash",
      ],
      evidenceRefs: ["S900DOC1:anchor:001"],
      note: "Navigation exists but complete section mapping does not.",
    },
  ];
  const missingFields = [...new Set(readinessGroups.flatMap(group => group.missingFields))].sort();
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      issuerKey: "synthetic-co",
      name: "Synthetic Co",
      edinetCode: "E90000",
      secCode: "90000",
      boundaryHash: "b".repeat(64),
    },
    registryHash: "c".repeat(64),
    sourceParityReviewFile: "legacy-configured-parity-review-record-v1.fixture.json",
    sourceParityReviewHash: "d".repeat(64),
    sourceParityWorkspaceFile: "legacy-configured-parity-workspace-v1.fixture.json",
    sourceParityWorkspaceHash: "e".repeat(64),
    sourceConfiguredReviewFile: "configured-human-comparison-record-v1.fixture.json",
    sourceConfiguredReviewHash: "f".repeat(64),
    generatedAt: "2026-08-07T01:20:00.000Z",
    parityReplacementRecommendation: "recommend_keep_legacy",
    documentCount: 1,
    anchorCount: 1,
    confirmedFactCount: 1,
    previouslyKnownFactCount: 0,
    assumptionCount: 0,
    opinionCount: 0,
    exactAmountCount: 0,
    readinessGroups,
    verifiedFieldCount: 4,
    derivableFieldCount: 0,
    partialFieldCount: 4,
    missingFieldCount: missingFields.length,
    missingFields,
    readinessStatus: "blocked_missing_foundation_mapping_evidence",
    foundationMappingGateReady: false,
    automaticFieldSynthesisAuthorized: false,
    legacyEntryPointMutationAuthorized: false,
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
    blockers: ["required_foundation_mapping_evidence_missing"],
  };
  return { ...base, auditHash: digest(base) };
}

{
  const plan = buildFoundationReadinessRemediationPlan({
    readinessAudit: audit(),
    sourceAuditFile: "configured-foundation-readiness-audit-v1.fixture.json",
    generatedAt: "2026-08-07T01:21:00.000Z",
  });
  assert.equal(plan.planStatus, "blocked_pending_explicit_evidence");
  assert.equal(plan.foundationMappingGateAuthorized, false);
  assert.equal(plan.automaticFieldSynthesisAuthorized, false);
  assert.equal(plan.automaticEvidenceCollectionAuthorized, false);
  assert.equal(plan.replacementAuthorized, false);
  assert.equal(plan.appendAuthorized, false);
  assert.deepEqual(plan.steps.map(step => step.groupId), [
    "security_master",
    "document_metadata",
    "pit_timestamps",
    "retrieval_and_normalization",
    "revision_chain",
    "rights_and_storage",
    "section_mapping",
  ]);
  assert.deepEqual(plan.steps[1]!.dependsOnGroupIds, ["security_master"]);
  assert.deepEqual(plan.steps[2]!.dependsOnGroupIds, ["document_metadata"]);
  assert.deepEqual(plan.steps[3]!.dependsOnGroupIds, ["document_metadata"]);
  assert.deepEqual(plan.steps[4]!.dependsOnGroupIds, ["document_metadata", "pit_timestamps"]);
  assert.deepEqual(plan.steps[5]!.dependsOnGroupIds, ["document_metadata"]);
  assert.deepEqual(plan.steps[6]!.dependsOnGroupIds, ["document_metadata", "retrieval_and_normalization"]);
  assert.equal(plan.steps[6]!.status, "pending_complete_mapping");
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  const markdown = renderFoundationReadinessRemediationPlan(plan);
  assert.match(markdown, /resolve_governed_security_master_identity/);
  assert.match(markdown, /foundationMappingGateAuthorized: false/);
  console.log("foundation-readiness-remediation-plan: canonical dependency-ordered plan OK");
}

{
  const tampered = audit();
  tampered.missingFieldCount = 0;
  const { auditHash: _oldHash, ...withoutHash } = tampered;
  tampered.auditHash = digest(withoutHash);
  assert.throws(() => buildFoundationReadinessRemediationPlan({
    readinessAudit: tampered,
    sourceAuditFile: "configured-foundation-readiness-audit-v1.fixture.json",
  }), /missingFieldCount mismatch/);
  console.log("foundation-readiness-remediation-plan: inconsistent audit counts blocked OK");
}

{
  const unsafe = audit();
  unsafe.appendAuthorized = true;
  const { auditHash: _oldHash, ...withoutHash } = unsafe;
  unsafe.auditHash = digest(withoutHash);
  assert.throws(() => buildFoundationReadinessRemediationPlan({
    readinessAudit: unsafe,
    sourceAuditFile: "configured-foundation-readiness-audit-v1.fixture.json",
  }), /safety boundary is invalid/);
  console.log("foundation-readiness-remediation-plan: unsafe source audit boundary blocked OK");
}

{
  const corrupted = audit();
  corrupted.registryHash = "0".repeat(64);
  assert.throws(() => buildFoundationReadinessRemediationPlan({
    readinessAudit: corrupted,
    sourceAuditFile: "configured-foundation-readiness-audit-v1.fixture.json",
  }), /auditHash mismatch/);
  console.log("foundation-readiness-remediation-plan: audit hash tampering blocked OK");
}

console.log("foundation-readiness-remediation-plan.test.ts passed");
