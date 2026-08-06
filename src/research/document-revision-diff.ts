import { createHash } from "node:crypto";
import type {
  EvidenceRecord,
  EvidenceSnapshot,
} from "./bitemporal-evidence-store.js";
import {
  recommendationEligibleEvidence,
} from "./bitemporal-evidence-store.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type DocumentType =
  | "statutory_filing"
  | "exchange_disclosure"
  | "earnings_release"
  | "investigation_report"
  | "press_release"
  | "meeting_material"
  | "court_document"
  | "regulatory_document"
  | "official_transcript"
  | "other";

export type DocumentRevisionKind =
  | "initial"
  | "amendment"
  | "correction"
  | "restatement"
  | "replacement"
  | "withdrawal"
  | "periodic_update";

export type DocumentRevisionStatus =
  | "active"
  | "superseded"
  | "withdrawn"
  | "rejected";

export type DocumentSectionHash = {
  sectionId: string;
  path: string;
  ordinal: number;
  titleHash: string;
  contentHash: string;
};

export type DocumentRevisionRecord = {
  schemaVersion: 1;
  recordId: string;
  documentRevisionId: string;
  documentId: string;
  entityIds: string[];
  evidenceId: string;
  documentType: DocumentType;
  revisionKind: DocumentRevisionKind;
  revisionSequence: number;
  status: DocumentRevisionStatus;
  sourceContentHash: string;
  normalizedStructureHash: string;
  publishedAt: string;
  observedAt: string;
  retrievedAt: string;
  effectiveFrom: string;
  effectiveTo?: string;
  language: string;
  storagePolicy:
    | "metadata_only"
    | "hash_only"
    | "local_only_content"
    | "redistributable_content";
  parserVersion: string;
  normalizationVersion: string;
  sections: DocumentSectionHash[];
  supersedesRecordId?: string;
  contentHash: string;
};

export type DocumentRevisionRecordInput = Omit<DocumentRevisionRecord, "contentHash">;

export type DocumentDiffKind = Exclude<DocumentRevisionKind, "initial">;
export type DocumentDiffStatus = "active" | "superseded" | "rejected";
export type DocumentDiffReviewStatus =
  | "auto_detected"
  | "reviewed"
  | "confirmed"
  | "rejected";

export type DocumentChange = {
  path: string;
  changeType: "added" | "removed" | "modified" | "reclassified" | "moved";
  semanticType:
    | "numeric"
    | "text"
    | "date"
    | "entity"
    | "reference"
    | "structure"
    | "accounting_policy"
    | "guidance"
    | "risk_factor"
    | "governance"
    | "other";
  materiality: "informational" | "material" | "binding";
  direction: "positive" | "negative" | "mixed" | "neutral" | "unknown";
  beforeHash?: string;
  afterHash?: string;
  sourceEvidenceIds: string[];
};

export type DocumentDiffRecord = {
  schemaVersion: 1;
  recordId: string;
  diffId: string;
  documentId: string;
  fromRevisionId: string;
  toRevisionId: string;
  diffKind: DocumentDiffKind;
  status: DocumentDiffStatus;
  observedAt: string;
  retrievedAt: string;
  effectiveFrom: string;
  effectiveTo?: string;
  reviewStatus: DocumentDiffReviewStatus;
  sourceEvidenceIds: string[];
  changes: DocumentChange[];
  supersedesRecordId?: string;
  parserVersion: string;
  ruleVersion: string;
  contentHash: string;
};

export type DocumentDiffRecordInput = Omit<DocumentDiffRecord, "contentHash">;

export type DocumentRevisionDiffIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type DocumentRevisionDiffSchemas = {
  revision: JsonSchema;
  diff: JsonSchema;
};

export type DocumentRevisionDiffSnapshot = {
  asOf: string;
  mode: "system_replay";
  revisions: DocumentRevisionRecord[];
  diffs: DocumentDiffRecord[];
  evidence: EvidenceRecord[];
  revisionIds: string[];
  diffIds: string[];
  evidenceIds: string[];
  contentHash: string;
};

export type ClaimEligibleDocumentChange = {
  diffId: string;
  documentId: string;
  fromRevisionId: string;
  toRevisionId: string;
  path: string;
  semanticType: DocumentChange["semanticType"];
  materiality: "material" | "binding";
  direction: DocumentChange["direction"];
  sourceEvidenceIds: string[];
};

export const DOCUMENT_REVISION_DIFF_PATHS = {
  revisions: "research/document_revisions/revisions.jsonl",
  diffs: "research/document_revisions/diffs.jsonl",
  revisionSchema: "research/schemas/document-revision-record.schema.json",
  diffSchema: "research/schemas/document-diff-record.schema.json",
} as const;

const PRIMARY_EVIDENCE_TIERS = new Set([
  "primary_authoritative",
  "primary_company",
]);

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutRevisionHash(
  record: DocumentRevisionRecord,
): DocumentRevisionRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutDiffHash(record: DocumentDiffRecord): DocumentDiffRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeDocumentRevisionHash(
  record: DocumentRevisionRecord | DocumentRevisionRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutRevisionHash(record) : record);
}

export function withDocumentRevisionHash(
  record: DocumentRevisionRecordInput,
): DocumentRevisionRecord {
  return { ...record, contentHash: computeDocumentRevisionHash(record) };
}

export function computeDocumentDiffHash(
  record: DocumentDiffRecord | DocumentDiffRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutDiffHash(record) : record);
}

export function withDocumentDiffHash(
  record: DocumentDiffRecordInput,
): DocumentDiffRecord {
  return { ...record, contentHash: computeDocumentDiffHash(record) };
}

function issue(
  code: string,
  target: string,
  message: string,
  severity: DocumentRevisionDiffIssue["severity"] = "error",
): DocumentRevisionDiffIssue {
  return { severity, code, target, message };
}

function sortIssues(
  issues: DocumentRevisionDiffIssue[],
): DocumentRevisionDiffIssue[] {
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
): DocumentRevisionDiffIssue[] {
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

function storageAllowed(
  revisionPolicy: DocumentRevisionRecord["storagePolicy"],
  evidencePolicy: EvidenceRecord["storagePolicy"],
): boolean {
  const allowed: Record<
    EvidenceRecord["storagePolicy"],
    ReadonlySet<DocumentRevisionRecord["storagePolicy"]>
  > = {
    metadata_only: new Set(["metadata_only", "hash_only"]),
    hash_only: new Set(["hash_only"]),
    local_only_content: new Set([
      "metadata_only",
      "hash_only",
      "local_only_content",
    ]),
    redistributable_content: new Set([
      "metadata_only",
      "hash_only",
      "local_only_content",
      "redistributable_content",
    ]),
  };
  return allowed[evidencePolicy].has(revisionPolicy);
}

function validateSectionHashes(
  record: DocumentRevisionRecord,
  target: string,
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
  const sectionIds = record.sections.map((section) => section.sectionId);
  const paths = record.sections.map((section) => section.path);
  const ordinals = record.sections.map((section) => section.ordinal);
  if (new Set(sectionIds).size !== sectionIds.length) {
    issues.push(issue("duplicate_document_section_id", target, "sectionIdが重複しています"));
  }
  if (new Set(paths).size !== paths.length) {
    issues.push(issue("duplicate_document_section_path", target, "section pathが重複しています"));
  }
  if (new Set(ordinals).size !== ordinals.length) {
    issues.push(issue("duplicate_document_section_ordinal", target, "section ordinalが重複しています"));
  }
  const sorted = [...ordinals].sort((a, b) => a - b);
  if (!sorted.every((value, index) => value === index)) {
    issues.push(issue(
      "non_contiguous_document_section_ordinals",
      target,
      "section ordinalは0から連続している必要があります",
    ));
  }
  return issues;
}

export function validateDocumentRevisionRecord(
  record: DocumentRevisionRecord,
  schema: JsonSchema,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  knownEntityIds?: ReadonlySet<string>,
  target = `document-revision:${record.documentRevisionId}:${record.recordId}`,
): DocumentRevisionDiffIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeDocumentRevisionHash(record)) {
    issues.push(issue("invalid_document_revision_hash", target, "contentHashが一致しません"));
  }
  if (timeMs(record.observedAt) < timeMs(record.publishedAt)) {
    issues.push(issue("revision_observed_before_published", target, `${record.observedAt} < ${record.publishedAt}`));
  }
  if (timeMs(record.retrievedAt) < timeMs(record.observedAt)) {
    issues.push(issue("revision_retrieved_before_observed", target, `${record.retrievedAt} < ${record.observedAt}`));
  }
  if (record.effectiveTo && timeMs(record.effectiveTo) < timeMs(record.effectiveFrom)) {
    issues.push(issue("invalid_revision_effective_period", target, `${record.effectiveTo} < ${record.effectiveFrom}`));
  }
  if (record.revisionKind === "initial" && record.revisionSequence !== 0) {
    issues.push(issue("initial_revision_sequence_not_zero", target, `${record.revisionSequence}`));
  }
  if (record.revisionKind !== "initial" && record.revisionSequence === 0) {
    issues.push(issue("non_initial_revision_sequence_zero", target, record.revisionKind));
  }
  if (record.revisionKind === "withdrawal" && record.status !== "withdrawn") {
    issues.push(issue("withdrawal_revision_not_withdrawn", target, `status=${record.status}`));
  }
  if (record.status === "withdrawn" && record.revisionKind !== "withdrawal") {
    issues.push(issue("withdrawn_status_without_withdrawal", target, record.revisionKind));
  }

  issues.push(...validateSectionHashes(record, target));

  const evidence = evidenceById.get(record.evidenceId);
  if (!evidence) {
    issues.push(issue("missing_revision_evidence", target, record.evidenceId));
  } else {
    if (record.sourceContentHash !== evidence.sourceContentHash) {
      issues.push(issue(
        "revision_source_hash_mismatch",
        target,
        `${record.sourceContentHash} != ${evidence.sourceContentHash}`,
      ));
    }
    if (record.publishedAt !== evidence.publishedAt) {
      issues.push(issue(
        "revision_published_at_mismatch",
        target,
        `${record.publishedAt} != ${evidence.publishedAt}`,
      ));
    }
    if (
      timeMs(record.observedAt) < timeMs(evidence.observedAt) ||
      timeMs(record.retrievedAt) < timeMs(evidence.retrievedAt)
    ) {
      issues.push(issue(
        "revision_before_evidence_availability",
        target,
        "Document revisionはsource Evidenceの観測・取得後に作成される必要があります",
      ));
    }
    if (!storageAllowed(record.storagePolicy, evidence.storagePolicy)) {
      issues.push(issue(
        "revision_storage_policy_exceeds_evidence",
        target,
        `${record.storagePolicy} exceeds ${evidence.storagePolicy}`,
      ));
    }
    if (!record.entityIds.some((entityId) => evidence.entityIds.includes(entityId))) {
      issues.push(issue(
        "revision_evidence_entity_mismatch",
        target,
        "Document revisionとEvidenceに共通entityIdがありません",
      ));
    }
  }

  if (knownEntityIds) {
    for (const entityId of record.entityIds) {
      if (!knownEntityIds.has(entityId)) {
        issues.push(issue("unknown_document_entity", target, entityId));
      }
    }
  }
  return sortIssues(issues);
}

function validateChangeShape(
  change: DocumentChange,
  target: string,
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
  if (change.changeType === "added") {
    if (change.beforeHash || !change.afterHash) {
      issues.push(issue("invalid_added_change_hashes", target, "addedはafterHashのみ必要です"));
    }
  } else if (change.changeType === "removed") {
    if (!change.beforeHash || change.afterHash) {
      issues.push(issue("invalid_removed_change_hashes", target, "removedはbeforeHashのみ必要です"));
    }
  } else if (["modified", "reclassified"].includes(change.changeType)) {
    if (!change.beforeHash || !change.afterHash || change.beforeHash === change.afterHash) {
      issues.push(issue(
        "invalid_modified_change_hashes",
        target,
        `${change.changeType}は異なるbeforeHash/afterHashが必要です`,
      ));
    }
  } else if (change.changeType === "moved") {
    if (!change.beforeHash || !change.afterHash) {
      issues.push(issue("invalid_moved_change_hashes", target, "movedはbeforeHash/afterHashが必要です"));
    }
  }
  return issues;
}

export function validateDocumentDiffRecord(
  record: DocumentDiffRecord,
  schema: JsonSchema,
  revisionById: ReadonlyMap<string, DocumentRevisionRecord>,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  recommendationEligibleEvidenceIds?: ReadonlySet<string>,
  target = `document-diff:${record.diffId}:${record.recordId}`,
): DocumentRevisionDiffIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeDocumentDiffHash(record)) {
    issues.push(issue("invalid_document_diff_hash", target, "contentHashが一致しません"));
  }
  if (record.fromRevisionId === record.toRevisionId) {
    issues.push(issue("self_document_diff", target, "from/to revisionが同一です"));
  }
  if (timeMs(record.retrievedAt) < timeMs(record.observedAt)) {
    issues.push(issue("diff_retrieved_before_observed", target, `${record.retrievedAt} < ${record.observedAt}`));
  }
  if (record.effectiveTo && timeMs(record.effectiveTo) < timeMs(record.effectiveFrom)) {
    issues.push(issue("invalid_diff_effective_period", target, `${record.effectiveTo} < ${record.effectiveFrom}`));
  }

  const from = revisionById.get(record.fromRevisionId);
  const to = revisionById.get(record.toRevisionId);
  if (!from) issues.push(issue("missing_from_document_revision", target, record.fromRevisionId));
  if (!to) issues.push(issue("missing_to_document_revision", target, record.toRevisionId));
  if (from && to) {
    if (from.documentId !== record.documentId || to.documentId !== record.documentId) {
      issues.push(issue("diff_document_identity_mismatch", target, record.documentId));
    }
    if (to.revisionSequence !== from.revisionSequence + 1) {
      issues.push(issue(
        "non_adjacent_document_diff",
        target,
        `${from.revisionSequence} -> ${to.revisionSequence}`,
      ));
    }
    if (record.diffKind !== to.revisionKind) {
      issues.push(issue(
        "diff_kind_revision_kind_mismatch",
        target,
        `${record.diffKind} != ${to.revisionKind}`,
      ));
    }
    if (
      timeMs(record.observedAt) < timeMs(to.observedAt) ||
      timeMs(record.retrievedAt) < timeMs(to.retrievedAt)
    ) {
      issues.push(issue(
        "diff_before_target_revision",
        target,
        "Diffはto revisionの観測・取得後に作成される必要があります",
      ));
    }
    if (!record.sourceEvidenceIds.includes(to.evidenceId)) {
      issues.push(issue(
        "diff_missing_target_revision_evidence",
        target,
        to.evidenceId,
      ));
    }
    if (record.diffKind === "withdrawal" && to.status !== "withdrawn") {
      issues.push(issue("withdrawal_diff_target_not_withdrawn", target, `status=${to.status}`));
    }
  }

  if (record.reviewStatus === "rejected" && record.status !== "rejected") {
    issues.push(issue("rejected_review_active_diff", target, `status=${record.status}`));
  }
  if (record.status === "rejected" && record.reviewStatus !== "rejected") {
    issues.push(issue("rejected_diff_without_rejected_review", target, record.reviewStatus));
  }

  const globalEvidence = new Set(record.sourceEvidenceIds);
  for (const evidenceId of record.sourceEvidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      issues.push(issue("missing_diff_source_evidence", target, evidenceId));
      continue;
    }
    if (
      timeMs(record.observedAt) < timeMs(evidence.observedAt) ||
      timeMs(record.retrievedAt) < timeMs(evidence.retrievedAt)
    ) {
      issues.push(issue(
        "diff_before_source_evidence",
        target,
        `${evidenceId} is not available yet`,
      ));
    }
  }

  for (const [index, change] of record.changes.entries()) {
    const changeTarget = `${target}.changes[${index}](${change.path})`;
    issues.push(...validateChangeShape(change, changeTarget));
    for (const evidenceId of change.sourceEvidenceIds) {
      if (!globalEvidence.has(evidenceId)) {
        issues.push(issue(
          "change_evidence_not_in_diff_evidence",
          changeTarget,
          evidenceId,
        ));
      }
    }
    if (change.materiality === "binding") {
      if (record.reviewStatus !== "confirmed") {
        issues.push(issue(
          "binding_change_not_confirmed",
          changeTarget,
          `reviewStatus=${record.reviewStatus}`,
        ));
      }
      for (const evidenceId of change.sourceEvidenceIds) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence && !PRIMARY_EVIDENCE_TIERS.has(evidence.evidenceTier)) {
          issues.push(issue(
            "binding_change_requires_primary_evidence",
            changeTarget,
            `${evidenceId} tier=${evidence.evidenceTier}`,
          ));
        }
        if (
          recommendationEligibleEvidenceIds &&
          !recommendationEligibleEvidenceIds.has(evidenceId)
        ) {
          issues.push(issue(
            "binding_change_uses_ineligible_evidence",
            changeTarget,
            evidenceId,
          ));
        }
      }
    }
    if (
      change.materiality !== "informational" &&
      record.reviewStatus === "auto_detected"
    ) {
      issues.push(issue(
        "unreviewed_material_change",
        changeTarget,
        "material/binding changeはreviewedまたはconfirmedが必要です",
      ));
    }
  }
  return sortIssues(issues);
}

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
): DocumentRevisionDiffIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

export function activeDocumentRevisionHeads(
  records: DocumentRevisionRecord[],
): DocumentRevisionRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

export function activeDocumentDiffHeads(
  records: DocumentDiffRecord[],
): DocumentDiffRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function revisionStatusTransitionAllowed(
  previous: DocumentRevisionStatus,
  current: DocumentRevisionStatus,
): boolean {
  const allowed: Record<DocumentRevisionStatus, ReadonlySet<DocumentRevisionStatus>> = {
    active: new Set(["active", "superseded", "withdrawn", "rejected"]),
    superseded: new Set(),
    withdrawn: new Set(),
    rejected: new Set(),
  };
  return allowed[previous].has(current);
}

function diffStatusTransitionAllowed(
  previous: DocumentDiffStatus,
  current: DocumentDiffStatus,
): boolean {
  const allowed: Record<DocumentDiffStatus, ReadonlySet<DocumentDiffStatus>> = {
    active: new Set(["active", "superseded", "rejected"]),
    superseded: new Set(),
    rejected: new Set(),
  };
  return allowed[previous].has(current);
}

function validateRevisionRowChains(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
  const revisionByRecordId = new Map(revisions.map((record) => [record.recordId, record]));
  const diffByRecordId = new Map(diffs.map((record) => [record.recordId, record]));

  for (const record of revisions) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue("document_revision_self_supersession", record.recordId, "自己revisionは禁止です"));
    }
    if (!record.supersedesRecordId) continue;
    const previous = revisionByRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue("missing_document_revision_parent", record.recordId, record.supersedesRecordId));
      continue;
    }
    if (
      record.documentRevisionId !== previous.documentRevisionId ||
      record.documentId !== previous.documentId ||
      record.evidenceId !== previous.evidenceId ||
      record.revisionSequence !== previous.revisionSequence
    ) {
      issues.push(issue(
        "document_revision_row_identity_mismatch",
        record.recordId,
        "documentRevisionId/documentId/evidenceId/revisionSequenceをrow revisionで変更できません",
      ));
    }
    if (!revisionStatusTransitionAllowed(previous.status, record.status)) {
      issues.push(issue(
        "invalid_document_revision_status_transition",
        record.recordId,
        `${previous.status} -> ${record.status}`,
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt)
    ) {
      issues.push(issue(
        "document_revision_row_time_regression",
        record.recordId,
        "observedAt/retrievedAtは増加する必要があります",
      ));
    }
  }

  for (const record of diffs) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue("document_diff_self_supersession", record.recordId, "自己revisionは禁止です"));
    }
    if (!record.supersedesRecordId) continue;
    const previous = diffByRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue("missing_document_diff_parent", record.recordId, record.supersedesRecordId));
      continue;
    }
    if (
      record.diffId !== previous.diffId ||
      record.documentId !== previous.documentId ||
      record.fromRevisionId !== previous.fromRevisionId ||
      record.toRevisionId !== previous.toRevisionId ||
      record.diffKind !== previous.diffKind
    ) {
      issues.push(issue(
        "document_diff_row_identity_mismatch",
        record.recordId,
        "diff identity/endpoints/kindをrow revisionで変更できません",
      ));
    }
    if (!diffStatusTransitionAllowed(previous.status, record.status)) {
      issues.push(issue(
        "invalid_document_diff_status_transition",
        record.recordId,
        `${previous.status} -> ${record.status}`,
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt)
    ) {
      issues.push(issue(
        "document_diff_row_time_regression",
        record.recordId,
        "observedAt/retrievedAtは増加する必要があります",
      ));
    }
  }

  const detectCycle = <T extends { recordId: string; supersedesRecordId?: string }>(
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
  detectCycle(revisions, "document_revision");
  detectCycle(diffs, "document_diff");
  return issues;
}

function validateDocumentSequence(
  revisions: DocumentRevisionRecord[],
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
  const byDocument = new Map<string, DocumentRevisionRecord[]>();
  for (const revision of activeDocumentRevisionHeads(revisions)) {
    const values = byDocument.get(revision.documentId) ?? [];
    values.push(revision);
    byDocument.set(revision.documentId, values);
  }

  for (const [documentId, values] of byDocument) {
    const sequenceCounts = new Map<number, number>();
    for (const value of values) {
      sequenceCounts.set(
        value.revisionSequence,
        (sequenceCounts.get(value.revisionSequence) ?? 0) + 1,
      );
    }
    for (const [sequence, count] of sequenceCounts) {
      if (count > 1) {
        issues.push(issue(
          "duplicate_document_revision_sequence",
          documentId,
          `sequence=${sequence} count=${count}`,
        ));
      }
    }
    const sequences = [...sequenceCounts.keys()].sort((a, b) => a - b);
    if (sequences.length > 0 && sequences[0] !== 0) {
      issues.push(issue("document_sequence_missing_initial", documentId, `first=${sequences[0]}`));
    }
    for (let index = 0; index < sequences.length; index += 1) {
      if (sequences[index] !== index) {
        issues.push(issue(
          "document_revision_sequence_gap",
          documentId,
          `expected=${index} actual=${sequences[index]}`,
        ));
        break;
      }
    }
    const ordered = [...values].sort((a, b) => a.revisionSequence - b.revisionSequence);
    for (let index = 1; index < ordered.length; index += 1) {
      if (timeMs(ordered[index].publishedAt) < timeMs(ordered[index - 1].publishedAt)) {
        issues.push(issue(
          "document_revision_publication_regression",
          documentId,
          `${ordered[index - 1].documentRevisionId} -> ${ordered[index].documentRevisionId}`,
        ));
      }
    }
    const currentCount = values.filter((value) => value.status === "active").length;
    const terminalLatest = ordered.at(-1)?.status === "withdrawn";
    if ((!terminalLatest && currentCount !== 1) || (terminalLatest && currentCount !== 0)) {
      issues.push(issue(
        "invalid_document_active_revision_count",
        documentId,
        `active=${currentCount} latest=${ordered.at(-1)?.status ?? "none"}`,
      ));
    }
  }
  return issues;
}

function oneHeadIssues(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
  const revisionCounts = new Map<string, number>();
  for (const record of activeDocumentRevisionHeads(revisions)) {
    revisionCounts.set(
      record.documentRevisionId,
      (revisionCounts.get(record.documentRevisionId) ?? 0) + 1,
    );
  }
  for (const [id, count] of revisionCounts) {
    if (count > 1) issues.push(issue("multiple_document_revision_heads", id, `${count} heads`));
  }

  const diffCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const record of activeDocumentDiffHeads(diffs)) {
    diffCounts.set(record.diffId, (diffCounts.get(record.diffId) ?? 0) + 1);
    if (record.status !== "rejected") {
      const pair = `${record.fromRevisionId}->${record.toRevisionId}`;
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
  }
  for (const [id, count] of diffCounts) {
    if (count > 1) issues.push(issue("multiple_document_diff_heads", id, `${count} heads`));
  }
  for (const [pair, count] of pairCounts) {
    if (count > 1) issues.push(issue("multiple_active_diffs_for_pair", pair, `${count} diffs`));
  }
  return issues;
}

export function validateDocumentRevisionDiffStore(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  schemas: DocumentRevisionDiffSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): DocumentRevisionDiffIssue[] {
  if (evidenceSnapshot.mode !== "system_replay") {
    return [issue(
      "document_diff_requires_system_replay",
      evidenceSnapshot.asOf,
      "Document Revision/Diffはsystem_replay Evidence Snapshotが必要です",
    )];
  }
  const evidenceById = new Map(
    evidenceSnapshot.evidence.map((record) => [record.evidenceId, record]),
  );
  const eligibleEvidenceIds = new Set(
    recommendationEligibleEvidence(evidenceSnapshot).map((record) => record.evidenceId),
  );
  const issues = revisions.flatMap((record) =>
    validateDocumentRevisionRecord(
      record,
      schemas.revision,
      evidenceById,
      knownEntityIds,
    ),
  );
  const revisionById = new Map(
    activeDocumentRevisionHeads(revisions).map((record) => [record.documentRevisionId, record]),
  );
  issues.push(...diffs.flatMap((record) =>
    validateDocumentDiffRecord(
      record,
      schemas.diff,
      revisionById,
      evidenceById,
      eligibleEvidenceIds,
    ),
  ));
  issues.push(
    ...duplicateIssues(revisions.map((record) => record.recordId), "duplicate_document_revision_record_id", "revisions"),
    ...duplicateIssues(revisions.map((record) => record.contentHash), "duplicate_content_hash", "revisions"),
    ...duplicateIssues(diffs.map((record) => record.recordId), "duplicate_document_diff_record_id", "diffs"),
    ...duplicateIssues(diffs.map((record) => record.contentHash), "duplicate_content_hash", "diffs"),
    ...validateRevisionRowChains(revisions, diffs),
    ...validateDocumentSequence(revisions),
    ...oneHeadIssues(revisions, diffs),
  );
  return sortIssues(issues);
}

function availableAtCutoff(
  record: { observedAt: string; retrievedAt: string; effectiveFrom: string; effectiveTo?: string },
  cutoffMs: number,
): boolean {
  if (timeMs(record.observedAt) > cutoffMs) return false;
  if (timeMs(record.retrievedAt) > cutoffMs) return false;
  if (timeMs(record.effectiveFrom) > cutoffMs) return false;
  if (record.effectiveTo && timeMs(record.effectiveTo) < cutoffMs) return false;
  return true;
}

function latestRevisionsAtCutoff(
  revisions: DocumentRevisionRecord[],
  cutoffMs: number,
): DocumentRevisionRecord[] {
  const selected = new Map<string, DocumentRevisionRecord>();
  for (const record of revisions) {
    if (!availableAtCutoff(record, cutoffMs)) continue;
    const previous = selected.get(record.documentRevisionId);
    if (
      !previous ||
      timeMs(record.observedAt) > timeMs(previous.observedAt) ||
      (
        timeMs(record.observedAt) === timeMs(previous.observedAt) &&
        timeMs(record.retrievedAt) > timeMs(previous.retrievedAt)
      )
    ) selected.set(record.documentRevisionId, record);
  }
  return [...selected.values()].sort((a, b) =>
    `${a.documentId}:${a.revisionSequence}`.localeCompare(
      `${b.documentId}:${b.revisionSequence}`,
    ),
  );
}

function latestDiffsAtCutoff(
  diffs: DocumentDiffRecord[],
  cutoffMs: number,
): DocumentDiffRecord[] {
  const selected = new Map<string, DocumentDiffRecord>();
  for (const record of diffs) {
    if (!availableAtCutoff(record, cutoffMs)) continue;
    const previous = selected.get(record.diffId);
    if (
      !previous ||
      timeMs(record.observedAt) > timeMs(previous.observedAt) ||
      (
        timeMs(record.observedAt) === timeMs(previous.observedAt) &&
        timeMs(record.retrievedAt) > timeMs(previous.retrievedAt)
      )
    ) selected.set(record.diffId, record);
  }
  return [...selected.values()].sort((a, b) => a.diffId.localeCompare(b.diffId));
}

export function buildDocumentRevisionDiffSnapshot(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  evidenceSnapshot: EvidenceSnapshot,
): DocumentRevisionDiffSnapshot {
  if (evidenceSnapshot.mode !== "system_replay") {
    throw new Error("Document Revision/Diff snapshot requires system_replay Evidence Snapshot");
  }
  const cutoffMs = timeMs(evidenceSnapshot.asOf);
  if (!Number.isFinite(cutoffMs)) throw new Error(`invalid asOf: ${evidenceSnapshot.asOf}`);
  const selectedRevisions = latestRevisionsAtCutoff(revisions, cutoffMs);
  const revisionIds = new Set(selectedRevisions.map((record) => record.documentRevisionId));
  const selectedDiffs = latestDiffsAtCutoff(diffs, cutoffMs).filter((record) =>
    revisionIds.has(record.fromRevisionId) && revisionIds.has(record.toRevisionId),
  );
  const evidenceIds = sortedUnique([
    ...selectedRevisions.map((record) => record.evidenceId),
    ...selectedDiffs.flatMap((record) => record.sourceEvidenceIds),
  ]);
  const evidenceById = new Map(
    evidenceSnapshot.evidence.map((record) => [record.evidenceId, record]),
  );
  const selectedEvidence = evidenceIds.flatMap((id) => {
    const record = evidenceById.get(id);
    return record ? [record] : [];
  });
  const input = {
    asOf: evidenceSnapshot.asOf,
    mode: "system_replay" as const,
    revisions: selectedRevisions,
    diffs: selectedDiffs,
    evidence: selectedEvidence,
    revisionIds: selectedRevisions.map((record) => record.documentRevisionId).sort(),
    diffIds: selectedDiffs.map((record) => record.diffId).sort(),
    evidenceIds,
  };
  return { ...input, contentHash: hashValue(input) };
}

export function claimEligibleDocumentChanges(
  snapshot: DocumentRevisionDiffSnapshot,
  evidenceSnapshot: EvidenceSnapshot,
): ClaimEligibleDocumentChange[] {
  if (
    snapshot.mode !== "system_replay" ||
    evidenceSnapshot.mode !== "system_replay" ||
    snapshot.asOf !== evidenceSnapshot.asOf
  ) {
    throw new Error("Document changes require matching system_replay snapshots");
  }
  const eligibleEvidenceIds = new Set(
    recommendationEligibleEvidence(evidenceSnapshot).map((record) => record.evidenceId),
  );
  const output: ClaimEligibleDocumentChange[] = [];
  for (const diff of snapshot.diffs) {
    if (diff.status !== "active" || diff.reviewStatus !== "confirmed") continue;
    for (const change of diff.changes) {
      if (change.materiality === "informational") continue;
      if (!change.sourceEvidenceIds.every((id) => eligibleEvidenceIds.has(id))) continue;
      output.push({
        diffId: diff.diffId,
        documentId: diff.documentId,
        fromRevisionId: diff.fromRevisionId,
        toRevisionId: diff.toRevisionId,
        path: change.path,
        semanticType: change.semanticType,
        materiality: change.materiality,
        direction: change.direction,
        sourceEvidenceIds: [...change.sourceEvidenceIds].sort(),
      });
    }
  }
  return output.sort((a, b) =>
    `${a.documentId}|${a.diffId}|${a.path}`.localeCompare(
      `${b.documentId}|${b.diffId}|${b.path}`,
    ),
  );
}

export function parseDocumentRevisionDiffJsonl<T>(
  content: string,
  sourceName: string,
): T[] {
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
