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
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";

function after(left: string, right: string, leftTarget: string, rightTarget: string): boolean {
  return compareExplicitIso8601Instants(left, right, leftTarget, rightTarget) > 0;
}

function before(left: string, right: string, leftTarget: string, rightTarget: string): boolean {
  return compareExplicitIso8601Instants(left, right, leftTarget, rightTarget) < 0;
}

function availableAtCutoff(
  record: {
    observedAt: string;
    retrievedAt: string;
    effectiveFrom: string;
    effectiveTo?: string;
  },
  cutoff: string,
): boolean {
  if (after(record.observedAt, cutoff, "record.observedAt", "Claim Graph cutoff")) return false;
  if (after(record.retrievedAt, cutoff, "record.retrievedAt", "Claim Graph cutoff")) return false;
  if (after(record.effectiveFrom, cutoff, "record.effectiveFrom", "Claim Graph cutoff")) return false;
  if (record.effectiveTo && before(record.effectiveTo, cutoff, "record.effectiveTo", "Claim Graph cutoff")) return false;
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
  parseExplicitIso8601Instant(asOf, "Claim Graph cutoff");
  return claims.filter((record) => availableAtCutoff(record, asOf));
}

export function visibleClaimEdgeRecordsAtCutoff(
  edges: ClaimGraphEdgeRecord[],
  asOf: string,
): ClaimGraphEdgeRecord[] {
  parseExplicitIso8601Instant(asOf, "Claim Graph cutoff");
  return edges.filter((record) => availableAtCutoff(record, asOf));
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
  parseExplicitIso8601Instant(evidenceSnapshot.asOf, "Claim Graph cutoff");
  const issues: ClaimGraphIssue[] = [];
  for (const record of claims) {
    if (
      after(record.observedAt, evidenceSnapshot.asOf, `claim:${record.claimId}.observedAt`, "Claim Graph cutoff") ||
      after(record.retrievedAt, evidenceSnapshot.asOf, `claim:${record.claimId}.retrievedAt`, "Claim Graph cutoff") ||
      after(record.effectiveFrom, evidenceSnapshot.asOf, `claim:${record.claimId}.effectiveFrom`, "Claim Graph cutoff")
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
      after(record.observedAt, evidenceSnapshot.asOf, `claim-edge:${record.edgeId}.observedAt`, "Claim Graph cutoff") ||
      after(record.retrievedAt, evidenceSnapshot.asOf, `claim-edge:${record.edgeId}.retrievedAt`, "Claim Graph cutoff") ||
      after(record.effectiveFrom, evidenceSnapshot.asOf, `claim-edge:${record.edgeId}.effectiveFrom`, "Claim Graph cutoff")
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
