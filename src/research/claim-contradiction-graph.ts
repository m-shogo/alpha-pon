import { createHash } from "node:crypto";
import type {
  EvidenceRecord,
  EvidenceSnapshot,
} from "./bitemporal-evidence-store.js";
import {
  recommendationEligibleEvidence,
} from "./bitemporal-evidence-store.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type ClaimClass = "fact" | "assumption" | "forecast" | "opinion" | "unknown";
export type ClaimStatus =
  | "proposed"
  | "active"
  | "contradicted"
  | "invalidated"
  | "superseded"
  | "expired";

export type ClaimRecord = {
  schemaVersion: 1;
  recordId: string;
  claimId: string;
  entityIds: string[];
  claimClass: ClaimClass;
  statement: string;
  status: ClaimStatus;
  informationCutoff: string;
  effectiveFrom: string;
  effectiveTo?: string;
  observedAt: string;
  retrievedAt: string;
  horizon?: string;
  falsificationConditions: string[];
  unknownRefs: string[];
  modelVersion: string;
  ruleVersion: string;
  supersedesRecordId?: string;
  contentHash: string;
};

export type ClaimRecordInput = Omit<ClaimRecord, "contentHash">;

export type ClaimGraphNodeKind = "claim" | "evidence";
export type ClaimGraphRelationType =
  | "supports"
  | "contradicts"
  | "corrects"
  | "supersedes"
  | "confirms"
  | "invalidates"
  | "expires"
  | "competes_with"
  | "better_peer"
  | "external_factor";
export type ClaimGraphStrength = "informational" | "material" | "binding";

export type ClaimGraphEdgeRecord = {
  schemaVersion: 1;
  recordId: string;
  edgeId: string;
  fromKind: ClaimGraphNodeKind;
  fromId: string;
  toKind: ClaimGraphNodeKind;
  toId: string;
  relationType: ClaimGraphRelationType;
  strength: ClaimGraphStrength;
  effectiveFrom: string;
  effectiveTo?: string;
  observedAt: string;
  retrievedAt: string;
  sourceEvidenceIds: string[];
  supersedesRecordId?: string;
  contentHash: string;
};

export type ClaimGraphEdgeRecordInput = Omit<ClaimGraphEdgeRecord, "contentHash">;

export type ClaimGraphIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type ClaimGraphSchemas = {
  claim: JsonSchema;
  edge: JsonSchema;
};

export type ClaimDisposition = ClaimStatus;

export type ClaimGraphSnapshot = {
  asOf: string;
  mode: "system_replay";
  claims: ClaimRecord[];
  edges: ClaimGraphEdgeRecord[];
  evidence: EvidenceRecord[];
  claimDisposition: Record<string, ClaimDisposition>;
  contentHash: string;
};

export type ClaimRecommendationAssessment = {
  claimId: string;
  eligible: boolean;
  blockers: string[];
  supportEvidenceIds: string[];
  contradictionEvidenceIds: string[];
  supportingClaimIds: string[];
  contradictingClaimIds: string[];
  competingClaimIds: string[];
};

export const CLAIM_GRAPH_PATHS = {
  claims: "research/claim_graph/claims.jsonl",
  edges: "research/claim_graph/edges.jsonl",
  claimSchema: "research/schemas/claim-record.schema.json",
  edgeSchema: "research/schemas/claim-graph-edge-record.schema.json",
} as const;

const TERMINAL_STATUSES = new Set<ClaimStatus>([
  "invalidated",
  "superseded",
  "expired",
]);

const BINDING_RELATIONS = new Set<ClaimGraphRelationType>([
  "contradicts",
  "corrects",
  "supersedes",
  "invalidates",
  "expires",
]);

const CLAIM_TO_CLAIM_ONLY = new Set<ClaimGraphRelationType>([
  "corrects",
  "supersedes",
  "invalidates",
  "expires",
  "competes_with",
  "better_peer",
  "external_factor",
]);

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutClaimHash(record: ClaimRecord): ClaimRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutEdgeHash(record: ClaimGraphEdgeRecord): ClaimGraphEdgeRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeClaimRecordHash(
  record: ClaimRecord | ClaimRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutClaimHash(record) : record);
}

export function withClaimRecordHash(record: ClaimRecordInput): ClaimRecord {
  return { ...record, contentHash: computeClaimRecordHash(record) };
}

export function computeClaimGraphEdgeHash(
  record: ClaimGraphEdgeRecord | ClaimGraphEdgeRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutEdgeHash(record) : record);
}

export function withClaimGraphEdgeHash(
  record: ClaimGraphEdgeRecordInput,
): ClaimGraphEdgeRecord {
  return { ...record, contentHash: computeClaimGraphEdgeHash(record) };
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

function schemaIssues(
  value: unknown,
  schema: JsonSchema,
  target: string,
): ClaimGraphIssue[] {
  return validate(value, schema).map((error) => issue(
    "schema_violation",
    error.path ? `${target}:${error.path}` : target,
    error.message,
  ));
}

function timeMs(value: string): number {
  return Date.parse(value);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validateClaimRecord(
  record: ClaimRecord,
  schema: JsonSchema,
  knownEntityIds?: ReadonlySet<string>,
  target = `claim:${record.claimId}:${record.recordId}`,
): ClaimGraphIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeClaimRecordHash(record)) {
    issues.push(issue("invalid_claim_hash", target, "Claim contentHashが一致しません"));
  }
  if (timeMs(record.observedAt) < timeMs(record.informationCutoff)) {
    issues.push(issue(
      "claim_observed_before_information_cutoff",
      target,
      `${record.observedAt} < ${record.informationCutoff}`,
    ));
  }
  if (timeMs(record.retrievedAt) < timeMs(record.observedAt)) {
    issues.push(issue(
      "claim_retrieved_before_observed",
      target,
      `${record.retrievedAt} < ${record.observedAt}`,
    ));
  }
  if (record.effectiveTo && timeMs(record.effectiveTo) < timeMs(record.effectiveFrom)) {
    issues.push(issue(
      "invalid_claim_effective_period",
      target,
      `${record.effectiveTo} < ${record.effectiveFrom}`,
    ));
  }

  if (record.claimClass === "forecast") {
    if (!record.horizon) {
      issues.push(issue("forecast_without_horizon", target, "forecastにはhorizonが必要です"));
    }
    if (record.falsificationConditions.length === 0) {
      issues.push(issue(
        "forecast_without_falsification",
        target,
        "forecastにはfalsificationConditionsが必要です",
      ));
    }
  }
  if (
    record.claimClass === "assumption" &&
    record.falsificationConditions.length === 0
  ) {
    issues.push(issue(
      "assumption_without_falsification",
      target,
      "assumptionにはfalsificationConditionsが必要です",
    ));
  }
  if (record.claimClass === "unknown" && record.unknownRefs.length === 0) {
    issues.push(issue(
      "unknown_claim_without_unknown_ref",
      target,
      "unknown claimにはunknownRefsが必要です",
    ));
  }
  if (record.claimClass === "opinion" || record.claimClass === "unknown") {
    issues.push(issue(
      "non_evidentiary_claim_class",
      target,
      `${record.claimClass}はRecommendation根拠へ直接昇格できません`,
      "warning",
    ));
  }
  if (record.status !== "active") {
    issues.push(issue(
      "non_active_claim",
      target,
      `status=${record.status}はRecommendation根拠へ直接利用できません`,
      "warning",
    ));
  }

  if (knownEntityIds) {
    for (const entityId of record.entityIds) {
      if (!knownEntityIds.has(entityId)) {
        issues.push(issue(
          "unknown_claim_entity",
          target,
          `Security Masterに存在しないentityIdです: ${entityId}`,
        ));
      }
    }
  }
  return sortIssues(issues);
}

function edgeEndpointIssues(
  edge: ClaimGraphEdgeRecord,
  claimById: ReadonlyMap<string, ClaimRecord>,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  target: string,
): ClaimGraphIssue[] {
  const issues: ClaimGraphIssue[] = [];
  const exists = (kind: ClaimGraphNodeKind, id: string): boolean =>
    kind === "claim" ? claimById.has(id) : evidenceById.has(id);

  if (!exists(edge.fromKind, edge.fromId)) {
    issues.push(issue("missing_graph_from_node", target, `${edge.fromKind}:${edge.fromId}`));
  }
  if (!exists(edge.toKind, edge.toId)) {
    issues.push(issue("missing_graph_to_node", target, `${edge.toKind}:${edge.toId}`));
  }
  if (edge.fromKind === edge.toKind && edge.fromId === edge.toId) {
    issues.push(issue("self_claim_graph_edge", target, "自己edgeは許可されません"));
  }

  if (CLAIM_TO_CLAIM_ONLY.has(edge.relationType)) {
    if (edge.fromKind !== "claim" || edge.toKind !== "claim") {
      issues.push(issue(
        "invalid_claim_relation_endpoint",
        target,
        `${edge.relationType}はclaim -> claimのみ許可されます`,
      ));
    }
  } else if (edge.toKind !== "claim") {
    issues.push(issue(
      "evidence_store_relation_leak",
      target,
      `${edge.relationType}のtoKindはclaimが必要です。Evidence間relationはEvidence Storeで管理します`,
    ));
  }
  return issues;
}

export function validateClaimGraphEdgeRecord(
  edge: ClaimGraphEdgeRecord,
  schema: JsonSchema,
  claimById: ReadonlyMap<string, ClaimRecord>,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  recommendationEligibleEvidenceIds?: ReadonlySet<string>,
  target = `claim-edge:${edge.edgeId}:${edge.recordId}`,
): ClaimGraphIssue[] {
  const issues = schemaIssues(edge, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (edge.contentHash !== computeClaimGraphEdgeHash(edge)) {
    issues.push(issue("invalid_claim_edge_hash", target, "Claim edge contentHashが一致しません"));
  }
  if (timeMs(edge.retrievedAt) < timeMs(edge.observedAt)) {
    issues.push(issue(
      "claim_edge_retrieved_before_observed",
      target,
      `${edge.retrievedAt} < ${edge.observedAt}`,
    ));
  }
  if (edge.effectiveTo && timeMs(edge.effectiveTo) < timeMs(edge.effectiveFrom)) {
    issues.push(issue(
      "invalid_claim_edge_effective_period",
      target,
      `${edge.effectiveTo} < ${edge.effectiveFrom}`,
    ));
  }
  issues.push(...edgeEndpointIssues(edge, claimById, evidenceById, target));

  for (const evidenceId of edge.sourceEvidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      issues.push(issue("missing_edge_source_evidence", target, evidenceId));
      continue;
    }
    if (timeMs(edge.observedAt) < timeMs(evidence.observedAt)) {
      issues.push(issue(
        "edge_observed_before_source_evidence",
        target,
        `${edge.observedAt} < ${evidence.observedAt}`,
      ));
    }
    if (timeMs(edge.retrievedAt) < timeMs(evidence.retrievedAt)) {
      issues.push(issue(
        "edge_retrieved_before_source_evidence",
        target,
        `${edge.retrievedAt} < ${evidence.retrievedAt}`,
      ));
    }
  }

  if (edge.fromKind === "evidence" && !edge.sourceEvidenceIds.includes(edge.fromId)) {
    issues.push(issue(
      "evidence_edge_missing_self_source_ref",
      target,
      "fromKind=evidenceの場合、fromIdをsourceEvidenceIdsへ含める必要があります",
    ));
  }

  if (edge.strength === "binding") {
    if (!BINDING_RELATIONS.has(edge.relationType)) {
      issues.push(issue(
        "binding_strength_not_allowed",
        target,
        `${edge.relationType}をbindingとして扱えません`,
      ));
    }
    if (edge.sourceEvidenceIds.length === 0) {
      issues.push(issue(
        "binding_edge_without_evidence",
        target,
        "binding edgeにはsourceEvidenceIdsが必要です",
      ));
    }
    if (recommendationEligibleEvidenceIds) {
      for (const evidenceId of edge.sourceEvidenceIds) {
        if (!recommendationEligibleEvidenceIds.has(evidenceId)) {
          issues.push(issue(
            "binding_edge_uses_ineligible_evidence",
            target,
            evidenceId,
          ));
        }
      }
    }
  }

  if (
    edge.relationType === "competes_with" &&
    edge.strength === "binding"
  ) {
    issues.push(issue(
      "competition_cannot_be_binding",
      target,
      "competing hypothesisはbinding invalidationではありません",
    ));
  }
  return sortIssues(issues);
}

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
): ClaimGraphIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

export function activeClaimHeads(records: ClaimRecord[]): ClaimRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

export function activeClaimEdgeHeads(
  records: ClaimGraphEdgeRecord[],
): ClaimGraphEdgeRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function transitionAllowed(previous: ClaimStatus, current: ClaimStatus): boolean {
  const allowed: Record<ClaimStatus, ReadonlySet<ClaimStatus>> = {
    proposed: new Set([
      "proposed",
      "active",
      "contradicted",
      "invalidated",
      "superseded",
      "expired",
    ]),
    active: new Set([
      "active",
      "contradicted",
      "invalidated",
      "superseded",
      "expired",
    ]),
    contradicted: new Set([
      "contradicted",
      "invalidated",
      "superseded",
      "expired",
    ]),
    invalidated: new Set(),
    superseded: new Set(),
    expired: new Set(),
  };
  return allowed[previous].has(current);
}

function validateRevisionChains(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
): ClaimGraphIssue[] {
  const issues: ClaimGraphIssue[] = [];
  const claimByRecordId = new Map(claims.map((record) => [record.recordId, record]));
  const edgeByRecordId = new Map(edges.map((record) => [record.recordId, record]));

  for (const record of claims) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue("claim_self_supersession", record.recordId, "自己revisionは禁止です"));
    }
    if (!record.supersedesRecordId) continue;
    const previous = claimByRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue("missing_claim_revision_parent", record.recordId, record.supersedesRecordId));
      continue;
    }
    if (
      record.claimId !== previous.claimId ||
      record.claimClass !== previous.claimClass ||
      !sameStringSet(record.entityIds, previous.entityIds)
    ) {
      issues.push(issue(
        "claim_revision_identity_mismatch",
        record.recordId,
        "claimId/claimClass/entityIdsをrevisionで変更できません",
      ));
    }
    if (!transitionAllowed(previous.status, record.status)) {
      issues.push(issue(
        "invalid_claim_status_transition",
        record.recordId,
        `${previous.status} -> ${record.status}`,
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt) ||
      timeMs(record.informationCutoff) < timeMs(previous.informationCutoff)
    ) {
      issues.push(issue(
        "claim_revision_time_regression",
        record.recordId,
        "observedAt/retrievedAtは増加し、informationCutoffは後退禁止です",
      ));
    }
  }

  for (const record of edges) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue("claim_edge_self_supersession", record.recordId, "自己revisionは禁止です"));
    }
    if (!record.supersedesRecordId) continue;
    const previous = edgeByRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue("missing_claim_edge_revision_parent", record.recordId, record.supersedesRecordId));
      continue;
    }
    if (
      record.edgeId !== previous.edgeId ||
      record.fromKind !== previous.fromKind ||
      record.fromId !== previous.fromId ||
      record.toKind !== previous.toKind ||
      record.toId !== previous.toId ||
      record.relationType !== previous.relationType
    ) {
      issues.push(issue(
        "claim_edge_revision_identity_mismatch",
        record.recordId,
        "edge identity/endpoints/relationTypeをrevisionで変更できません",
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt)
    ) {
      issues.push(issue(
        "claim_edge_revision_time_regression",
        record.recordId,
        "observedAt/retrievedAtは直前revisionより後である必要があります",
      ));
    }
  }

  const detectRevisionCycle = <T extends { recordId: string; supersedesRecordId?: string }>(
    records: T[],
    prefix: string,
  ): void => {
    const byId = new Map(records.map((record) => [record.recordId, record]));
    for (const record of records) {
      const seen = new Set<string>();
      let current: T | undefined = record;
      while (current?.supersedesRecordId) {
        if (seen.has(current.recordId)) {
          issues.push(issue(`${prefix}_revision_cycle`, record.recordId, "revision cycleがあります"));
          break;
        }
        seen.add(current.recordId);
        current = byId.get(current.supersedesRecordId);
      }
    }
  };
  detectRevisionCycle(claims, "claim");
  detectRevisionCycle(edges, "claim_edge");
  return issues;
}

function oneHeadIssues(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
): ClaimGraphIssue[] {
  const issues: ClaimGraphIssue[] = [];
  const claimCounts = new Map<string, number>();
  for (const record of activeClaimHeads(claims)) {
    claimCounts.set(record.claimId, (claimCounts.get(record.claimId) ?? 0) + 1);
  }
  for (const [claimId, count] of claimCounts) {
    if (count > 1) issues.push(issue("multiple_claim_heads", claimId, `${count} active heads`));
  }

  const edgeCounts = new Map<string, number>();
  for (const record of activeClaimEdgeHeads(edges)) {
    edgeCounts.set(record.edgeId, (edgeCounts.get(record.edgeId) ?? 0) + 1);
  }
  for (const [edgeId, count] of edgeCounts) {
    if (count > 1) issues.push(issue("multiple_claim_edge_heads", edgeId, `${count} active heads`));
  }
  return issues;
}

function detectDirectedClaimCycles(
  edges: ClaimGraphEdgeRecord[],
  relationTypes: ReadonlySet<ClaimGraphRelationType>,
  code: string,
): ClaimGraphIssue[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (
      edge.fromKind !== "claim" ||
      edge.toKind !== "claim" ||
      !relationTypes.has(edge.relationType)
    ) continue;
    const values = adjacency.get(edge.fromId) ?? [];
    values.push(edge.toId);
    adjacency.set(edge.fromId, values);
  }

  const issues: ClaimGraphIssue[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      issues.push(issue(code, node, "Claim graphに循環依存があります"));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) visit(next);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of adjacency.keys()) visit(node);
  return issues;
}

export function validateClaimContradictionGraph(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): ClaimGraphIssue[] {
  if (evidenceSnapshot.mode !== "system_replay") {
    return [issue(
      "claim_graph_requires_system_replay",
      evidenceSnapshot.asOf,
      "Claim Graph検証はsystem_replay Evidence Snapshotが必要です",
    )];
  }

  const issues = claims.flatMap((record) =>
    validateClaimRecord(record, schemas.claim, knownEntityIds),
  );
  const claimById = new Map(
    activeClaimHeads(claims).map((record) => [record.claimId, record]),
  );
  const evidenceById = new Map(
    evidenceSnapshot.evidence.map((record) => [record.evidenceId, record]),
  );
  const eligibleEvidenceIds = new Set(
    recommendationEligibleEvidence(evidenceSnapshot).map((record) => record.evidenceId),
  );
  issues.push(...edges.flatMap((record) =>
    validateClaimGraphEdgeRecord(
      record,
      schemas.edge,
      claimById,
      evidenceById,
      eligibleEvidenceIds,
    ),
  ));
  issues.push(
    ...duplicateIssues(claims.map((record) => record.recordId), "duplicate_claim_record_id", "claims"),
    ...duplicateIssues(claims.map((record) => record.contentHash), "duplicate_content_hash", "claims"),
    ...duplicateIssues(edges.map((record) => record.recordId), "duplicate_claim_edge_record_id", "edges"),
    ...duplicateIssues(edges.map((record) => record.contentHash), "duplicate_content_hash", "edges"),
    ...validateRevisionChains(claims, edges),
    ...oneHeadIssues(claims, edges),
    ...detectDirectedClaimCycles(
      activeClaimEdgeHeads(edges),
      new Set(["supports", "confirms"]),
      "claim_support_cycle",
    ),
    ...detectDirectedClaimCycles(
      activeClaimEdgeHeads(edges),
      new Set(["corrects", "supersedes", "invalidates", "expires"]),
      "claim_disposition_cycle",
    ),
  );
  return sortIssues(issues);
}

function recordAvailable(
  record: { observedAt: string; retrievedAt: string; effectiveFrom: string; effectiveTo?: string },
  asOfMs: number,
): boolean {
  if (timeMs(record.observedAt) > asOfMs) return false;
  if (timeMs(record.retrievedAt) > asOfMs) return false;
  if (timeMs(record.effectiveFrom) > asOfMs) return false;
  if (record.effectiveTo && timeMs(record.effectiveTo) < asOfMs) return false;
  return true;
}

function latestClaimsAsOf(records: ClaimRecord[], asOfMs: number): ClaimRecord[] {
  const selected = new Map<string, ClaimRecord>();
  for (const record of records) {
    if (!recordAvailable(record, asOfMs)) continue;
    const prior = selected.get(record.claimId);
    if (
      !prior ||
      timeMs(record.observedAt) > timeMs(prior.observedAt) ||
      (
        timeMs(record.observedAt) === timeMs(prior.observedAt) &&
        timeMs(record.retrievedAt) > timeMs(prior.retrievedAt)
      )
    ) selected.set(record.claimId, record);
  }
  return [...selected.values()].sort((a, b) => a.claimId.localeCompare(b.claimId));
}

function latestEdgesAsOf(
  records: ClaimGraphEdgeRecord[],
  asOfMs: number,
): ClaimGraphEdgeRecord[] {
  const selected = new Map<string, ClaimGraphEdgeRecord>();
  for (const record of records) {
    if (!recordAvailable(record, asOfMs)) continue;
    const prior = selected.get(record.edgeId);
    if (
      !prior ||
      timeMs(record.observedAt) > timeMs(prior.observedAt) ||
      (
        timeMs(record.observedAt) === timeMs(prior.observedAt) &&
        timeMs(record.retrievedAt) > timeMs(prior.retrievedAt)
      )
    ) selected.set(record.edgeId, record);
  }
  return [...selected.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

export function buildClaimGraphSnapshot(
  claims: ClaimRecord[],
  edges: ClaimGraphEdgeRecord[],
  evidenceSnapshot: EvidenceSnapshot,
  asOf: string,
): ClaimGraphSnapshot {
  if (evidenceSnapshot.mode !== "system_replay") {
    throw new Error("Claim Graph snapshot requires system_replay Evidence Snapshot");
  }
  if (evidenceSnapshot.asOf !== asOf) {
    throw new Error(`Claim/Evidence snapshot cutoff mismatch: ${asOf} != ${evidenceSnapshot.asOf}`);
  }
  const asOfMs = timeMs(asOf);
  if (!Number.isFinite(asOfMs)) throw new Error(`invalid asOf: ${asOf}`);
  const selectedClaims = latestClaimsAsOf(claims, asOfMs);
  const claimIds = new Set(selectedClaims.map((record) => record.claimId));
  const evidenceIds = new Set(evidenceSnapshot.evidence.map((record) => record.evidenceId));
  const selectedEdges = latestEdgesAsOf(edges, asOfMs).filter((edge) => {
    const fromExists = edge.fromKind === "claim"
      ? claimIds.has(edge.fromId)
      : evidenceIds.has(edge.fromId);
    const toExists = edge.toKind === "claim"
      ? claimIds.has(edge.toId)
      : evidenceIds.has(edge.toId);
    return fromExists && toExists;
  });

  const disposition = new Map<string, ClaimDisposition>(
    selectedClaims.map((record) => [record.claimId, record.status]),
  );
  for (const edge of selectedEdges.filter((record) => record.strength === "binding")) {
    if (edge.toKind !== "claim") continue;
    if (edge.relationType === "contradicts") disposition.set(edge.toId, "contradicted");
    else if (edge.relationType === "invalidates") disposition.set(edge.toId, "invalidated");
    else if (edge.relationType === "corrects" || edge.relationType === "supersedes") {
      disposition.set(edge.toId, "superseded");
    } else if (edge.relationType === "expires") disposition.set(edge.toId, "expired");
  }

  const input = {
    asOf,
    mode: "system_replay" as const,
    claims: selectedClaims,
    edges: selectedEdges,
    evidence: evidenceSnapshot.evidence,
    claimDisposition: Object.fromEntries([...disposition.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  return { ...input, contentHash: hashValue(input) };
}

export function assessClaimForRecommendation(
  snapshot: ClaimGraphSnapshot,
  claimId: string,
): ClaimRecommendationAssessment {
  const claim = snapshot.claims.find((record) => record.claimId === claimId);
  if (!claim) throw new Error(`claim not found in snapshot: ${claimId}`);
  const eligibleEvidenceIds = new Set(
    recommendationEligibleEvidence({
      asOf: snapshot.asOf,
      mode: "system_replay",
      boundary: "knowledge",
      evidence: snapshot.evidence,
      relations: [],
    }).map((record) => record.evidenceId),
  );

  const incoming = snapshot.edges.filter((edge) =>
    edge.toKind === "claim" && edge.toId === claimId,
  );
  const supportEvidenceIds = sortedUnique(incoming.flatMap((edge) => {
    if (!["supports", "confirms"].includes(edge.relationType)) return [];
    const direct = edge.fromKind === "evidence" ? [edge.fromId] : [];
    return [...direct, ...edge.sourceEvidenceIds]
      .filter((id) => eligibleEvidenceIds.has(id));
  }));
  const contradictionEvidenceIds = sortedUnique(incoming.flatMap((edge) =>
    edge.relationType === "contradicts" ? edge.sourceEvidenceIds : [],
  ));
  const supportingClaimIds = sortedUnique(incoming.flatMap((edge) =>
    edge.fromKind === "claim" && ["supports", "confirms"].includes(edge.relationType)
      ? [edge.fromId]
      : [],
  ));
  const contradictingClaimIds = sortedUnique(incoming.flatMap((edge) =>
    edge.fromKind === "claim" && edge.relationType === "contradicts"
      ? [edge.fromId]
      : [],
  ));
  const competingClaimIds = sortedUnique(snapshot.edges.flatMap((edge) => {
    if (edge.relationType !== "competes_with") return [];
    if (edge.fromKind === "claim" && edge.fromId === claimId && edge.toKind === "claim") {
      return [edge.toId];
    }
    if (edge.toKind === "claim" && edge.toId === claimId && edge.fromKind === "claim") {
      return [edge.fromId];
    }
    return [];
  }));

  const blockers: string[] = [];
  const disposition = snapshot.claimDisposition[claimId];
  if (disposition !== "active") blockers.push(`claim_disposition:${disposition}`);
  if (claim.claimClass === "opinion" || claim.claimClass === "unknown") {
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
    blockers: sortedUnique(blockers),
    supportEvidenceIds,
    contradictionEvidenceIds,
    supportingClaimIds,
    contradictingClaimIds,
    competingClaimIds,
  };
}

export function parseClaimGraphJsonl<T>(content: string, sourceName: string): T[] {
  const records: T[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}: ${(error as Error).message}`);
    }
  }
  return records;
}
