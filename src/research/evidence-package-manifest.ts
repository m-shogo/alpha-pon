import { createHash } from "node:crypto";
import type {
  EvidenceSnapshot,
} from "./bitemporal-evidence-store.js";
import {
  recommendationEligibleEvidence,
} from "./bitemporal-evidence-store.js";
import {
  computeEvidenceSnapshotHash,
  type GovernedClaimGraphSnapshot,
} from "./claim-contradiction-graph-hardening.js";
import type {
  ClaimRecommendationAssessment,
} from "./claim-contradiction-graph.js";
import {
  validateGovernedClaimGraphSnapshot,
} from "./claim-contradiction-graph-snapshot.js";
import type {
  ClaimEligibleDocumentChange,
} from "./document-revision-diff.js";
import type {
  GovernedDocumentRevisionDiffSnapshot,
} from "./document-revision-diff-governed.js";
import {
  validateGovernedDocumentRevisionDiffSnapshot,
} from "./document-revision-diff-snapshot.js";
import type {
  SecurityMasterSnapshot,
} from "./security-master.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type EvidencePackageUnknownCategory =
  | "entity"
  | "time"
  | "license"
  | "source"
  | "evidence_gap"
  | "execution"
  | "confounder"
  | "counterfactual"
  | "valuation"
  | "liquidity"
  | "portfolio_exposure";

export type EvidencePackageUnknownEntry = {
  category: EvidencePackageUnknownCategory;
  status: "known" | "unknown" | "resolved";
  severity: "informational" | "blocking";
  summary: string;
  evidenceRefs: string[];
};

export type EvidencePackageCompleteness = {
  securityResolved: boolean;
  normalizedEvidence: boolean;
  correctionChainComplete: boolean;
  claimGraphComplete: boolean;
  documentDiffReviewed: boolean;
  benchmarkComplete: boolean;
  priceSnapshotComplete: boolean;
  executionRouteComplete: boolean;
  licenseComplete: boolean;
  contradictionsReviewed: boolean;
};

export type EvidencePackageManifest = {
  schemaVersion: 1;
  packageId: string;
  candidateId: string;
  listedSecurityEntityId: string;
  entityIds: string[];
  createdAt: string;
  informationCutoff: string;
  securityMasterSnapshotHash: string;
  evidenceSnapshotHash: string;
  claimGraphSnapshotHash: string;
  documentRevisionSnapshotHash: string;
  priceSnapshotHash: string;
  benchmarkSnapshotHashes: {
    issuer: string;
    topix: string;
    sector: string;
  };
  marketCalendarVersion: string;
  codeVersion: string;
  ruleVersion: string;
  evidenceIds: string[];
  supportEvidenceIds: string[];
  claimIds: string[];
  documentRevisionIds: string[];
  diffIds: string[];
  claimEligibleChangeRefs: string[];
  completeness: EvidencePackageCompleteness;
  unknownBudget: EvidencePackageUnknownEntry[];
  openContradictionIds: string[];
  status: "draft" | "complete" | "rejected" | "superseded";
  blockers: string[];
  supersedesPackageId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type EvidencePackageManifestInput = Omit<
  EvidencePackageManifest,
  "contentHash"
>;

export type EvidencePackageIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type EvidencePackageSchemas = {
  manifest: JsonSchema;
  claimSnapshot: JsonSchema;
  documentSnapshot: JsonSchema;
};

export type EvidencePackageContext = {
  securityMasterSnapshot: SecurityMasterSnapshot;
  evidenceSnapshot: EvidenceSnapshot;
  claimGraphSnapshot: GovernedClaimGraphSnapshot;
  documentRevisionSnapshot: GovernedDocumentRevisionDiffSnapshot;
  claimAssessments: ClaimRecommendationAssessment[];
  claimEligibleChanges: ClaimEligibleDocumentChange[];
};

export type EvidencePackageBuildRequest = {
  packageId: string;
  candidateId: string;
  listedSecurityEntityId: string;
  entityIds: string[];
  createdAt: string;
  informationCutoff: string;
  priceSnapshotHash: string;
  benchmarkSnapshotHashes: {
    issuer: string;
    topix: string;
    sector: string;
  };
  marketCalendarVersion: string;
  codeVersion: string;
  ruleVersion: string;
  correctionChainComplete: boolean;
  documentDiffReviewed: boolean;
  benchmarkComplete: boolean;
  priceSnapshotComplete: boolean;
  executionRouteComplete: boolean;
  unknownBudget: EvidencePackageUnknownEntry[];
  supersedesPackageId?: string;
};

export const EVIDENCE_PACKAGE_PATHS = {
  manifests: "research/evidence_packages/manifests.jsonl",
  schema: "research/schemas/evidence-package-manifest.schema.json",
} as const;

export const EVIDENCE_PACKAGE_UNKNOWN_CATEGORIES: readonly EvidencePackageUnknownCategory[] = [
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
] as const;

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

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutHash(
  manifest: EvidencePackageManifest,
): EvidencePackageManifestInput {
  const { contentHash: _contentHash, ...input } = manifest;
  return input;
}

export function computeEvidencePackageHash(
  manifest: EvidencePackageManifest | EvidencePackageManifestInput,
): string {
  return hashValue("contentHash" in manifest ? withoutHash(manifest) : manifest);
}

function issue(
  code: string,
  target: string,
  message: string,
  severity: EvidencePackageIssue["severity"] = "error",
): EvidencePackageIssue {
  return { severity, code, target, message };
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

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function canonicalArrayIssues(
  values: string[],
  field: string,
): EvidencePackageIssue[] {
  const expected = sortedUnique(values);
  const valid =
    values.length === expected.length &&
    expected.every((value, index) => value === values[index]);
  return valid ? [] : [issue(
    "non_canonical_evidence_package_array",
    field,
    `${field} must be sorted and unique`,
  )];
}

export function computeSecurityMasterSnapshotHash(
  snapshot: SecurityMasterSnapshot,
): string {
  return hashValue({
    asOf: snapshot.asOf,
    entities: [...snapshot.entities].sort((a, b) =>
      a.entityId.localeCompare(b.entityId),
    ),
    relationships: [...snapshot.relationships].sort((a, b) =>
      a.relationshipId.localeCompare(b.relationshipId),
    ),
  });
}

function jstDateOf(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function eligibleClaimIds(
  context: EvidencePackageContext,
): string[] {
  return sortedUnique(
    context.claimAssessments
      .filter((assessment) => assessment.eligible)
      .map((assessment) => assessment.claimId),
  );
}

function openContradictionIds(
  context: EvidencePackageContext,
): string[] {
  return sortedUnique(context.claimAssessments.flatMap((assessment) =>
    assessment.blockers.flatMap((blocker) => {
      const prefixes = [
        "unresolved_material_contradiction:",
        "unresolved_binding_contradiction:",
      ];
      const prefix = prefixes.find((value) => blocker.startsWith(value));
      return prefix ? [blocker.slice(prefix.length)] : [];
    }),
  ));
}

function supportEvidenceIds(
  context: EvidencePackageContext,
): string[] {
  return sortedUnique([
    ...context.claimAssessments
      .filter((assessment) => assessment.eligible)
      .flatMap((assessment) => assessment.supportEvidenceIds),
    ...context.claimEligibleChanges.flatMap((change) => change.sourceEvidenceIds),
  ]);
}

function allEvidenceIds(
  context: EvidencePackageContext,
): string[] {
  return sortedUnique([
    ...context.claimGraphSnapshot.evidenceIds,
    ...context.documentRevisionSnapshot.evidenceIds,
  ]);
}

function changeRefs(
  context: EvidencePackageContext,
): string[] {
  return sortedUnique(
    context.claimEligibleChanges.map((change) => `${change.diffId}:${change.path}`),
  );
}

function diffIds(
  context: EvidencePackageContext,
): string[] {
  return sortedUnique(
    context.claimEligibleChanges.map((change) => change.diffId),
  );
}

function derivedSecurityResolved(
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
): boolean {
  const entityById = new Map(
    context.securityMasterSnapshot.entities.map((entity) => [entity.entityId, entity]),
  );
  const listedSecurity = entityById.get(request.listedSecurityEntityId);
  return Boolean(
    listedSecurity &&
    listedSecurity.entityType === "listed_security" &&
    request.entityIds.every((entityId) => entityById.has(entityId)),
  );
}

function derivedLicenseComplete(
  supportIds: string[],
  context: EvidencePackageContext,
): boolean {
  const eligibleIds = new Set(
    recommendationEligibleEvidence(context.evidenceSnapshot)
      .map((record) => record.evidenceId),
  );
  return supportIds.length > 0 && supportIds.every((id) => eligibleIds.has(id));
}

function deriveCompleteness(
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
  claims: string[],
  evidenceIds: string[],
  supportIds: string[],
  contradictions: string[],
): EvidencePackageCompleteness {
  return {
    securityResolved: derivedSecurityResolved(request, context),
    normalizedEvidence: evidenceIds.length > 0,
    correctionChainComplete: request.correctionChainComplete,
    claimGraphComplete: claims.length > 0,
    documentDiffReviewed: request.documentDiffReviewed,
    benchmarkComplete: request.benchmarkComplete,
    priceSnapshotComplete: request.priceSnapshotComplete,
    executionRouteComplete: request.executionRouteComplete,
    licenseComplete: derivedLicenseComplete(supportIds, context),
    contradictionsReviewed: contradictions.length === 0,
  };
}

function deriveUnknownBlockers(
  unknownBudget: EvidencePackageUnknownEntry[],
): string[] {
  return sortedUnique(unknownBudget.flatMap((entry) => {
    if (entry.status !== "unknown") return [];
    if (
      entry.severity === "blocking" ||
      STOCK_BLOCKING_UNKNOWN_CATEGORIES.has(entry.category)
    ) {
      return [`blocking_unknown:${entry.category}`];
    }
    return [];
  }));
}

function deriveBlockers(
  completeness: EvidencePackageCompleteness,
  unknownBudget: EvidencePackageUnknownEntry[],
  claims: string[],
  supportIds: string[],
  contradictions: string[],
): string[] {
  const incomplete = Object.entries(completeness)
    .filter(([, value]) => !value)
    .map(([field]) => `incomplete:${field}`);
  return sortedUnique([
    ...incomplete,
    ...deriveUnknownBlockers(unknownBudget),
    ...(claims.length === 0 ? ["no_eligible_claims"] : []),
    ...(supportIds.length === 0 ? ["no_eligible_support_evidence"] : []),
    ...contradictions.map((id) => `open_contradiction:${id}`),
  ]);
}

export function buildEvidencePackageManifest(
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
): EvidencePackageManifest {
  const claims = eligibleClaimIds(context);
  const evidenceIds = allEvidenceIds(context);
  const supportIds = supportEvidenceIds(context);
  const contradictions = openContradictionIds(context);
  const completeness = deriveCompleteness(
    request,
    context,
    claims,
    evidenceIds,
    supportIds,
    contradictions,
  );
  const blockers = deriveBlockers(
    completeness,
    request.unknownBudget,
    claims,
    supportIds,
    contradictions,
  );
  const input: EvidencePackageManifestInput = {
    schemaVersion: 1,
    packageId: request.packageId,
    candidateId: request.candidateId,
    listedSecurityEntityId: request.listedSecurityEntityId,
    entityIds: sortedUnique(request.entityIds),
    createdAt: request.createdAt,
    informationCutoff: request.informationCutoff,
    securityMasterSnapshotHash: computeSecurityMasterSnapshotHash(
      context.securityMasterSnapshot,
    ),
    evidenceSnapshotHash: computeEvidenceSnapshotHash(context.evidenceSnapshot),
    claimGraphSnapshotHash: context.claimGraphSnapshot.contentHash,
    documentRevisionSnapshotHash:
      context.documentRevisionSnapshot.contentHash,
    priceSnapshotHash: request.priceSnapshotHash,
    benchmarkSnapshotHashes: request.benchmarkSnapshotHashes,
    marketCalendarVersion: request.marketCalendarVersion,
    codeVersion: request.codeVersion,
    ruleVersion: request.ruleVersion,
    evidenceIds,
    supportEvidenceIds: supportIds,
    claimIds: claims,
    documentRevisionIds: sortedUnique(
      context.documentRevisionSnapshot.revisionIds,
    ),
    diffIds: diffIds(context),
    claimEligibleChangeRefs: changeRefs(context),
    completeness,
    unknownBudget: [...request.unknownBudget].sort((a, b) =>
      a.category.localeCompare(b.category),
    ),
    openContradictionIds: contradictions,
    status: blockers.length === 0 ? "complete" : "draft",
    blockers,
    ...(request.supersedesPackageId
      ? { supersedesPackageId: request.supersedesPackageId }
      : {}),
    automaticTradingAuthorized: false,
  };
  return { ...input, contentHash: computeEvidencePackageHash(input) };
}

function schemaIssues(
  manifest: EvidencePackageManifest,
  schema: JsonSchema,
): EvidencePackageIssue[] {
  return validate(manifest, schema).map((error) => issue(
    "schema_violation",
    error.path ? `EvidencePackage:${error.path}` : "EvidencePackage",
    error.message,
  ));
}

function unknownBudgetIssues(
  entries: EvidencePackageUnknownEntry[],
): EvidencePackageIssue[] {
  const issues: EvidencePackageIssue[] = [];
  const categories = entries.map((entry) => entry.category);
  if (!equalSets(categories, EVIDENCE_PACKAGE_UNKNOWN_CATEGORIES)) {
    issues.push(issue(
      "evidence_package_unknown_categories_mismatch",
      "unknownBudget",
      `required=${EVIDENCE_PACKAGE_UNKNOWN_CATEGORIES.join(",")}`,
    ));
  }
  for (const entry of entries) {
    const target = `unknownBudget:${entry.category}`;
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

function expectedFields(
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
): EvidencePackageManifest {
  return buildEvidencePackageManifest(request, context);
}

export function validateEvidencePackageManifest(
  manifest: EvidencePackageManifest,
  request: EvidencePackageBuildRequest,
  context: EvidencePackageContext,
  schemas: EvidencePackageSchemas,
): EvidencePackageIssue[] {
  const issues = schemaIssues(manifest, schemas.manifest);
  if (issues.length > 0) return sortIssues(issues);

  issues.push(...validateGovernedClaimGraphSnapshot(
    context.claimGraphSnapshot,
    schemas.claimSnapshot,
  ));
  issues.push(...validateGovernedDocumentRevisionDiffSnapshot(
    context.documentRevisionSnapshot,
    schemas.documentSnapshot,
  ));

  if (manifest.contentHash !== computeEvidencePackageHash(manifest)) {
    issues.push(issue(
      "invalid_evidence_package_hash",
      manifest.packageId,
      "Evidence Package contentHash mismatch",
    ));
  }
  if (new Date(manifest.createdAt).getTime() < new Date(manifest.informationCutoff).getTime()) {
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
      "Evidence/Claim/Document snapshots must use the exact informationCutoff",
    ));
  }
  if (context.securityMasterSnapshot.asOf !== jstDateOf(manifest.informationCutoff)) {
    issues.push(issue(
      "security_master_snapshot_date_mismatch",
      manifest.packageId,
      `${context.securityMasterSnapshot.asOf} != ${jstDateOf(manifest.informationCutoff)}`,
    ));
  }

  const expected = expectedFields(request, context);
  const exactFields: Array<keyof EvidencePackageManifest> = [
    "packageId",
    "candidateId",
    "listedSecurityEntityId",
    "createdAt",
    "informationCutoff",
    "securityMasterSnapshotHash",
    "evidenceSnapshotHash",
    "claimGraphSnapshotHash",
    "documentRevisionSnapshotHash",
    "priceSnapshotHash",
    "marketCalendarVersion",
    "codeVersion",
    "ruleVersion",
    "status",
  ];
  for (const field of exactFields) {
    if (stableStringify(manifest[field]) !== stableStringify(expected[field])) {
      issues.push(issue(
        "evidence_package_field_mismatch",
        `${manifest.packageId}.${field}`,
        `actual=${stableStringify(manifest[field])} expected=${stableStringify(expected[field])}`,
      ));
    }
  }

  const arrayFields: Array<
    | "entityIds"
    | "evidenceIds"
    | "supportEvidenceIds"
    | "claimIds"
    | "documentRevisionIds"
    | "diffIds"
    | "claimEligibleChangeRefs"
    | "openContradictionIds"
    | "blockers"
  > = [
    "entityIds",
    "evidenceIds",
    "supportEvidenceIds",
    "claimIds",
    "documentRevisionIds",
    "diffIds",
    "claimEligibleChangeRefs",
    "openContradictionIds",
    "blockers",
  ];
  for (const field of arrayFields) {
    issues.push(...canonicalArrayIssues(manifest[field], field));
    if (!equalSets(manifest[field], expected[field])) {
      issues.push(issue(
        "evidence_package_array_mismatch",
        `${manifest.packageId}.${field}`,
        `actual=${manifest[field].join(",")} expected=${expected[field].join(",")}`,
      ));
    }
  }

  if (
    stableStringify(manifest.benchmarkSnapshotHashes) !==
    stableStringify(expected.benchmarkSnapshotHashes)
  ) {
    issues.push(issue(
      "benchmark_snapshot_hash_mismatch",
      manifest.packageId,
      "benchmark snapshot hashes differ from the build request",
    ));
  }
  if (stableStringify(manifest.completeness) !== stableStringify(expected.completeness)) {
    issues.push(issue(
      "evidence_package_completeness_mismatch",
      manifest.packageId,
      "completeness must be derived from the pinned context",
    ));
  }
  if (stableStringify(manifest.unknownBudget) !== stableStringify(expected.unknownBudget)) {
    issues.push(issue(
      "evidence_package_unknown_budget_mismatch",
      manifest.packageId,
      "unknownBudget differs from the canonical build request",
    ));
  }
  issues.push(...unknownBudgetIssues(manifest.unknownBudget));

  if (!manifest.supportEvidenceIds.every((id) => manifest.evidenceIds.includes(id))) {
    issues.push(issue(
      "support_evidence_not_in_package_evidence",
      manifest.packageId,
      "supportEvidenceIds must be a subset of evidenceIds",
    ));
  }
  if (manifest.status === "complete" && manifest.blockers.length > 0) {
    issues.push(issue(
      "complete_evidence_package_has_blockers",
      manifest.packageId,
      manifest.blockers.join(","),
    ));
  }
  if (manifest.status === "draft" && manifest.blockers.length === 0) {
    issues.push(issue(
      "draft_evidence_package_without_blockers",
      manifest.packageId,
      "draft package must explain why it is incomplete",
    ));
  }
  if (["rejected", "superseded"].includes(manifest.status) && !manifest.supersedesPackageId) {
    issues.push(issue(
      "terminal_evidence_package_without_parent",
      manifest.packageId,
      `${manifest.status} package requires supersedesPackageId`,
    ));
  }
  return sortIssues(issues);
}

export function parseEvidencePackageJsonl(
  content: string,
  sourceName: string,
): EvidencePackageManifest[] {
  const records: EvidencePackageManifest[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as EvidencePackageManifest);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}: ${(error as Error).message}`);
    }
  }
  return records;
}
