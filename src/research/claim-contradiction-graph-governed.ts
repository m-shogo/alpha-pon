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
  return validateClaimGraphGovernance(
    visibleClaimRecordsAtCutoff(claims, evidenceSnapshot.asOf),
    visibleClaimEdgeRecordsAtCutoff(edges, evidenceSnapshot.asOf),
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
}

export function buildClaimGraphSnapshotGovernedAtCutoff(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): GovernedClaimGraphSnapshot {
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
  return issues.sort((a, b) =>
    `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`),
  );
}
