import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  assessClaimForRecommendationAtCutoff,
  buildClaimGraphSnapshotGovernedAtCutoff,
} from "../../src/research/claim-contradiction-graph-governed.js";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
} from "../../src/research/claim-contradiction-graph.js";
import {
  buildGovernedDocumentRevisionDiffSnapshot,
} from "../../src/research/document-revision-diff-governed.js";
import type {
  EvidencePackageBuildRequest,
  EvidencePackageContext,
  EvidencePackageUnknownEntry,
} from "../../src/research/evidence-package-manifest.js";
import {
  withSecurityEntityHash,
  type SecurityMasterSnapshot,
} from "../../src/research/security-master.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

export const EVIDENCE_PACKAGE_CUTOFF = "2026-08-06T00:25:00+09:00";
export const EVIDENCE_PACKAGE_ISSUER_ID = "entity:issuer:evidence-package";
export const EVIDENCE_PACKAGE_SECURITY_ID = "entity:security:evidence-package";
export const EVIDENCE_PACKAGE_EVIDENCE_ID = "evidence:evidence-package:primary";
export const EVIDENCE_PACKAGE_CLAIM_ID = "claim:evidence-package:fact";

export function evidencePackageUnknownBudget(
  overrides: Partial<Record<EvidencePackageUnknownEntry["category"], Partial<EvidencePackageUnknownEntry>>> = {},
): EvidencePackageUnknownEntry[] {
  const categories: EvidencePackageUnknownEntry["category"][] = [
    "entity",
    "time",
    "license",
    "source",
    "evidence_gap",
    "execution",
    "confounder",
    "counterfactual",
    "valuation",
    "liquidity",
    "portfolio_exposure",
  ];
  return categories.map((category) => ({
    category,
    status: "known",
    severity: "informational",
    summary: `${category} is documented for fixture`,
    evidenceRefs: [EVIDENCE_PACKAGE_EVIDENCE_ID],
    ...overrides[category],
  }));
}

export function evidencePackageContext(): EvidencePackageContext {
  const issuer = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_ISSUER_ID}:record:001`,
    entityId: EVIDENCE_PACKAGE_ISSUER_ID,
    entityType: "legal_entity",
    canonicalName: "Evidence Package株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Evidence Package株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:name:evidence-package"],
    }],
    identifiers: [{
      type: "internal",
      value: EVIDENCE_PACKAGE_ISSUER_ID,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:security:id:evidence-package-issuer"],
    }],
    officialLinks: [{
      kind: "ir",
      url: "https://example.com/evidence-package/ir",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:ir:evidence-package"],
    }],
    sourceRefs: ["source:security:evidence-package-issuer"],
    observedAt: "2026-08-05T14:00:00+09:00",
    retrievedAt: "2026-08-05T14:01:00+09:00",
  });
  const security = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_SECURITY_ID}:record:001`,
    entityId: EVIDENCE_PACKAGE_SECURITY_ID,
    entityType: "listed_security",
    canonicalName: "Evidence Package普通株式",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Evidence Package普通株式",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:name:evidence-package-stock"],
    }],
    identifiers: [{
      type: "jpx_code",
      value: "9998",
      market: "TSE",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:security:jpx:evidence-package"],
    }],
    officialLinks: [],
    sourceRefs: ["source:security:evidence-package-stock"],
    observedAt: "2026-08-05T14:00:00+09:00",
    retrievedAt: "2026-08-05T14:01:00+09:00",
  });
  const securityMasterSnapshot: SecurityMasterSnapshot = {
    asOf: "2026-08-06",
    entities: [issuer, security],
    relationships: [],
  };

  const evidence = withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_EVIDENCE_ID}:record:001`,
    evidenceId: EVIDENCE_PACKAGE_EVIDENCE_ID,
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID],
    sourceId: "source:evidence-package:ir",
    sourceType: "company_ir",
    sourceLocator: "https://example.com/evidence-package/ir/disclosure",
    sourceContentHash: "a".repeat(64),
    eventAtStatus: "known",
    eventAt: "2026-08-05T23:55:00+09:00",
    publishedAt: "2026-08-06T00:00:00+09:00",
    observedAt: "2026-08-06T00:01:00+09:00",
    retrievedAt: "2026-08-06T00:02:00+09:00",
    effectiveFrom: "2026-08-06T00:00:00+09:00",
    firstExecutableAt: "2026-08-06T09:00:00+09:00",
    evidenceTier: "primary_company",
    status: "active",
    license: "metadata_only",
    storagePolicy: "metadata_only",
    title: "Evidence Package fixture disclosure",
    summary: "Primary fixture evidence supports the governed claim.",
    retrievalRunId: "retrieval-run-evidence-package",
    parserVersion: "evidence-parser-v1",
  });
  const evidenceSnapshot = buildEvidenceSnapshot(
    [evidence],
    [],
    EVIDENCE_PACKAGE_CUTOFF,
    "system_replay",
    "knowledge",
  );

  const claim = withClaimRecordHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_CLAIM_ID}:record:001`,
    claimId: EVIDENCE_PACKAGE_CLAIM_ID,
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID],
    claimClass: "fact",
    statement: "The disclosed event changes the implementation schedule.",
    status: "active",
    informationCutoff: "2026-08-06T00:02:00+09:00",
    effectiveFrom: "2026-08-06T00:02:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    falsificationConditions: [],
    unknownRefs: [],
    modelVersion: "claim-model-v1",
    ruleVersion: "claim-graph-v1",
  });
  const edge = withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: "claim-edge:evidence-package:support:record:001",
    edgeId: "claim-edge:evidence-package:support",
    fromKind: "evidence",
    fromId: evidence.evidenceId,
    toKind: "claim",
    toId: claim.claimId,
    relationType: "supports",
    strength: "material",
    effectiveFrom: "2026-08-06T00:03:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    sourceEvidenceIds: [evidence.evidenceId],
  });
  const claimSchemas = {
    claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
    edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
  };
  const knownEntityIds = new Set([EVIDENCE_PACKAGE_ISSUER_ID, EVIDENCE_PACKAGE_SECURITY_ID]);
  const claimGraphSnapshot = buildClaimGraphSnapshotGovernedAtCutoff(
    [claim],
    [edge],
    claimSchemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  const claimAssessments = [assessClaimForRecommendationAtCutoff(
    [claim],
    [edge],
    claimSchemas,
    evidenceSnapshot,
    claim.claimId,
    knownEntityIds,
  )];

  const documentSchemas = {
    revision: loadCouncilSchema("research/schemas/document-revision-record.schema.json"),
    diff: loadCouncilSchema("research/schemas/document-diff-record.schema.json"),
  };
  const documentRevisionSnapshot = buildGovernedDocumentRevisionDiffSnapshot(
    [],
    [],
    documentSchemas,
    evidenceSnapshot,
    knownEntityIds,
  );

  return {
    securityMasterSnapshot,
    evidenceSnapshot,
    claimGraphSnapshot,
    documentRevisionSnapshot,
    claimAssessments,
    claimEligibleChanges: [],
  };
}

export function evidencePackageBuildRequest(
  overrides: Partial<EvidencePackageBuildRequest> = {},
): EvidencePackageBuildRequest {
  return {
    packageId: "evidence-package:fixture:001",
    candidateId: "candidate:evidence-package:001",
    listedSecurityEntityId: EVIDENCE_PACKAGE_SECURITY_ID,
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID, EVIDENCE_PACKAGE_SECURITY_ID],
    createdAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: EVIDENCE_PACKAGE_CUTOFF,
    priceSnapshotHash: "b".repeat(64),
    benchmarkSnapshotHashes: {
      issuer: "c".repeat(64),
      topix: "d".repeat(64),
      sector: "e".repeat(64),
    },
    marketCalendarVersion: "jpx-calendar-v1",
    codeVersion: "evidence-package-code-v1",
    ruleVersion: "evidence-package-rule-v1",
    correctionChainComplete: true,
    documentDiffReviewed: true,
    benchmarkComplete: true,
    priceSnapshotComplete: true,
    executionRouteComplete: true,
    unknownBudget: evidencePackageUnknownBudget(),
    ...overrides,
  };
}
