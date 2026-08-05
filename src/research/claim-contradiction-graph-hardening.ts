import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type {
  EvidenceRecord,
  EvidenceSnapshot,
} from "./bitemporal-evidence-store.js";
import {
  recommendationEligibleEvidence,
} from "./bitemporal-evidence-store.js";
import {
  buildClaimGraphSnapshot,
  parseClaimGraphJsonl,
  validateClaimContradictionGraph,
  type ClaimGraphEdgeRecord,
  type ClaimGraphIssue,
  type ClaimGraphSchemas,
  type ClaimRecord,
  type ClaimRecommendationAssessment,
} from "./claim-contradiction-graph.js";
import { stableStringify } from "./schema.js";

export type GovernedClaimGraphSnapshot = {
  asOf: string;
  mode: "system_replay";
  claimSnapshotHash: string;
  evidenceSnapshotHash: string;
  claimIds: string[];
  edgeIds: string[];
  evidenceIds: string[];
  contentHash: string;
};

export type ClaimGraphStorePaths = {
  claims: string;
  edges: string;
};

export type ClaimGraphAppendBatch = {
  claims: ClaimRecord[];
  edges: ClaimGraphEdgeRecord[];
};

const PRIMARY_TIERS = new Set([
  "primary_authoritative",
  "primary_company",
]);

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function issue(
  code: string,
  target: string,
  message: string,
  severity: ClaimGraphIssue["severity"] = "error",
): ClaimGraphIssue {
  return { severity, code, target, message };
}

function sortIssues(issues: ClaimGraphIssue[]): ClaimGraphIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function timeMs(value: string): number {
  return Date.parse(value);
}

function directEvidenceById(snapshot: EvidenceSnapshot): Map<string, EvidenceRecord> {
  return new Map(snapshot.evidence.map((record) => [record.evidenceId, record]));
}

export function computeEvidenceSnapshotHash(snapshot: EvidenceSnapshot): string {
  return hashValue({
    asOf: snapshot.asOf,
    mode: snapshot.mode,
    boundary: snapshot.boundary,
    evidence: [...snapshot.evidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
    relations: [...snapshot.relations].sort((a, b) => a.relationId.localeCompare(b.relationId)),
  });
}

export function validateClaimGraphGovernance(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): ClaimGraphIssue[] {
  const issues = validateClaimContradictionGraph(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  const evidenceById = directEvidenceById(evidenceSnapshot);
  const claimById = new Map(claims.map((record) => [record.claimId, record]));

  for (const edge of edges) {
    const target = `claim-edge:${edge.edgeId}:${edge.recordId}`;
    if (edge.strength === "binding") {
      for (const evidenceId of edge.sourceEvidenceIds) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence && !PRIMARY_TIERS.has(evidence.evidenceTier)) {
          issues.push(issue(
            "binding_claim_edge_requires_primary_evidence",
            target,
            `${evidenceId} tier=${evidence.evidenceTier}`,
          ));
        }
      }
    }

    if (
      ["corrects", "supersedes", "invalidates", "expires"].includes(edge.relationType) &&
      edge.fromKind === "claim" &&
      edge.toKind === "claim"
    ) {
      const from = claimById.get(edge.fromId);
      const to = claimById.get(edge.toId);
      if (from && to) {
        const sharesEntity = from.entityIds.some((entityId) => to.entityIds.includes(entityId));
        if (!sharesEntity) {
          issues.push(issue(
            "claim_disposition_without_shared_entity",
            target,
            `${edge.fromId}と${edge.toId}に共通entityIdがありません`,
          ));
        }
        if (timeMs(edge.observedAt) < timeMs(from.observedAt)) {
          issues.push(issue(
            "claim_edge_before_source_claim",
            target,
            `${edge.observedAt} < ${from.observedAt}`,
          ));
        }
      }
    }

    if (
      ["better_peer", "external_factor"].includes(edge.relationType) &&
      edge.strength === "binding"
    ) {
      issues.push(issue(
        "explanatory_edge_cannot_be_binding",
        target,
        `${edge.relationType}は説明・代替仮説でありbinding dispositionには使えません`,
      ));
    }
  }

  return sortIssues(issues);
}

export function buildGovernedClaimGraphSnapshot(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): GovernedClaimGraphSnapshot {
  const errors = validateClaimGraphGovernance(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }
  const claimSnapshot = buildClaimGraphSnapshot(
    claims,
    edges,
    evidenceSnapshot,
    evidenceSnapshot.asOf,
  );
  const input = {
    asOf: evidenceSnapshot.asOf,
    mode: "system_replay" as const,
    claimSnapshotHash: claimSnapshot.contentHash,
    evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
    claimIds: claimSnapshot.claims.map((record) => record.claimId).sort(),
    edgeIds: claimSnapshot.edges.map((record) => record.edgeId).sort(),
    evidenceIds: evidenceSnapshot.evidence.map((record) => record.evidenceId).sort(),
  };
  return { ...input, contentHash: hashValue(input) };
}

export function assessClaimForRecommendationGoverned(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  claimId: string,
  knownEntityIds?: ReadonlySet<string>,
): ClaimRecommendationAssessment {
  buildGovernedClaimGraphSnapshot(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  const claimSnapshot = buildClaimGraphSnapshot(
    claims,
    edges,
    evidenceSnapshot,
    evidenceSnapshot.asOf,
  );
  const claim = claimSnapshot.claims.find((record) => record.claimId === claimId);
  if (!claim) throw new Error(`claim not found in governed snapshot: ${claimId}`);

  const eligibleEvidenceIds = new Set(
    recommendationEligibleEvidence(evidenceSnapshot).map((record) => record.evidenceId),
  );
  const incoming = claimSnapshot.edges.filter((edge) =>
    edge.toKind === "claim" && edge.toId === claimId,
  );
  const supportEvidenceIds = [...new Set(incoming.flatMap((edge) => {
    if (!["supports", "confirms"].includes(edge.relationType)) return [];
    const direct = edge.fromKind === "evidence" ? [edge.fromId] : [];
    return [...direct, ...edge.sourceEvidenceIds]
      .filter((evidenceId) => eligibleEvidenceIds.has(evidenceId));
  }))].sort();
  const contradictionEvidenceIds = [...new Set(incoming.flatMap((edge) =>
    edge.relationType === "contradicts" ? edge.sourceEvidenceIds : [],
  ))].sort();
  const supportingClaimIds = [...new Set(incoming.flatMap((edge) =>
    edge.fromKind === "claim" && ["supports", "confirms"].includes(edge.relationType)
      ? [edge.fromId]
      : [],
  ))].sort();
  const contradictingClaimIds = [...new Set(incoming.flatMap((edge) =>
    edge.fromKind === "claim" && edge.relationType === "contradicts"
      ? [edge.fromId]
      : [],
  ))].sort();
  const competingClaimIds = [...new Set(claimSnapshot.edges.flatMap((edge) => {
    if (edge.relationType !== "competes_with") return [];
    if (edge.fromKind === "claim" && edge.fromId === claimId && edge.toKind === "claim") {
      return [edge.toId];
    }
    if (edge.toKind === "claim" && edge.toId === claimId && edge.fromKind === "claim") {
      return [edge.fromId];
    }
    return [];
  }))].sort();

  const blockers: string[] = [];
  const disposition = claimSnapshot.claimDisposition[claimId];
  if (disposition !== "active") blockers.push(`claim_disposition:${disposition}`);
  if (["opinion", "unknown"].includes(claim.claimClass)) {
    blockers.push(`claim_class_not_recommendation_evidence:${claim.claimClass}`);
  }
  if (claim.unknownRefs.length > 0) blockers.push("claim_has_unresolved_unknowns");
  if (
    ["fact", "assumption", "forecast"].includes(claim.claimClass) &&
    supportEvidenceIds.length === 0
  ) blockers.push("claim_without_eligible_supporting_evidence");
  if (
    ["assumption", "forecast"].includes(claim.claimClass) &&
    claim.falsificationConditions.length === 0
  ) blockers.push("claim_without_falsification_conditions");
  if (claim.claimClass === "forecast" && !claim.horizon) blockers.push("forecast_without_horizon");

  for (const edge of incoming) {
    if (
      edge.relationType === "contradicts" &&
      (edge.strength === "material" || edge.strength === "binding")
    ) blockers.push(`unresolved_${edge.strength}_contradiction:${edge.edgeId}`);
  }

  return {
    claimId,
    eligible: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    supportEvidenceIds,
    contradictionEvidenceIds,
    supportingClaimIds,
    contradictingClaimIds,
    competingClaimIds,
  };
}

function readStrictJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseClaimGraphJsonl<T>(content, path);
}

function fsyncPath(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeJournal(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf-8");
  fsyncPath(path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Claim Graph lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendClaimGraphRecordsGoverned(
  paths: ClaimGraphStorePaths,
  incoming: ClaimGraphAppendBatch,
  ownerToken: string,
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): void {
  if (incoming.claims.length === 0 && incoming.edges.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(paths.claims), { recursive: true });
  mkdirSync(dirname(paths.edges), { recursive: true });

  const lockPath = `${paths.claims}.claim-graph.lock`;
  const journalPath = `${paths.claims}.batch-journal.json`;
  if (existsSync(journalPath)) {
    throw new Error(`incomplete_claim_graph_batch: ${journalPath}`);
  }
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Claim Graph lock is already held: ${lockPath}`);
    }
    throw error;
  }

  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existingClaims = readStrictJsonl<ClaimRecord>(paths.claims);
    const existingEdges = readStrictJsonl<ClaimGraphEdgeRecord>(paths.edges);
    const nextClaims = [...existingClaims, ...incoming.claims];
    const nextEdges = [...existingEdges, ...incoming.edges];
    const errors = validateClaimGraphGovernance(
      nextClaims,
      nextEdges,
      schemas,
      evidenceSnapshot,
      knownEntityIds,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }

    writeJournal(journalPath, {
      state: "prepared",
      ownerToken,
      claimCount: incoming.claims.length,
      edgeCount: incoming.edges.length,
      evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
    });

    if (incoming.claims.length > 0) {
      const fd = openSync(paths.claims, "a");
      try {
        appendFileSync(
          fd,
          `${incoming.claims.map((record) => JSON.stringify(record)).join("\n")}\n`,
          "utf-8",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    writeJournal(journalPath, {
      state: "claims_appended",
      ownerToken,
      claimCount: incoming.claims.length,
      edgeCount: incoming.edges.length,
      evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
    });

    if (incoming.edges.length > 0) {
      const fd = openSync(paths.edges, "a");
      try {
        appendFileSync(
          fd,
          `${incoming.edges.map((record) => JSON.stringify(record)).join("\n")}\n`,
          "utf-8",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    writeJournal(journalPath, {
      state: "committed",
      ownerToken,
      claimCount: incoming.claims.length,
      edgeCount: incoming.edges.length,
      evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
    });
    rmSync(journalPath, { force: false });
  } finally {
    releaseLock(lockPath, ownerToken);
  }
}
