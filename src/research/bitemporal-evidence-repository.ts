import { existsSync, readFileSync } from "node:fs";
import {
  EVIDENCE_STORE_PATHS,
  bindingDispositionByEvidenceId,
  buildEvidenceSnapshot,
  parseEvidenceJsonl,
  recommendationEligibleEvidence,
  type EvidenceRecord,
  type EvidenceRelationRecord,
  type EvidenceSnapshot,
  type EvidenceStoreIssue,
} from "./bitemporal-evidence-store.js";
import {
  validateBitemporalEvidenceStoreGoverned,
} from "./bitemporal-evidence-hardening.js";
import {
  SECURITY_MASTER_PATHS,
} from "./security-master.js";
import {
  validateSecurityMasterRepository,
} from "./security-master-repository.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type BitemporalEvidenceRepositoryOptions = {
  evidencePath?: string;
  relationsPath?: string;
  securityEntitiesPath?: string;
  securityRelationshipsPath?: string;
  asOf?: string;
  includeSecurityMasterIssues?: boolean;
};

export type BitemporalEvidenceRepositoryResult = {
  issues: EvidenceStoreIssue[];
  evidenceRecordCount: number;
  relationRecordCount: number;
  snapshotEvidenceCount: number;
  snapshotRelationCount: number;
  recommendationEligibleCount: number;
  correctedOrRetractedCount: number;
  discoveryOnlyCount: number;
  snapshot: EvidenceSnapshot;
};

function issue(code: string, target: string, message: string): EvidenceStoreIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: EvidenceStoreIssue[]): EvidenceStoreIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readStrictJsonl<T>(path: string): { records: T[]; issues: EvidenceStoreIssue[] } {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue("partial_jsonl_tail", path, "final newlineがなくpartial writeの可能性があります")],
    };
  }
  try {
    return { records: parseEvidenceJsonl<T>(content, path), issues: [] };
  } catch (error) {
    return { records: [], issues: [issue("invalid_jsonl", path, (error as Error).message)] };
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

export function validateBitemporalEvidenceRepository(
  options: BitemporalEvidenceRepositoryOptions = {},
): BitemporalEvidenceRepositoryResult {
  const evidencePath = options.evidencePath ?? EVIDENCE_STORE_PATHS.evidence;
  const relationsPath = options.relationsPath ?? EVIDENCE_STORE_PATHS.relations;
  const asOf = options.asOf ?? nowIso();
  const security = validateSecurityMasterRepository({
    entitiesPath: options.securityEntitiesPath ?? SECURITY_MASTER_PATHS.entities,
    relationshipsPath: options.securityRelationshipsPath ?? SECURITY_MASTER_PATHS.relationships,
    asOf: jstDateOf(asOf),
  });
  const evidenceRead = readStrictJsonl<EvidenceRecord>(evidencePath);
  const relationRead = readStrictJsonl<EvidenceRelationRecord>(relationsPath);
  const issues: EvidenceStoreIssue[] = [
    ...evidenceRead.issues,
    ...relationRead.issues,
    ...(options.includeSecurityMasterIssues === false
      ? []
      : security.issues.map((item) => ({ ...item }))),
  ];
  const journalPath = `${evidencePath}.batch-journal.json`;
  if (existsSync(journalPath)) {
    issues.push(issue(
      "incomplete_evidence_batch",
      journalPath,
      "未完了Evidence batchがあります。自動復旧・自動削除せず明示確認が必要です",
    ));
  }
  const schemas = {
    evidence: loadCouncilSchema(EVIDENCE_STORE_PATHS.evidenceSchema),
    relation: loadCouncilSchema(EVIDENCE_STORE_PATHS.relationSchema),
  };
  const knownEntityIds = new Set(security.snapshot.entities.map((entity) => entity.entityId));
  issues.push(...validateBitemporalEvidenceStoreGoverned(
    evidenceRead.records,
    relationRead.records,
    schemas,
    knownEntityIds,
  ));
  const snapshot = buildEvidenceSnapshot(
    evidenceRead.records,
    relationRead.records,
    asOf,
    "system_replay",
    "knowledge",
  );
  const disposition = bindingDispositionByEvidenceId(snapshot);
  return {
    issues: sortIssues(issues),
    evidenceRecordCount: evidenceRead.records.length,
    relationRecordCount: relationRead.records.length,
    snapshotEvidenceCount: snapshot.evidence.length,
    snapshotRelationCount: snapshot.relations.length,
    recommendationEligibleCount: recommendationEligibleEvidence(snapshot).length,
    correctedOrRetractedCount: [...disposition.values()].filter((status) =>
      ["corrected", "retracted", "withdrawn", "expired"].includes(status),
    ).length,
    discoveryOnlyCount: snapshot.evidence.filter(
      (record) => record.evidenceTier === "discovery_only",
    ).length,
    snapshot,
  };
}
