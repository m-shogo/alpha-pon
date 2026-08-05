import { existsSync, readFileSync } from "node:fs";
import {
  validateBitemporalEvidenceRepository,
} from "./bitemporal-evidence-repository.js";
import {
  CLAIM_GRAPH_PATHS,
  activeClaimHeads,
  parseClaimGraphJsonl,
  type ClaimGraphEdgeRecord,
  type ClaimGraphIssue,
  type ClaimRecommendationAssessment,
  type ClaimRecord,
} from "./claim-contradiction-graph.js";
import {
  type GovernedClaimGraphSnapshot,
} from "./claim-contradiction-graph-hardening.js";
import {
  assessClaimForRecommendationAtCutoff,
  buildClaimGraphSnapshotGovernedAtCutoff,
  validateClaimGraphGovernedAtCutoff,
  visibleClaimRecordsAtCutoff,
} from "./claim-contradiction-graph-governed.js";
import {
  SECURITY_MASTER_PATHS,
} from "./security-master.js";
import {
  validateSecurityMasterRepository,
} from "./security-master-repository.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type ClaimGraphRepositoryOptions = {
  claimsPath?: string;
  edgesPath?: string;
  evidencePath?: string;
  evidenceRelationsPath?: string;
  securityEntitiesPath?: string;
  securityRelationshipsPath?: string;
  asOf?: string;
  includeDependencyIssues?: boolean;
};

export type ClaimGraphRepositoryResult = {
  issues: ClaimGraphIssue[];
  claimRecordCount: number;
  edgeRecordCount: number;
  activeClaimHeadCount: number;
  snapshotClaimCount: number;
  snapshotEdgeCount: number;
  recommendationEligibleClaimCount: number;
  blockedClaimCount: number;
  assessments: ClaimRecommendationAssessment[];
  snapshot: GovernedClaimGraphSnapshot | null;
};

function issue(code: string, target: string, message: string): ClaimGraphIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: ClaimGraphIssue[]): ClaimGraphIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readStrictJsonl<T>(path: string): { records: T[]; issues: ClaimGraphIssue[] } {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_claim_graph_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return { records: parseClaimGraphJsonl<T>(content, path), issues: [] };
  } catch (error) {
    return {
      records: [],
      issues: [issue("invalid_claim_graph_jsonl", path, (error as Error).message)],
    };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function jstDateOf(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function validateClaimGraphRepository(
  options: ClaimGraphRepositoryOptions = {},
): ClaimGraphRepositoryResult {
  const claimsPath = options.claimsPath ?? CLAIM_GRAPH_PATHS.claims;
  const edgesPath = options.edgesPath ?? CLAIM_GRAPH_PATHS.edges;
  const asOf = options.asOf ?? nowIso();
  const claimsRead = readStrictJsonl<ClaimRecord>(claimsPath);
  const edgesRead = readStrictJsonl<ClaimGraphEdgeRecord>(edgesPath);

  const security = validateSecurityMasterRepository({
    entitiesPath: options.securityEntitiesPath ?? SECURITY_MASTER_PATHS.entities,
    relationshipsPath: options.securityRelationshipsPath ?? SECURITY_MASTER_PATHS.relationships,
    asOf: jstDateOf(asOf),
  });
  const evidence = validateBitemporalEvidenceRepository({
    evidencePath: options.evidencePath,
    relationsPath: options.evidenceRelationsPath,
    securityEntitiesPath: options.securityEntitiesPath,
    securityRelationshipsPath: options.securityRelationshipsPath,
    asOf,
    includeSecurityMasterIssues: false,
  });

  const issues: ClaimGraphIssue[] = [
    ...claimsRead.issues,
    ...edgesRead.issues,
    ...(options.includeDependencyIssues === false
      ? []
      : [
        ...security.issues.map((item) => ({ ...item })),
        ...evidence.issues.map((item) => ({ ...item })),
      ]),
  ];

  const journalPath = `${claimsPath}.batch-journal.json`;
  if (existsSync(journalPath)) {
    issues.push(issue(
      "incomplete_claim_graph_batch",
      journalPath,
      "未完了Claim Graph batchがあります。自動復旧・自動削除は禁止です",
    ));
  }

  const schemas = {
    claim: loadCouncilSchema(CLAIM_GRAPH_PATHS.claimSchema),
    edge: loadCouncilSchema(CLAIM_GRAPH_PATHS.edgeSchema),
  };
  const knownEntityIds = new Set(
    security.snapshot.entities.map((record) => record.entityId),
  );
  issues.push(...validateClaimGraphGovernedAtCutoff(
    claimsRead.records,
    edgesRead.records,
    schemas,
    evidence.snapshot,
    knownEntityIds,
  ));

  let snapshot: GovernedClaimGraphSnapshot | null = null;
  const assessments: ClaimRecommendationAssessment[] = [];
  const visibleClaims = visibleClaimRecordsAtCutoff(claimsRead.records, asOf);
  const visibleHeads = activeClaimHeads(visibleClaims)
    .sort((a, b) => a.claimId.localeCompare(b.claimId));
  if (!issues.some((item) => item.severity === "error")) {
    try {
      snapshot = buildClaimGraphSnapshotGovernedAtCutoff(
        claimsRead.records,
        edgesRead.records,
        schemas,
        evidence.snapshot,
        knownEntityIds,
      );
      for (const claim of visibleHeads) {
        assessments.push(assessClaimForRecommendationAtCutoff(
          claimsRead.records,
          edgesRead.records,
          schemas,
          evidence.snapshot,
          claim.claimId,
          knownEntityIds,
        ));
      }
    } catch (error) {
      issues.push(issue("claim_graph_snapshot_failed", claimsPath, (error as Error).message));
      snapshot = null;
    }
  }

  return {
    issues: sortIssues(issues),
    claimRecordCount: claimsRead.records.length,
    edgeRecordCount: edgesRead.records.length,
    activeClaimHeadCount: visibleHeads.length,
    snapshotClaimCount: snapshot?.claimIds.length ?? 0,
    snapshotEdgeCount: snapshot?.edgeIds.length ?? 0,
    recommendationEligibleClaimCount: assessments.filter((item) => item.eligible).length,
    blockedClaimCount: assessments.filter((item) => !item.eligible).length,
    assessments,
    snapshot,
  };
}
