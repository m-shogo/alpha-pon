import { createHash } from "node:crypto";
import type {
  DocumentRevisionDiffIssue,
} from "./document-revision-diff.js";
import type {
  GovernedDocumentRevisionDiffSnapshot,
} from "./document-revision-diff-governed.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export const DOCUMENT_REVISION_DIFF_SNAPSHOT_SCHEMA_PATH =
  "research/schemas/document-revision-diff-snapshot.schema.json";

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutHash(
  snapshot: GovernedDocumentRevisionDiffSnapshot,
): Omit<GovernedDocumentRevisionDiffSnapshot, "contentHash"> {
  const { contentHash: _contentHash, ...input } = snapshot;
  return input;
}

export function computeGovernedDocumentRevisionDiffSnapshotHash(
  snapshot:
    | GovernedDocumentRevisionDiffSnapshot
    | Omit<GovernedDocumentRevisionDiffSnapshot, "contentHash">,
): string {
  return hashValue("contentHash" in snapshot ? withoutHash(snapshot) : snapshot);
}

function canonical(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalArrayIssues(
  values: string[],
  field: string,
): DocumentRevisionDiffIssue[] {
  const expected = canonical(values);
  const ok =
    values.length === expected.length &&
    expected.every((value, index) => value === values[index]);
  return ok ? [] : [{
    severity: "error",
    code: "non_canonical_document_snapshot_array",
    target: field,
    message: `${field} must be sorted and unique`,
  }];
}

export function validateGovernedDocumentRevisionDiffSnapshot(
  snapshot: GovernedDocumentRevisionDiffSnapshot,
  schema: JsonSchema,
): DocumentRevisionDiffIssue[] {
  const issues: DocumentRevisionDiffIssue[] = validate(snapshot, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path
      ? `DocumentRevisionDiffSnapshot:${error.path}`
      : "DocumentRevisionDiffSnapshot",
    message: error.message,
  }));
  if (issues.length > 0) return issues;

  if (
    snapshot.contentHash !==
    computeGovernedDocumentRevisionDiffSnapshotHash(snapshot)
  ) {
    issues.push({
      severity: "error",
      code: "invalid_document_snapshot_hash",
      target: "DocumentRevisionDiffSnapshot.contentHash",
      message: "governed Document Revision/Diff snapshot hash mismatch",
    });
  }
  issues.push(
    ...canonicalArrayIssues(snapshot.revisionIds, "revisionIds"),
    ...canonicalArrayIssues(snapshot.diffIds, "diffIds"),
    ...canonicalArrayIssues(snapshot.evidenceIds, "evidenceIds"),
  );
  return issues.sort((a, b) =>
    `${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.code}|${b.target}|${b.message}`,
    ),
  );
}
