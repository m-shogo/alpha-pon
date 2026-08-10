import {
  buildEvidencePackageManifest,
  computeEvidencePackageHash,
  EVIDENCE_PACKAGE_UNKNOWN_CATEGORIES,
  type EvidencePackageBuildRequest,
  type EvidencePackageCompleteness,
  type EvidencePackageContext,
  type EvidencePackageIssue,
  type EvidencePackageManifest,
  type EvidencePackageManifestInput,
  type EvidencePackageSchemas,
  type EvidencePackageUnknownCategory,
} from "./evidence-package-manifest.js";
import {
  validateGovernedClaimGraphSnapshot,
} from "./claim-contradiction-graph-snapshot.js";
import {
  validateGovernedDocumentRevisionDiffSnapshot,
} from "./document-revision-diff-snapshot.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { stableStringify, validate } from "./schema.js";

export type EvidencePackageExternalPinResolver = {
  priceSnapshotHashes: ReadonlySet<string>;
  benchmarkSnapshotHashes: {
    issuer: ReadonlySet<string>;
    topix: ReadonlySet<string>;
    sector: ReadonlySet<string>;
  };
};

const STOCK_BLOCKING_UNKNOWN_CATEGORIES = new Set<EvidencePackageUnknownCategory>([
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
]);

function issue(
  code: string,
  target: string,
  message: string,
): EvidencePackageIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: EvidencePackageIssue[]): EvidencePackageIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function securityResolution(
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
): {
  resolved: boolean;
  requiredEntityIds: string[];
} {
  const entityById = new Map(
    context.securityMasterSnapshot.entities.map((entity) => [entity.entityId, entity]),
  );
  const security = entityById.get(request.listedSecurityEntityId);
  const issuerRelations = context.securityMasterSnapshot.relationships.filter(
    (relationship) =>
      relationship.relationshipType === "issuer_of" &&
      relationship.toEntityId === request.listedSecurityEntityId &&
      relationship.confidence === "verified",
  );
  const listingRelations = context.securityMasterSnapshot.relationships.filter(
    (relationship) =>
      relationship.relationshipType === "listed_on" &&
      relationship.fromEntityId === request.listedSecurityEntityId &&
      relationship.confidence === "verified",
  );
  const issuerId = issuerRelations.length === 1
    ? issuerRelations[0].fromEntityId
    : undefined;
  const listingId = listingRelations.length === 1
    ? listingRelations[0].toEntityId
    : undefined;
  const issuer = issuerId ? entityById.get(issuerId) : undefined;
  const listing = listingId ? entityById.get(listingId) : undefined;
  const requiredEntityIds = sortedUnique([
    request.listedSecurityEntityId,
    ...(issuerId ? [issuerId] : []),
    ...(listingId ? [listingId] : []),
  ]);
  return {
    resolved: Boolean(
      security?.entityType === "listed_security" &&
      issuer?.entityType === "legal_entity" &&
      listing?.entityType === "listing" &&
      issuerRelations.length === 1 &&
      listingRelations.length === 1 &&
      requiredEntityIds.every((entityId) => request.entityIds.includes(entityId)),
    ),
    requiredEntityIds,
  };
}

function externalCompleteness(
  request: EvidencePackageBuildRequest,
  resolver: EvidencePackageExternalPinResolver,
): Pick<EvidencePackageCompleteness, "priceSnapshotComplete" | "benchmarkComplete"> {
  return {
    priceSnapshotComplete:
      resolver.priceSnapshotHashes.has(request.priceSnapshotHash),
    benchmarkComplete:
      resolver.benchmarkSnapshotHashes.issuer.has(
        request.benchmarkSnapshotHashes.issuer,
      ) &&
      resolver.benchmarkSnapshotHashes.topix.has(
        request.benchmarkSnapshotHashes.topix,
      ) &&
      resolver.benchmarkSnapshotHashes.sector.has(
        request.benchmarkSnapshotHashes.sector,
      ),
  };
}

function unknownBlockers(
  manifest: EvidencePackageManifest,
): string[] {
  return manifest.unknownBudget.flatMap((entry) => {
    if (entry.status !== "unknown") return [];
    if (
      entry.severity === "blocking" ||
      STOCK_BLOCKING_UNKNOWN_CATEGORIES.has(entry.category)
    ) {
      return [`blocking_unknown:${entry.category}`];
    }
    return [];
  });
}

function deriveGovernedBlockers(
  manifest: EvidencePackageManifest,
): string[] {
  const incomplete = Object.entries(manifest.completeness)
    .filter(([, value]) => !value)
    .map(([field]) => `incomplete:${field}`);
  return sortedUnique([
    ...incomplete,
    ...unknownBlockers(manifest),
    ...(manifest.claimIds.length === 0 ? ["no_eligible_claims"] : []),
    ...(manifest.supportEvidenceIds.length === 0
      ? ["no_eligible_support_evidence"]
      : []),
    ...manifest.openContradictionIds.map((id) => `open_contradiction:${id}`),
  ]);
}

export function buildEvidencePackageManifestGoverned(
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
  resolver: EvidencePackageExternalPinResolver,
): EvidencePackageManifest {
  const base = buildEvidencePackageManifest(request, context);
  const security = securityResolution(request, context);
  const external = externalCompleteness(request, resolver);
  const completeness: EvidencePackageCompleteness = {
    ...base.completeness,
    securityResolved: security.resolved,
    priceSnapshotComplete: external.priceSnapshotComplete,
    benchmarkComplete: external.benchmarkComplete,
  };
  const intermediate: EvidencePackageManifestInput = {
    ...base,
    entityIds: sortedUnique(request.entityIds),
    completeness,
    status: "draft",
    blockers: [],
  };
  delete (intermediate as Partial<EvidencePackageManifest>).contentHash;
  const blockers = deriveGovernedBlockers({
    ...intermediate,
    contentHash: "0".repeat(64),
  });
  const input: EvidencePackageManifestInput = {
    ...intermediate,
    status: blockers.length === 0 ? "complete" : "draft",
    blockers,
  };
  return {
    ...input,
    contentHash: computeEvidencePackageHash(input),
  };
}

function unknownBudgetIssues(
  manifest: EvidencePackageManifest,
): EvidencePackageIssue[] {
  const issues: EvidencePackageIssue[] = [];
  const categories = manifest.unknownBudget.map((entry) => entry.category);
  if (!sameStringSet(categories, EVIDENCE_PACKAGE_UNKNOWN_CATEGORIES)) {
    issues.push(issue(
      "evidence_package_unknown_categories_mismatch",
      manifest.packageId,
      `required=${EVIDENCE_PACKAGE_UNKNOWN_CATEGORIES.join(",")}`,
    ));
  }
  for (const entry of manifest.unknownBudget) {
    const target = `${manifest.packageId}.unknownBudget:${entry.category}`;
    if (
      entry.status === "unknown" &&
      STOCK_BLOCKING_UNKNOWN_CATEGORIES.has(entry.category) &&
      entry.severity !== "blocking"
    ) {
      issues.push(issue(
        "blocking_unknown_marked_informational",
        target,
        `${entry.category} unknown must be blocking`,
      ));
    }
    if (entry.status !== "unknown" && entry.severity !== "informational") {
      issues.push(issue(
        "known_unknown_budget_marked_blocking",
        target,
        `${entry.status} entry must be informational`,
      ));
    }
    if (entry.status !== "unknown" && entry.evidenceRefs.length === 0) {
      issues.push(issue(
        "known_unknown_budget_without_evidence",
        target,
        "known/resolved entry requires evidenceRefs",
      ));
    }
  }
  return issues;
}

function externalRoleIssues(
  request: EvidencePackageBuildRequest,
): EvidencePackageIssue[] {
  const roles = [
    ["price", request.priceSnapshotHash],
    ["issuer", request.benchmarkSnapshotHashes.issuer],
    ["topix", request.benchmarkSnapshotHashes.topix],
    ["sector", request.benchmarkSnapshotHashes.sector],
  ] as const;
  const counts = new Map<string, string[]>();
  for (const [role, hash] of roles) {
    const values = counts.get(hash) ?? [];
    values.push(role);
    counts.set(hash, values);
  }
  return [...counts.entries()]
    .filter(([, roleNames]) => roleNames.length > 1)
    .map(([hash, roleNames]) => issue(
      "external_snapshot_role_collision",
      hash,
      `same hash is used for roles: ${roleNames.join(",")}`,
    ));
}

export function validateEvidencePackageManifestGoverned(
  manifest: EvidencePackageManifest,
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
  resolver: EvidencePackageExternalPinResolver,
  schemas: EvidencePackageSchemas,
): EvidencePackageIssue[] {
  const issues: EvidencePackageIssue[] = validate(
    manifest,
    schemas.manifest,
  ).map((error) => issue(
    "schema_violation",
    error.path ? `EvidencePackage:${error.path}` : "EvidencePackage",
    error.message,
  ));
  if (issues.length > 0) return sortIssues(issues);

  issues.push(...validateGovernedClaimGraphSnapshot(
    context.claimGraphSnapshot,
    schemas.claimSnapshot,
  ));
  issues.push(...validateGovernedDocumentRevisionDiffSnapshot(
    context.documentRevisionSnapshot,
    schemas.documentSnapshot,
  ));
  issues.push(...unknownBudgetIssues(manifest));
  issues.push(...externalRoleIssues(request));

  const expected = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  if (manifest.contentHash !== computeEvidencePackageHash(manifest)) {
    issues.push(issue(
      "invalid_evidence_package_hash",
      manifest.packageId,
      "Evidence Package contentHash mismatch",
    ));
  }
  if (stableStringify(manifest) !== stableStringify(expected)) {
    issues.push(issue(
      "governed_evidence_package_mismatch",
      manifest.packageId,
      "manifest differs from the authoritative governed build",
    ));
  }
  if (
    compareExplicitIso8601Instants(
      manifest.createdAt,
      manifest.informationCutoff,
      "evidence package createdAt",
      "evidence package informationCutoff",
    ) < 0
  ) {
    issues.push(issue(
      "evidence_package_created_before_cutoff",
      manifest.packageId,
      `${manifest.createdAt} < ${manifest.informationCutoff}`,
    ));
  }
  if (
    context.evidenceSnapshot.asOf !== manifest.informationCutoff ||
    context.claimGraphSnapshot.asOf !== manifest.informationCutoff ||
    context.documentRevisionSnapshot.asOf !== manifest.informationCutoff
  ) {
    issues.push(issue(
      "evidence_package_cutoff_mismatch",
      manifest.packageId,
      "Evidence/Claim/Document snapshots must use informationCutoff",
    ));
  }
  const securityDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(manifest.informationCutoff));
  if (context.securityMasterSnapshot.asOf !== securityDate) {
    issues.push(issue(
      "security_master_snapshot_date_mismatch",
      manifest.packageId,
      `${context.securityMasterSnapshot.asOf} != ${securityDate}`,
    ));
  }
  return sortIssues(issues);
}
