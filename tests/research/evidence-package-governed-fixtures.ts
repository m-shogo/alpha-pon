import {
  type EvidencePackageBuildRequest,
  type EvidencePackageContext,
} from "../../src/research/evidence-package-manifest.js";
import type {
  EvidencePackageExternalPinResolver,
} from "../../src/research/evidence-package-governed.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";
import {
  EVIDENCE_PACKAGE_ISSUER_ID,
  EVIDENCE_PACKAGE_SECURITY_ID,
  evidencePackageBuildRequest,
  evidencePackageContext,
} from "./evidence-package-fixtures.js";

export const EVIDENCE_PACKAGE_LISTING_ID =
  "entity:listing:evidence-package-tse";

export function governedEvidencePackageContext(): EvidencePackageContext {
  const base = evidencePackageContext();
  const listing = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_LISTING_ID}:record:001`,
    entityId: EVIDENCE_PACKAGE_LISTING_ID,
    entityType: "listing",
    canonicalName: "Evidence Package TSE Listing",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Evidence Package TSE Listing",
      kind: "legal",
      language: "en",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:name:evidence-package-listing"],
    }],
    identifiers: [{
      type: "internal",
      value: EVIDENCE_PACKAGE_LISTING_ID,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:security:id:evidence-package-listing"],
    }],
    officialLinks: [],
    sourceRefs: ["source:security:evidence-package-listing"],
    observedAt: "2026-08-05T14:00:00+09:00",
    retrievedAt: "2026-08-05T14:01:00+09:00",
  });
  const issuerOf = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:evidence-package:issuer-of:record:001",
    relationshipId: "relationship:evidence-package:issuer-of",
    relationshipType: "issuer_of",
    fromEntityId: EVIDENCE_PACKAGE_ISSUER_ID,
    toEntityId: EVIDENCE_PACKAGE_SECURITY_ID,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:security:issuer-of:evidence-package"],
    observedAt: "2026-08-05T14:00:00+09:00",
    retrievedAt: "2026-08-05T14:01:00+09:00",
  });
  const listedOn = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:evidence-package:listed-on:record:001",
    relationshipId: "relationship:evidence-package:listed-on",
    relationshipType: "listed_on",
    fromEntityId: EVIDENCE_PACKAGE_SECURITY_ID,
    toEntityId: EVIDENCE_PACKAGE_LISTING_ID,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:security:listed-on:evidence-package"],
    observedAt: "2026-08-05T14:00:00+09:00",
    retrievedAt: "2026-08-05T14:01:00+09:00",
  });
  return {
    ...base,
    securityMasterSnapshot: {
      ...base.securityMasterSnapshot,
      entities: [...base.securityMasterSnapshot.entities, listing],
      relationships: [issuerOf, listedOn],
    },
  };
}

export function governedEvidencePackageRequest(
  overrides: Partial<EvidencePackageBuildRequest> = {},
): EvidencePackageBuildRequest {
  return evidencePackageBuildRequest({
    entityIds: [
      EVIDENCE_PACKAGE_ISSUER_ID,
      EVIDENCE_PACKAGE_SECURITY_ID,
      EVIDENCE_PACKAGE_LISTING_ID,
    ],
    ...overrides,
  });
}

export function governedEvidencePackageResolver(
  overrides: Partial<EvidencePackageExternalPinResolver> = {},
): EvidencePackageExternalPinResolver {
  const request = governedEvidencePackageRequest();
  return {
    priceSnapshotHashes: new Set([request.priceSnapshotHash]),
    benchmarkSnapshotHashes: {
      issuer: new Set([request.benchmarkSnapshotHashes.issuer]),
      topix: new Set([request.benchmarkSnapshotHashes.topix]),
      sector: new Set([request.benchmarkSnapshotHashes.sector]),
    },
    ...overrides,
  };
}
