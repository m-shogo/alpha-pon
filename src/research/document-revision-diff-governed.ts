import { createHash } from "node:crypto";
import type { EvidenceSnapshot } from "./bitemporal-evidence-store.js";
import {
  recommendationEligibleEvidence,
} from "./bitemporal-evidence-store.js";
import {
  computeEvidenceSnapshotHash,
} from "./claim-contradiction-graph-hardening.js";
import {
  activeDocumentRevisionHeads,
  buildDocumentRevisionDiffSnapshot,
  claimEligibleDocumentChanges,
  validateDocumentDiffRecord,
  validateDocumentRevisionDiffStore,
  validateDocumentRevisionRecord,
  type ClaimEligibleDocumentChange,
  type DocumentDiffRecord,
  type DocumentRevisionDiffIssue,
  type DocumentRevisionDiffSchemas,
  type DocumentRevisionDiffSnapshot,
  type DocumentRevisionRecord,
} from "./document-revision-diff.js";
import {
  validateDocumentIdentityContinuity,
} from "./document-revision-diff-integrity.js";
import { stableStringify } from "./schema.js";

export type GovernedDocumentRevisionDiffSnapshot = {
  asOf: string;
  mode: "system_replay";
  documentSnapshotHash: string;
  evidenceSnapshotHash: string;
  revisionIds: string[];
  diffIds: string[];
  evidenceIds: string[];
  contentHash: string;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

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

function sortIssues(
  issues: DocumentRevisionDiffIssue[],
): DocumentRevisionDiffIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

export function visibleDocumentRevisionsAtCutoff(
  revisions: DocumentRevisionRecord[],
  asOf: string,
): DocumentRevisionRecord[] {
  const cutoffMs = timeMs(asOf);
  if (!Number.isFinite(cutoffMs)) throw new Error(`invalid document cutoff: ${asOf}`);
  return revisions.filter((record) => availableAtCutoff(record, cutoffMs));
}

export function visibleDocumentDiffsAtCutoff(
  diffs: DocumentDiffRecord[],
  asOf: string,
): DocumentDiffRecord[] {
  const cutoffMs = timeMs(asOf);
  if (!Number.isFinite(cutoffMs)) throw new Error(`invalid document cutoff: ${asOf}`);
  return diffs.filter((record) => availableAtCutoff(record, cutoffMs));
}

export function usableDocumentRevisionsAtCutoff(
  revisions: DocumentRevisionRecord[],
  asOf: string,
): DocumentRevisionRecord[] {
  return visibleDocumentRevisionsAtCutoff(revisions, asOf)
    .filter((record) => record.status !== "rejected");
}

export function usableDocumentDiffsAtCutoff(
  diffs: DocumentDiffRecord[],
  asOf: string,
): DocumentDiffRecord[] {
  return visibleDocumentDiffsAtCutoff(diffs, asOf)
    .filter((record) => record.status !== "rejected");
}

export function validateDocumentRevisionDiffAtCutoff(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  schemas: DocumentRevisionDiffSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): DocumentRevisionDiffIssue[] {
  if (evidenceSnapshot.mode !== "system_replay") {
    return [{
      severity: "error",
      code: "document_diff_requires_system_replay",
      target: evidenceSnapshot.asOf,
      message: "Document Revision/Diffはsystem_replay Evidence Snapshotが必要です",
    }];
  }

  const visibleRevisions = visibleDocumentRevisionsAtCutoff(
    revisions,
    evidenceSnapshot.asOf,
  );
  const visibleDiffs = visibleDocumentDiffsAtCutoff(
    diffs,
    evidenceSnapshot.asOf,
  );
  const usableRevisions = visibleRevisions.filter(
    (record) => record.status !== "rejected",
  );
  const usableDiffs = visibleDiffs.filter(
    (record) => record.status !== "rejected",
  );
  const evidenceById = new Map(
    evidenceSnapshot.evidence.map((record) => [record.evidenceId, record]),
  );
  const eligibleEvidenceIds = new Set(
    recommendationEligibleEvidence(evidenceSnapshot).map((record) => record.evidenceId),
  );
  const revisionById = new Map(
    activeDocumentRevisionHeads(visibleRevisions).map((record) => [
      record.documentRevisionId,
      record,
    ]),
  );

  const rejectedRevisionIssues = visibleRevisions
    .filter((record) => record.status === "rejected")
    .flatMap((record) => validateDocumentRevisionRecord(
      record,
      schemas.revision,
      evidenceById,
      knownEntityIds,
    ));
  const rejectedDiffIssues = visibleDiffs
    .filter((record) => record.status === "rejected")
    .flatMap((record) => validateDocumentDiffRecord(
      record,
      schemas.diff,
      revisionById,
      evidenceById,
      eligibleEvidenceIds,
    ));

  return sortIssues([
    ...validateDocumentRevisionDiffStore(
      usableRevisions,
      usableDiffs,
      schemas,
      evidenceSnapshot,
      knownEntityIds,
    ),
    ...rejectedRevisionIssues,
    ...rejectedDiffIssues,
    ...validateDocumentIdentityContinuity(visibleRevisions, visibleDiffs),
  ]);
}

export function validateIncomingDocumentRevisionDiffCutoff(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  evidenceSnapshot: EvidenceSnapshot,
): DocumentRevisionDiffIssue[] {
  const cutoffMs = timeMs(evidenceSnapshot.asOf);
  const issues: DocumentRevisionDiffIssue[] = [];
  for (const record of revisions) {
    if (
      timeMs(record.observedAt) > cutoffMs ||
      timeMs(record.retrievedAt) > cutoffMs ||
      timeMs(record.effectiveFrom) > cutoffMs
    ) {
      issues.push({
        severity: "error",
        code: "incoming_document_revision_after_snapshot_cutoff",
        target: record.recordId,
        message: `${record.documentRevisionId} is not available at ${evidenceSnapshot.asOf}`,
      });
    }
  }
  for (const record of diffs) {
    if (
      timeMs(record.observedAt) > cutoffMs ||
      timeMs(record.retrievedAt) > cutoffMs ||
      timeMs(record.effectiveFrom) > cutoffMs
    ) {
      issues.push({
        severity: "error",
        code: "incoming_document_diff_after_snapshot_cutoff",
        target: record.recordId,
        message: `${record.diffId} is not available at ${evidenceSnapshot.asOf}`,
      });
    }
  }
  return sortIssues(issues);
}

export function buildDocumentRevisionDiffSnapshotAtCutoff(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  schemas: DocumentRevisionDiffSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): DocumentRevisionDiffSnapshot {
  const errors = validateDocumentRevisionDiffAtCutoff(
    revisions,
    diffs,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"),
    );
  }
  return buildDocumentRevisionDiffSnapshot(
    usableDocumentRevisionsAtCutoff(revisions, evidenceSnapshot.asOf),
    usableDocumentDiffsAtCutoff(diffs, evidenceSnapshot.asOf),
    evidenceSnapshot,
  );
}

export function buildGovernedDocumentRevisionDiffSnapshot(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  schemas: DocumentRevisionDiffSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): GovernedDocumentRevisionDiffSnapshot {
  const documentSnapshot = buildDocumentRevisionDiffSnapshotAtCutoff(
    revisions,
    diffs,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  const input = {
    asOf: evidenceSnapshot.asOf,
    mode: "system_replay" as const,
    documentSnapshotHash: documentSnapshot.contentHash,
    evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
    revisionIds: [...documentSnapshot.revisionIds].sort(),
    diffIds: [...documentSnapshot.diffIds].sort(),
    evidenceIds: [...documentSnapshot.evidenceIds].sort(),
  };
  return { ...input, contentHash: hashValue(input) };
}

export function claimEligibleDocumentChangesAtCutoff(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
  schemas: DocumentRevisionDiffSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): ClaimEligibleDocumentChange[] {
  const snapshot = buildDocumentRevisionDiffSnapshotAtCutoff(
    revisions,
    diffs,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  return claimEligibleDocumentChanges(snapshot, evidenceSnapshot);
}
