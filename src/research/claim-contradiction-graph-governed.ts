import type { EvidenceSnapshot } from "./bitemporal-evidence-store.js";
import {
  type ClaimGraphEdgeRecord,
  type ClaimGraphIssue,
  type ClaimGraphSchemas,
  type ClaimRecord,
  type ClaimRecommendationAssessment,
} from "./claim-contradiction-graph.js";
import {
  assessClaimForRecommendationGoverned,
  buildGovernedClaimGraphSnapshot,
  validateClaimGraphGovernance,
  type GovernedClaimGraphSnapshot,
} from "./claim-contradiction-graph-hardening.js";
import {
  validateClaimGraphEndpointChronology,
} from "./claim-contradiction-graph-integrity.js";

function timeMs(value: string): number {
  return Date.parse(value);
}

function availableAtCutoff(
  record: {
    observedAt: string;
    retrievedAt: string;
    effectiveFrom: string;
    effectiveTo?: string;
  },
  cutoffMs: number,
): boolean {
  if (timeMs(record.observedAt) > cutoffMs) return false;
  if (timeMs(record.retrievedAt) > cutoffMs) return false;
  if (timeMs(record.effectiveFrom) > cutoffMs) return false;
  if (record.effectiveTo && timeMs(record.effectiveTo) < cutoffMs) return false;
  return true;
}

function sortIssues(issues: ClaimGraphIssue[]): ClaimGraphIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

export function visibleClaimRecordsAtCutoff(
  claims: ClaimRecord[],
  asOf: string,
): ClaimRecord[] {
  const cutoffMs = timeMs(asOf);
  if (!Number.isFinite(cutoffMs)) throw new Error(`invalid Claim Graph cutoff: ${asOf}`);
  return claims.filter((record) => availableAtCutoff(record, cutoffMs));
}

export function visibleClaimEdgeRecordsAtCutoff(
  edges: ClaimGraphEdgeRecord[],
  asOf: string,
): ClaimGraphEdgeRecord[] {
  const cutoffMs = timeMs(asOf);
  if (!Number.isFinite(cutoffMs)) throw new Error(`invalid Claim Graph cutoff: ${asOf}`);
  return edges.filter((record) => availableAtCutoff(record, cutoffMs));
}

export function validateClaimGraphGovernedAtCutoff(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): ClaimGraphIssue[] {
  if (evidenceSnapshot.mode !== "system_replay") {
    return [{
      severity: "error",
      code: "claim_graph_requires_system_replay",
      target: evidenceSnapshot.asOf,
      message: "Claim Graphはsystem_replay Evidence Snapshotだけを利用できます",
    }];
  }
  const visibleClaims = visibleClaimRecordsAtCutoff(claims, evidenceSnapshot.asOf);
  const visibleEdges = visibleClaimEdgeRecordsAtCutoff(edges, evidenceSnapshot.asOf);
  return sortIssues([
    ...validateClaimGraphGovernance(
      visibleClaims,
      visibleEdges,
      schemas,
      evidenceSnapshot,
      knownEntityIds,
    ),
    ...validateClaimGraphEndpointChronology(
      visibleClaims,
      visibleEdges,
      evidenceSnapshot,
    ),
  ]);
}

export function buildClaimGraphSnapshotGovernedAtCutoff(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): GovernedClaimGraphSnapshot {
  const errors = validateClaimGraphGovernedAtCutoff(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }
  return buildGovernedClaimGraphSnapshot(
    visibleClaimRecordsAtCutoff(claims, evidenceSnapshot.asOf),
    visibleClaimEdgeRecordsAtCutoff(edges, evidenceSnapshot.asOf),
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
}

export function assessClaimForRecommendationAtCutoff(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  claimId: string,
  knownEntityIds?: ReadonlySet<string>,
): ClaimRecommendationAssessment {
  const errors = validateClaimGraphGovernedAtCutoff(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }
  return assessClaimForRecommendationGoverned(
    visibleClaimRecordsAtCutoff(claims, evidenceSnapshot.asOf),
    visibleClaimEdgeRecordsAtCutoff(edges, evidenceSnapshot.asOf),
    schemas,
    evidenceSnapshot,
    claimId,
    knownEntityIds,
  );
}

export function validateIncomingClaimGraphCutoff(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  evidenceSnapshot: EvidenceSnapshot,
): ClaimGraphIssue[] {
  const cutoffMs = timeMs(evidenceSnapshot.asOf);
  const issues: ClaimGraphIssue[] = [];
  for (const record of claims) {
    if (
      timeMs(record.observedAt) > cutoffMs ||
      timeMs(record.retrievedAt) > cutoffMs ||
      timeMs(record.effectiveFrom) > cutoffMs
    ) {
      issues.push({
        severity: "error",
        code: "incoming_claim_after_snapshot_cutoff",
        target: record.recordId,
        message: `${record.claimId} is not available at ${evidenceSnapshot.asOf}`,
      });
    }
  }
  for (const record of edges) {
    if (
      timeMs(record.observedAt) > cutoffMs ||
      timeMs(record.retrievedAt) > cutoffMs ||
      timeMs(record.effectiveFrom) > cutoffMs
    ) {
      issues.push({
        severity: "error",
        code: "incoming_claim_edge_after_snapshot_cutoff",
        target: record.recordId,
        message: `${record.edgeId} is not available at ${evidenceSnapshot.asOf}`,
      });
    }
  }
  return sortIssues(issues);
}
