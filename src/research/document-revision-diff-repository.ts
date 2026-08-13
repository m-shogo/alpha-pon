import { existsSync, readFileSync } from "node:fs";
import {
  validateBitemporalEvidenceRepository,
} from "./bitemporal-evidence-repository.js";
import {
  DOCUMENT_REVISION_DIFF_PATHS,
  activeDocumentDiffHeads,
  activeDocumentRevisionHeads,
  parseDocumentRevisionDiffJsonl,
  type ClaimEligibleDocumentChange,
  type DocumentDiffRecord,
  type DocumentRevisionDiffIssue,
  type DocumentRevisionRecord,
} from "./document-revision-diff.js";
import {
  buildGovernedDocumentRevisionDiffSnapshot,
  claimEligibleDocumentChangesAtCutoff,
  validateDocumentRevisionDiffAtCutoff,
  visibleDocumentDiffsAtCutoff,
  visibleDocumentRevisionsAtCutoff,
  type GovernedDocumentRevisionDiffSnapshot,
} from "./document-revision-diff-governed.js";
import {
  DOCUMENT_REVISION_DIFF_SNAPSHOT_SCHEMA_PATH,
  validateGovernedDocumentRevisionDiffSnapshot,
} from "./document-revision-diff-snapshot.js";
import {
  SECURITY_MASTER_PATHS,
} from "./security-master.js";
import {
  validateSecurityMasterRepository,
} from "./security-master-repository.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type DocumentRevisionDiffRepositoryOptions = {
  revisionsPath?: string;
  diffsPath?: string;
  evidencePath?: string;
  evidenceRelationsPath?: string;
  securityEntitiesPath?: string;
  securityRelationshipsPath?: string;
  asOf?: string;
  includeDependencyIssues?: boolean;
};

export type DocumentRevisionDiffRepositoryResult = {
  issues: DocumentRevisionDiffIssue[];
  revisionRecordCount: number;
  diffRecordCount: number;
  activeRevisionHeadCount: number;
  activeDiffHeadCount: number;
  snapshotRevisionCount: number;
  snapshotDiffCount: number;
  claimEligibleChangeCount: number;
  claimEligibleChanges: ClaimEligibleDocumentChange[];
  snapshot: GovernedDocumentRevisionDiffSnapshot | null;
};

function issue(
  code: string,
  target: string,
  message: string,
): DocumentRevisionDiffIssue {
  return { severity: "error", code, target, message };
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

function readStrictJsonl<T>(path: string): {
  records: T[];
  issues: DocumentRevisionDiffIssue[];
} {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_document_revision_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return {
      records: parseDocumentRevisionDiffJsonl<T>(content, path),
      issues: [],
    };
  } catch (error) {
    return {
      records: [],
      issues: [issue("invalid_document_revision_jsonl", path, (error as Error).message)],
    };
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

export function validateDocumentRevisionDiffRepository(
  options: DocumentRevisionDiffRepositoryOptions = {},
): DocumentRevisionDiffRepositoryResult {
  const revisionsPath = options.revisionsPath ?? DOCUMENT_REVISION_DIFF_PATHS.revisions;
  const diffsPath = options.diffsPath ?? DOCUMENT_REVISION_DIFF_PATHS.diffs;
  const asOf = options.asOf ?? nowIso();
  const revisionsRead = readStrictJsonl<DocumentRevisionRecord>(revisionsPath);
  const diffsRead = readStrictJsonl<DocumentDiffRecord>(diffsPath);

  const security = validateSecurityMasterRepository({
    entitiesPath: options.securityEntitiesPath ?? SECURITY_MASTER_PATHS.entities,
    relationshipsPath: options.securityRelationshipsPath ?? SECURITY_MASTER_PATHS.relationships,
    asOf: jstDateOf(asOf),
  });
  const evidence = validateBitemporalEvidenceRepository({
    evidencePath: options.evidencePath,
    relationsPath: options.evidenceRelationsPath,
    securityEntitiesPath: options.securityEntitiesPath,
    securityRelationshipsPath: options.securityRelationshipsPath,
    asOf,
    includeSecurityMasterIssues: false,
  });

  const dependencyIssues: DocumentRevisionDiffIssue[] = [
    ...security.issues.map((item) => ({ ...item })),
    ...evidence.issues.map((item) => ({ ...item })),
  ];
  const issues: DocumentRevisionDiffIssue[] = [
    ...revisionsRead.issues,
    ...diffsRead.issues,
    ...(options.includeDependencyIssues === false ? [] : dependencyIssues),
  ];
  if (dependencyIssues.some((item) => item.severity === "error")) {
    issues.push(issue(
      "document_revision_dependency_invalid",
      asOf,
      "dependency repository validation failed; Document Revision snapshot remains unavailable",
    ));
  }
  const journalPath = `${revisionsPath}.batch-journal.json`;
  if (existsSync(journalPath)) {
    issues.push(issue(
      "incomplete_document_revision_batch",
      journalPath,
      "未完了Document Revision batchがあります。自動復旧・自動削除は禁止です",
    ));
  }

  const schemas = {
    revision: loadCouncilSchema(DOCUMENT_REVISION_DIFF_PATHS.revisionSchema),
    diff: loadCouncilSchema(DOCUMENT_REVISION_DIFF_PATHS.diffSchema),
  };
  const snapshotSchema = loadCouncilSchema(
    DOCUMENT_REVISION_DIFF_SNAPSHOT_SCHEMA_PATH,
  );
  const knownEntityIds = new Set(
    security.snapshot.entities.map((record) => record.entityId),
  );
  issues.push(...validateDocumentRevisionDiffAtCutoff(
    revisionsRead.records,
    diffsRead.records,
    schemas,
    evidence.snapshot,
    knownEntityIds,
  ));

  let snapshot: GovernedDocumentRevisionDiffSnapshot | null = null;
  let claimEligibleChanges: ClaimEligibleDocumentChange[] = [];
  if (!issues.some((item) => item.severity === "error")) {
    try {
      snapshot = buildGovernedDocumentRevisionDiffSnapshot(
        revisionsRead.records,
        diffsRead.records,
        schemas,
        evidence.snapshot,
        knownEntityIds,
      );
      const snapshotIssues = validateGovernedDocumentRevisionDiffSnapshot(
        snapshot,
        snapshotSchema,
      );
      issues.push(...snapshotIssues);
      if (snapshotIssues.some((item) => item.severity === "error")) {
        snapshot = null;
      } else {
        claimEligibleChanges = claimEligibleDocumentChangesAtCutoff(
          revisionsRead.records,
          diffsRead.records,
          schemas,
          evidence.snapshot,
          knownEntityIds,
        );
      }
    } catch (error) {
      issues.push(issue(
        "document_revision_snapshot_failed",
        revisionsPath,
        (error as Error).message,
      ));
      snapshot = null;
    }
  }

  const visibleRevisions = visibleDocumentRevisionsAtCutoff(
    revisionsRead.records,
    asOf,
  );
  const visibleDiffs = visibleDocumentDiffsAtCutoff(diffsRead.records, asOf);
  return {
    issues: sortIssues(issues),
    revisionRecordCount: revisionsRead.records.length,
    diffRecordCount: diffsRead.records.length,
    activeRevisionHeadCount: activeDocumentRevisionHeads(visibleRevisions).length,
    activeDiffHeadCount: activeDocumentDiffHeads(visibleDiffs).length,
    snapshotRevisionCount: snapshot?.revisionIds.length ?? 0,
    snapshotDiffCount: snapshot?.diffIds.length ?? 0,
    claimEligibleChangeCount: claimEligibleChanges.length,
    claimEligibleChanges,
    snapshot,
  };
}
