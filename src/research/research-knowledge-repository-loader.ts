import {
  readResearchKnowledgeAuthorityViews,
  type ResearchKnowledgeAuthorityRepositoryOptions,
} from "./research-knowledge-authority-repository.js";
import {
  emptyResearchKnowledgeOwnedSnapshot,
  loadResearchKnowledgeIntegritySnapshot,
  type ResearchKnowledgeOwnedSnapshot,
  type ResearchKnowledgeSnapshotLoadResult,
} from "./research-knowledge-snapshot-loader.js";

export interface ResearchKnowledgeRepositoryLoadOptions extends ResearchKnowledgeAuthorityRepositoryOptions {
  /**
   * Repository reads are PIT-strict by default. This escape hatch exists only
   * for isolated contract tests; production/repository callers should not turn it off.
   */
  requireExternalAvailability?: boolean;
}

export function loadResearchKnowledgeRepositorySnapshot(
  owned: ResearchKnowledgeOwnedSnapshot = emptyResearchKnowledgeOwnedSnapshot(),
  options: ResearchKnowledgeRepositoryLoadOptions = {},
): ResearchKnowledgeSnapshotLoadResult {
  const authorities = readResearchKnowledgeAuthorityViews(options);
  return loadResearchKnowledgeIntegritySnapshot(
    owned,
    authorities,
    { requireExternalAvailability: options.requireExternalAvailability ?? true },
  );
}
