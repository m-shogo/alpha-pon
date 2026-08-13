import { existsSync, readFileSync } from "node:fs";
import {
  EVIDENCE_STORE_PATHS,
} from "./bitemporal-evidence-store.js";
import {
  validateBitemporalEvidenceRepository,
} from "./bitemporal-evidence-repository.js";
import {
  CLAIM_GRAPH_PATHS,
} from "./claim-contradiction-graph.js";
import {
  validateClaimGraphRepository,
} from "./claim-contradiction-graph-repository.js";
import {
  DOCUMENT_REVISION_DIFF_PATHS,
} from "./document-revision-diff.js";
import {
  validateDocumentRevisionDiffRepository,
} from "./document-revision-diff-repository.js";
import {
  EVIDENCE_PACKAGE_PATHS,
  parseEvidencePackageJsonl,
  type EvidencePackageBuildRequest,
  type EvidencePackageContext,
  type EvidencePackageIssue,
  type EvidencePackageManifest,
  type EvidencePackageSchemas,
} from "./evidence-package-manifest.js";
import {
  validateEvidencePackageManifestGoverned,
  type EvidencePackageExternalPinResolver,
} from "./evidence-package-governed.js";
import {
  activeEvidencePackageHeads,
  validateEvidencePackageLedger,
} from "./evidence-package-ledger.js";
import {
  SECURITY_MASTER_PATHS,
} from "./security-master.js";
import {
  validateSecurityMasterRepository,
} from "./security-master-repository.js";
import { validate } from "./schema.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type EvidencePackageRepositoryOptions = {
  manifestsPath?: string;
  claimsPath?: string;
  claimEdgesPath?: string;
  documentRevisionsPath?: string;
  documentDiffsPath?: string;
  evidencePath?: string;
  evidenceRelationsPath?: string;
  securityEntitiesPath?: string;
  securityRelationshipsPath?: string;
  externalPins?: EvidencePackageExternalPinResolver;
  includeDependencyIssues?: boolean;
};

export type EvidencePackageRepositoryResult = {
  issues: EvidencePackageIssue[];
  manifestCount: number;
  activeHeadCount: number;
  draftHeadCount: number;
  completeHeadCount: number;
  manifests: EvidencePackageManifest[];
};

type DependencyContext = {
  context: EvidencePackageContext | null;
  issues: EvidencePackageIssue[];
};

function issue(
  code: string,
  target: string,
  message: string,
): EvidencePackageIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: EvidencePackageIssue[]): EvidencePackageIssue[] {
  const unique = new Map<string, EvidencePackageIssue>();
  for (const item of issues) {
    unique.set(
      `${item.severity}|${item.code}|${item.target}|${item.message}`,
      item,
    );
  }
  return [...unique.values()].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readStrict(path: string): {
  records: EvidencePackageManifest[];
  issues: EvidencePackageIssue[];
} {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_evidence_package_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return {
      records: parseEvidencePackageJsonl(content, path),
      issues: [],
    };
  } catch (error) {
    return {
      records: [],
      issues: [issue(
        "invalid_evidence_package_jsonl",
        path,
        (error as Error).message,
      )],
    };
  }
}

function emptyResolver(): EvidencePackageExternalPinResolver {
  return {
    priceSnapshotHashes: new Set(),
    benchmarkSnapshotHashes: {
      issuer: new Set(),
      topix: new Set(),
      sector: new Set(),
    },
  };
}

function jstDateOf(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function loadSchemas(): EvidencePackageSchemas {
  return {
    manifest: loadCouncilSchema(EVIDENCE_PACKAGE_PATHS.schema),
    claimSnapshot: loadCouncilSchema(
      "research/schemas/claim-graph-snapshot.schema.json",
    ),
    documentSnapshot: loadCouncilSchema(
      "research/schemas/document-revision-diff-snapshot.schema.json",
    ),
  };
}

function requestFromManifest(
  manifest: EvidencePackageManifest,
): EvidencePackageBuildRequest {
  return {
    packageId: manifest.packageId,
    candidateId: manifest.candidateId,
    listedSecurityEntityId: manifest.listedSecurityEntityId,
    entityIds: [...manifest.entityIds],
    createdAt: manifest.createdAt,
    informationCutoff: manifest.informationCutoff,
    priceSnapshotHash: manifest.priceSnapshotHash,
    benchmarkSnapshotHashes: { ...manifest.benchmarkSnapshotHashes },
    marketCalendarVersion: manifest.marketCalendarVersion,
    codeVersion: manifest.codeVersion,
    ruleVersion: manifest.ruleVersion,
    correctionChainComplete: manifest.completeness.correctionChainComplete,
    documentDiffReviewed: manifest.completeness.documentDiffReviewed,
    benchmarkComplete: manifest.completeness.benchmarkComplete,
    priceSnapshotComplete: manifest.completeness.priceSnapshotComplete,
    executionRouteComplete: manifest.completeness.executionRouteComplete,
    unknownBudget: manifest.unknownBudget.map((entry) => ({
      ...entry,
      evidenceRefs: [...entry.evidenceRefs],
    })),
    ...(manifest.supersedesPackageId
      ? { supersedesPackageId: manifest.supersedesPackageId }
      : {}),
  };
}

function dependencyContext(
  cutoff: string,
  options: EvidencePackageRepositoryOptions,
): DependencyContext {
  const security = validateSecurityMasterRepository({
    entitiesPath:
      options.securityEntitiesPath ?? SECURITY_MASTER_PATHS.entities,
    relationshipsPath:
      options.securityRelationshipsPath ?? SECURITY_MASTER_PATHS.relationships,
    asOf: jstDateOf(cutoff),
  });
  const evidence = validateBitemporalEvidenceRepository({
    evidencePath: options.evidencePath ?? EVIDENCE_STORE_PATHS.evidence,
    relationsPath:
      options.evidenceRelationsPath ?? EVIDENCE_STORE_PATHS.relations,
    securityEntitiesPath: options.securityEntitiesPath,
    securityRelationshipsPath: options.securityRelationshipsPath,
    asOf: cutoff,
    includeSecurityMasterIssues: false,
  });
  const claim = validateClaimGraphRepository({
    claimsPath: options.claimsPath ?? CLAIM_GRAPH_PATHS.claims,
    edgesPath: options.claimEdgesPath ?? CLAIM_GRAPH_PATHS.edges,
    evidencePath: options.evidencePath,
    evidenceRelationsPath: options.evidenceRelationsPath,
    securityEntitiesPath: options.securityEntitiesPath,
    securityRelationshipsPath: options.securityRelationshipsPath,
    asOf: cutoff,
    includeDependencyIssues: false,
  });
  const document = validateDocumentRevisionDiffRepository({
    revisionsPath:
      options.documentRevisionsPath ?? DOCUMENT_REVISION_DIFF_PATHS.revisions,
    diffsPath: options.documentDiffsPath ?? DOCUMENT_REVISION_DIFF_PATHS.diffs,
    evidencePath: options.evidencePath,
    evidenceRelationsPath: options.evidenceRelationsPath,
    securityEntitiesPath: options.securityEntitiesPath,
    securityRelationshipsPath: options.securityRelationshipsPath,
    asOf: cutoff,
    includeDependencyIssues: false,
  });

  const allDependencyIssues: EvidencePackageIssue[] = [
    ...security.issues.map((item) => ({ ...item })),
    ...evidence.issues.map((item) => ({ ...item })),
    ...claim.issues.map((item) => ({ ...item })),
    ...document.issues.map((item) => ({ ...item })),
  ];
  const dependencyIssues: EvidencePackageIssue[] = options.includeDependencyIssues === false
    ? []
    : allDependencyIssues;
  if (allDependencyIssues.some((item) => item.severity === "error")) {
    return {
      context: null,
      issues: [
        ...dependencyIssues,
        issue(
          "evidence_package_dependency_invalid",
          cutoff,
          "dependency repository validation failed; Evidence Package remains ineligible",
        ),
      ],
    };
  }
  if (!claim.snapshot || !document.snapshot) {
    return {
      context: null,
      issues: [
        ...dependencyIssues,
        issue(
          "evidence_package_dependency_snapshot_missing",
          cutoff,
          `claimSnapshot=${Boolean(claim.snapshot)} documentSnapshot=${Boolean(document.snapshot)}`,
        ),
      ],
    };
  }
  return {
    context: {
      securityMasterSnapshot: security.snapshot,
      evidenceSnapshot: evidence.snapshot,
      claimGraphSnapshot: claim.snapshot,
      documentRevisionSnapshot: document.snapshot,
      claimAssessments: claim.assessments,
      claimEligibleChanges: document.claimEligibleChanges,
    },
    issues: dependencyIssues,
  };
}

export function validateEvidencePackageRepository(
  options: EvidencePackageRepositoryOptions = {},
): EvidencePackageRepositoryResult {
  const manifestsPath = options.manifestsPath ?? EVIDENCE_PACKAGE_PATHS.manifests;
  const read = readStrict(manifestsPath);
  const issues: EvidencePackageIssue[] = [...read.issues];
  const schemas = loadSchemas();
  const resolver = options.externalPins ?? emptyResolver();
  const contexts = new Map<string, DependencyContext>();
  const schemaValidManifests: EvidencePackageManifest[] = [];
  const governedValidManifests: EvidencePackageManifest[] = [];

  for (const manifest of read.records) {
    const manifestSchemaIssues = validate(manifest, schemas.manifest).map((error) => issue(
      "schema_violation",
      error.path ? `EvidencePackage:${error.path}` : "EvidencePackage",
      error.message,
    ));
    if (manifestSchemaIssues.length > 0) {
      issues.push(...manifestSchemaIssues);
      continue;
    }
    schemaValidManifests.push(manifest);

    let dependency = contexts.get(manifest.informationCutoff);
    if (!dependency) {
      dependency = dependencyContext(manifest.informationCutoff, options);
      contexts.set(manifest.informationCutoff, dependency);
    }
    issues.push(...dependency.issues);
    if (!dependency.context) continue;
    const governedIssues = validateEvidencePackageManifestGoverned(
      manifest,
      requestFromManifest(manifest),
      dependency.context,
      resolver,
      schemas,
    );
    issues.push(...governedIssues);
    if (
      dependency.issues.every((item) => item.severity !== "error")
      && governedIssues.every((item) => item.severity !== "error")
    ) {
      governedValidManifests.push(manifest);
    }
  }
  issues.push(...validateEvidencePackageLedger(schemaValidManifests));

  const heads = activeEvidencePackageHeads(governedValidManifests);
  return {
    issues: sortIssues(issues),
    manifestCount: read.records.length,
    activeHeadCount: heads.length,
    draftHeadCount: heads.filter((record) => record.status === "draft").length,
    completeHeadCount: heads.filter((record) => record.status === "complete").length,
    manifests: read.records,
  };
}
