import type { EvidenceSnapshot } from "./bitemporal-evidence-store.js";
import type {
  ClaimGraphEdgeRecord,
  ClaimGraphIssue,
  ClaimRecord,
} from "./claim-contradiction-graph.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";

function before(
  left: string,
  right: string,
  leftTarget: string,
  rightTarget: string,
): boolean {
  return compareExplicitIso8601Instants(left, right, leftTarget, rightTarget) < 0;
}

function issue(code: string, target: string, message: string): ClaimGraphIssue {
  return { severity: "error", code, target, message };
}

function earliestClaimById(claims: ClaimRecord[]): Map<string, ClaimRecord> {
  const selected = new Map<string, ClaimRecord>();
  for (const record of claims) {
    const prior = selected.get(record.claimId);
    const observedOrder = prior
      ? compareExplicitIso8601Instants(record.observedAt, prior.observedAt)
      : -1;
    if (
      !prior ||
      observedOrder < 0 ||
      (
        observedOrder === 0 &&
        compareExplicitIso8601Instants(record.retrievedAt, prior.retrievedAt) < 0
      )
    ) {
      selected.set(record.claimId, record);
    }
  }
  return selected;
}

export function validateClaimGraphEndpointChronology(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  evidenceSnapshot: EvidenceSnapshot,
): ClaimGraphIssue[] {
  const issues: ClaimGraphIssue[] = [];
  const claimById = earliestClaimById(claims);
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
      if (before(
        edge.observedAt,
        endpoint.observedAt,
        `${target}.observedAt`,
        `claim:${endpoint.claimId}:${endpoint.recordId}.observedAt`,
      )) {
        issues.push(issue(
          "claim_edge_observed_before_claim_endpoint",
          target,
          `${edge.observedAt} < ${endpoint.claimId}:${endpoint.observedAt}`,
        ));
      }
      if (before(
        edge.retrievedAt,
        endpoint.retrievedAt,
        `${target}.retrievedAt`,
        `claim:${endpoint.claimId}:${endpoint.recordId}.retrievedAt`,
      )) {
        issues.push(issue(
          "claim_edge_retrieved_before_claim_endpoint",
          target,
          `${edge.retrievedAt} < ${endpoint.claimId}:${endpoint.retrievedAt}`,
        ));
      }
    }

    if (fromEvidence) {
      if (before(
        edge.observedAt,
        fromEvidence.observedAt,
        `${target}.observedAt`,
        `evidence:${fromEvidence.evidenceId}:${fromEvidence.recordId}.observedAt`,
      )) {
        issues.push(issue(
          "claim_edge_observed_before_evidence_endpoint",
          target,
          `${edge.observedAt} < ${fromEvidence.evidenceId}:${fromEvidence.observedAt}`,
        ));
      }
      if (before(
        edge.retrievedAt,
        fromEvidence.retrievedAt,
        `${target}.retrievedAt`,
        `evidence:${fromEvidence.evidenceId}:${fromEvidence.recordId}.retrievedAt`,
      )) {
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
      before(
        fromClaim.observedAt,
        toClaim.observedAt,
        `claim:${fromClaim.claimId}:${fromClaim.recordId}.observedAt`,
        `claim:${toClaim.claimId}:${toClaim.recordId}.observedAt`,
      )
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
