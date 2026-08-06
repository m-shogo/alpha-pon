import type { EvidenceSnapshot } from "./bitemporal-evidence-store.js";
import type {
  ClaimGraphEdgeRecord,
  ClaimGraphIssue,
  ClaimRecord,
} from "./claim-contradiction-graph.js";

function timeMs(value: string): number {
  return Date.parse(value);
}

function issue(code: string, target: string, message: string): ClaimGraphIssue {
  return { severity: "error", code, target, message };
}

export function validateClaimGraphEndpointChronology(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  evidenceSnapshot: EvidenceSnapshot,
): ClaimGraphIssue[] {
  const issues: ClaimGraphIssue[] = [];
  const claimById = new Map(claims.map((record) => [record.claimId, record]));
  const evidenceById = new Map(
    evidenceSnapshot.evidence.map((record) => [record.evidenceId, record]),
  );

  for (const edge of edges) {
    const target = `claim-edge:${edge.edgeId}:${edge.recordId}`;
    const fromClaim = edge.fromKind === "claim" ? claimById.get(edge.fromId) : undefined;
    const toClaim = edge.toKind === "claim" ? claimById.get(edge.toId) : undefined;
    const fromEvidence = edge.fromKind === "evidence"
      ? evidenceById.get(edge.fromId)
      : undefined;

    for (const endpoint of [fromClaim, toClaim]) {
      if (!endpoint) continue;
      if (timeMs(edge.observedAt) < timeMs(endpoint.observedAt)) {
        issues.push(issue(
          "claim_edge_observed_before_claim_endpoint",
          target,
          `${edge.observedAt} < ${endpoint.claimId}:${endpoint.observedAt}`,
        ));
      }
      if (timeMs(edge.retrievedAt) < timeMs(endpoint.retrievedAt)) {
        issues.push(issue(
          "claim_edge_retrieved_before_claim_endpoint",
          target,
          `${edge.retrievedAt} < ${endpoint.claimId}:${endpoint.retrievedAt}`,
        ));
      }
    }

    if (fromEvidence) {
      if (timeMs(edge.observedAt) < timeMs(fromEvidence.observedAt)) {
        issues.push(issue(
          "claim_edge_observed_before_evidence_endpoint",
          target,
          `${edge.observedAt} < ${fromEvidence.evidenceId}:${fromEvidence.observedAt}`,
        ));
      }
      if (timeMs(edge.retrievedAt) < timeMs(fromEvidence.retrievedAt)) {
        issues.push(issue(
          "claim_edge_retrieved_before_evidence_endpoint",
          target,
          `${edge.retrievedAt} < ${fromEvidence.evidenceId}:${fromEvidence.retrievedAt}`,
        ));
      }
    }

    if (
      (edge.strength === "material" || edge.strength === "binding") &&
      edge.sourceEvidenceIds.length === 0
    ) {
      issues.push(issue(
        "material_claim_edge_without_evidence",
        target,
        `${edge.strength} edgeにはsourceEvidenceIdsが必要です`,
      ));
    }

    if (
      ["corrects", "supersedes", "invalidates", "expires"].includes(edge.relationType) &&
      fromClaim &&
      toClaim &&
      timeMs(fromClaim.observedAt) < timeMs(toClaim.observedAt)
    ) {
      issues.push(issue(
        "claim_disposition_from_older_claim",
        target,
        `${fromClaim.claimId}は${toClaim.claimId}以後に観測される必要があります`,
      ));
    }
  }

  return issues.sort((a, b) =>
    `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`),
  );
}
