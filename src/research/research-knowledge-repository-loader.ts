import {
  readResearchKnowledgeAuthorityViews,
  type ResearchKnowledgeAuthorityRepositoryOptions,
} from "./research-knowledge-authority-repository.js";
import {
  readResearchKnowledgeCatalogRepository,
  type ResearchKnowledgeCatalogRepositoryOptions,
} from "./research-knowledge-catalog-repository.js";
import {
  loadResearchKnowledgeIntegritySnapshot,
  type ResearchKnowledgeOwnedSnapshot,
  type ResearchKnowledgeSnapshotLoadResult,
} from "./research-knowledge-snapshot-loader.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";

export interface ResearchKnowledgeRepositoryLoadOptions extends ResearchKnowledgeAuthorityRepositoryOptions {
  /**
   * Repository reads are PIT-strict by default. This escape hatch exists only
   * for isolated contract tests; production/repository callers should not turn it off.
   */
  requireExternalAvailability?: boolean;
  /** Canonical Research Knowledge Catalog root override for isolated repository tests. */
  catalogRootPath?: string;
  catalogMaxRecordBytes?: number;
}

function sortIssues(issues: readonly ResearchKnowledgeIssue[]): ResearchKnowledgeIssue[] {
  return [...issues].sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(
      `${right.code}|${right.target}|${right.message}`,
    ),
  );
}

export function loadResearchKnowledgeRepositorySnapshot(
  owned: ResearchKnowledgeOwnedSnapshot | undefined = undefined,
  options: ResearchKnowledgeRepositoryLoadOptions = {},
): ResearchKnowledgeSnapshotLoadResult {
  let catalogIssues: readonly ResearchKnowledgeIssue[] = [];
  let ownedSnapshot = owned;

  if (ownedSnapshot === undefined) {
    const catalogOptions: ResearchKnowledgeCatalogRepositoryOptions = {
      rootPath: options.catalogRootPath,
      maxRecordBytes: options.catalogMaxRecordBytes,
    };
    const catalog = readResearchKnowledgeCatalogRepository(catalogOptions);
    ownedSnapshot = catalog.snapshot;
    catalogIssues = catalog.issues;
  }

  const authorities = readResearchKnowledgeAuthorityViews(options);
  const result = loadResearchKnowledgeIntegritySnapshot(
    ownedSnapshot,
    authorities,
    { requireExternalAvailability: options.requireExternalAvailability ?? true },
  );
  return {
    ...result,
    issues: sortIssues([...catalogIssues, ...result.issues]),
  };
}
