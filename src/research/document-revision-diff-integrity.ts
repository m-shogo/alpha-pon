import {
  activeDocumentRevisionHeads,
  type DocumentDiffRecord,
  type DocumentRevisionDiffIssue,
  type DocumentRevisionRecord,
} from "./document-revision-diff.js";

function issue(
  code: string,
  target: string,
  message: string,
): DocumentRevisionDiffIssue {
  return { severity: "error", code, target, message };
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

function rejectedDuplicateIssues<T>(
  records: T[],
  valueOf: (record: T) => string,
  rejected: (record: T) => boolean,
  code: string,
  target: string,
): DocumentRevisionDiffIssue[] {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const value = valueOf(record);
    const values = grouped.get(value) ?? [];
    values.push(record);
    grouped.set(value, values);
  }
  return [...grouped.entries()]
    .filter(([, values]) =>
      values.length > 1 && values.some((record) => rejected(record)),
    )
    .map(([value]) => issue(code, target, value));
}

function rejectedRevisionHistoryIssues(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
  const revisionByRecordId = new Map(
    revisions.map((record) => [record.recordId, record]),
  );
  const diffByRecordId = new Map(
    diffs.map((record) => [record.recordId, record]),
  );

  for (const record of revisions.filter((item) => item.status === "rejected")) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue(
        "rejected_document_revision_self_supersession",
        record.recordId,
        "rejected row cannot supersede itself",
      ));
    }
    if (!record.supersedesRecordId) continue;
    const previous = revisionByRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue(
        "missing_rejected_document_revision_parent",
        record.recordId,
        record.supersedesRecordId,
      ));
      continue;
    }
    if (
      record.documentRevisionId !== previous.documentRevisionId ||
      record.documentId !== previous.documentId ||
      record.evidenceId !== previous.evidenceId ||
      record.revisionSequence !== previous.revisionSequence
    ) {
      issues.push(issue(
        "rejected_document_revision_identity_mismatch",
        record.recordId,
        "rejected row cannot change document revision identity",
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt)
    ) {
      issues.push(issue(
        "rejected_document_revision_time_regression",
        record.recordId,
        "rejected row timestamps must be later than its parent",
      ));
    }
  }

  for (const record of diffs.filter((item) => item.status === "rejected")) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue(
        "rejected_document_diff_self_supersession",
        record.recordId,
        "rejected diff row cannot supersede itself",
      ));
    }
    if (!record.supersedesRecordId) continue;
    const previous = diffByRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue(
        "missing_rejected_document_diff_parent",
        record.recordId,
        record.supersedesRecordId,
      ));
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
        "rejected_document_diff_identity_mismatch",
        record.recordId,
        "rejected diff row cannot change diff identity",
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt)
    ) {
      issues.push(issue(
        "rejected_document_diff_time_regression",
        record.recordId,
        "rejected diff timestamps must be later than its parent",
      ));
    }
  }

  const detectRejectedCycle = <T extends {
    recordId: string;
    supersedesRecordId?: string;
  }>(
    records: T[],
    isRejected: (record: T) => boolean,
    code: string,
  ): void => {
    const byId = new Map(records.map((record) => [record.recordId, record]));
    for (const record of records) {
      const seen = new Set<string>();
      const path: T[] = [];
      let current: T | undefined = record;
      while (current?.supersedesRecordId) {
        if (seen.has(current.recordId)) {
          if (path.some((item) => isRejected(item))) {
            issues.push(issue(code, record.recordId, "revision cycle includes a rejected row"));
          }
          break;
        }
        seen.add(current.recordId);
        path.push(current);
        current = byId.get(current.supersedesRecordId);
      }
    }
  };
  detectRejectedCycle(
    revisions,
    (record) => (record as DocumentRevisionRecord).status === "rejected",
    "rejected_document_revision_cycle",
  );
  detectRejectedCycle(
    diffs,
    (record) => (record as DocumentDiffRecord).status === "rejected",
    "rejected_document_diff_cycle",
  );

  issues.push(
    ...rejectedDuplicateIssues(
      revisions,
      (record) => record.recordId,
      (record) => record.status === "rejected",
      "duplicate_rejected_document_revision_record_id",
      "revisions",
    ),
    ...rejectedDuplicateIssues(
      revisions,
      (record) => record.contentHash,
      (record) => record.status === "rejected",
      "duplicate_rejected_document_revision_hash",
      "revisions",
    ),
    ...rejectedDuplicateIssues(
      diffs,
      (record) => record.recordId,
      (record) => record.status === "rejected",
      "duplicate_rejected_document_diff_record_id",
      "diffs",
    ),
    ...rejectedDuplicateIssues(
      diffs,
      (record) => record.contentHash,
      (record) => record.status === "rejected",
      "duplicate_rejected_document_diff_hash",
      "diffs",
    ),
  );
  return issues;
}

export function validateDocumentIdentityContinuity(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [
    ...rejectedRevisionHistoryIssues(revisions, diffs),
  ];
  const usableHeads = activeDocumentRevisionHeads(revisions)
    .filter((record) => record.status !== "rejected");
  const byDocument = new Map<string, DocumentRevisionRecord[]>();
  for (const record of usableHeads) {
    const values = byDocument.get(record.documentId) ?? [];
    values.push(record);
    byDocument.set(record.documentId, values);
  }

  for (const [documentId, values] of byDocument) {
    const ordered = [...values].sort(
      (a, b) => a.revisionSequence - b.revisionSequence,
    );
    const baseline = ordered[0];
    for (const record of ordered.slice(1)) {
      if (record.documentType !== baseline.documentType) {
        issues.push(issue(
          "document_type_changed_across_revisions",
          documentId,
          `${baseline.documentType} -> ${record.documentType}`,
        ));
      }
      if (record.language !== baseline.language) {
        issues.push(issue(
          "document_language_changed_across_revisions",
          documentId,
          `${baseline.language} -> ${record.language}`,
        ));
      }
      if (!sameStringSet(record.entityIds, baseline.entityIds)) {
        issues.push(issue(
          "document_entities_changed_across_revisions",
          documentId,
          `${baseline.entityIds.join(",")} -> ${record.entityIds.join(",")}`,
        ));
      }
    }
  }

  const revisionById = new Map(
    activeDocumentRevisionHeads(revisions).map((record) => [
      record.documentRevisionId,
      record,
    ]),
  );
  for (const diff of diffs) {
    const from = revisionById.get(diff.fromRevisionId);
    const to = revisionById.get(diff.toRevisionId);
    if (from?.status === "rejected" || to?.status === "rejected") {
      issues.push(issue(
        "document_diff_uses_rejected_revision",
        diff.diffId,
        `${diff.fromRevisionId} -> ${diff.toRevisionId}`,
      ));
    }
  }

  return issues.sort((a, b) =>
    `${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.code}|${b.target}|${b.message}`,
    ),
  );
}
