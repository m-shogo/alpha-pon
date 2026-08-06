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

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validateDocumentIdentityContinuity(
  revisions: DocumentRevisionRecord[],
  diffs: DocumentDiffRecord[],
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = [];
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
