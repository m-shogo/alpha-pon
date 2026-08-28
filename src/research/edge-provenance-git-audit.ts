import { compareExplicitIso8601Instants } from "./iso-instant.js";
import type { EdgeProvenanceRecord } from "./edge-provenance.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";

export interface EdgeProvenanceGitFacts {
  isCanonicalMainAncestor(commitSha: string): boolean;
  commitAt(commitSha: string): string | null;
  pathExistsAtCommit(commitSha: string, path: string): boolean;
  firstPathAdditionOnCanonicalMain(path: string): string | null;
}

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

export function auditEdgeProvenanceGitHistory(
  records: readonly EdgeProvenanceRecord[],
  facts: EdgeProvenanceGitFacts,
): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];

  for (const record of records) {
    const target = `edge_provenance:${record.edgeId}`;

    if (!facts.isCanonicalMainAncestor(record.sourceCommitSha)) {
      issues.push(issue(
        "research_edge_provenance_source_not_canonical_main",
        target,
        `${record.sourceCommitSha} is not an ancestor of canonical origin/main; branch-only commits cannot establish first-known provenance`,
      ));
      continue;
    }

    const commitAt = facts.commitAt(record.sourceCommitSha);
    if (!commitAt) {
      issues.push(issue(
        "research_edge_provenance_source_commit_missing",
        target,
        `source commit ${record.sourceCommitSha} cannot be read from local Git history`,
      ));
    } else {
      try {
        if (compareExplicitIso8601Instants(
          commitAt,
          record.sourceCommitAt,
          `${target}.gitCommitAt`,
          `${target}.sourceCommitAt`,
        ) !== 0) {
          issues.push(issue(
            "research_edge_provenance_source_commit_time_mismatch",
            target,
            `Git commit time ${commitAt} does not match ledger sourceCommitAt ${record.sourceCommitAt}`,
          ));
        }
      } catch (error) {
        issues.push(issue(
          "research_edge_provenance_source_commit_time_invalid",
          target,
          error instanceof Error ? error.message : String(error),
        ));
      }
    }

    if (!facts.pathExistsAtCommit(record.sourceCommitSha, record.sourcePath)) {
      issues.push(issue(
        "research_edge_provenance_source_path_missing",
        target,
        `${record.sourcePath} does not exist at source commit ${record.sourceCommitSha}`,
      ));
    }

    const firstAddition = facts.firstPathAdditionOnCanonicalMain(record.sourcePath);
    if (!firstAddition) {
      issues.push(issue(
        "research_edge_provenance_canonical_addition_missing",
        target,
        `${record.sourcePath} has no addition commit on canonical origin/main`,
      ));
    } else if (firstAddition !== record.sourceCommitSha) {
      issues.push(issue(
        "research_edge_provenance_not_first_canonical_presence",
        target,
        `ledger points to ${record.sourceCommitSha}, but canonical origin/main first added ${record.sourcePath} at ${firstAddition}`,
      ));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(
      `${right.code}|${right.target}|${right.message}`,
    ),
  );
}
