import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_MARKET_EVENT_DB_PATH,
  openMarketEventDatabase,
} from "../market-events/sqlite-store.js";
import {
  buildEdgeAuthorityView,
  buildSecurityEntityAuthorityView,
  type ResearchKnowledgeAuthorityView,
} from "./research-knowledge-authority-adapters.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";
import {
  SECURITY_MASTER_PATHS,
  parseSecurityMasterJsonl,
  validateSecurityEntityRecord,
  type SecurityMasterEntityRecord,
} from "./security-master.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";
import { loadEdges } from "./io.js";
import {
  readEdgeProvenanceRepository,
  type EdgeProvenanceRepositoryResult,
} from "./edge-provenance.js";
import {
  RESEARCH_ASSET_REGISTRY_ROOT,
  buildResearchAssetAuthorityViews,
  readResearchAssetRegistry,
  type ResearchAssetRegistryResult,
} from "./research-asset-registry.js";
import type { ResearchKnowledgeExternalNodeType } from "./research-knowledge-integrity.js";

export interface ResearchKnowledgeAuthorityRepositoryOptions {
  marketEventDatabasePath?: string;
  securityMasterEntitiesPath?: string;
  /** Explicit override is retained for isolated tests only. Repository mode uses canonical provenance by default. */
  edgeFirstKnownAt?: Readonly<Record<string, string>>;
  edgeProvenancePath?: string;
  edgeProvenanceSchemaPath?: string;
  assetRegistryRootPath?: string;
  assetRegistryRepositoryRootPath?: string;
  assetRegistrySchemaPath?: string;
  assetProvenancePath?: string;
  assetProvenanceSchemaPath?: string;
}

export interface ResearchKnowledgeAuthorityRepositoryViews {
  event: ResearchKnowledgeAuthorityView;
  entity: ResearchKnowledgeAuthorityView;
  edge: ResearchKnowledgeAuthorityView;
  document: ResearchKnowledgeAuthorityView;
  watch: ResearchKnowledgeAuthorityView;
  implementation: ResearchKnowledgeAuthorityView;
}

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function emptyView(
  nodeType: ResearchKnowledgeExternalNodeType,
  issues: readonly ResearchKnowledgeIssue[] = [],
): ResearchKnowledgeAuthorityView {
  return { nodeType, ids: [], availability: {}, issues };
}

function strictInstant(value: string, label: string): boolean {
  try {
    parseExplicitIso8601Instant(value, label);
    return true;
  } catch {
    return false;
  }
}

function mergeAuthorityIssues(
  view: ResearchKnowledgeAuthorityView,
  additional: readonly ResearchKnowledgeIssue[],
): ResearchKnowledgeAuthorityView {
  return {
    ...view,
    issues: [...additional, ...view.issues].sort((a, b) =>
      `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`),
    ),
  };
}

function symlinkedAncestorWithin(path: string, rootPath: string): string | undefined {
  const root = resolve(rootPath);
  let current = dirname(resolve(path));
  while (true) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return current;
    if (current === root) return undefined;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function researchAssetTargetAliasIssues(
  registry: ResearchAssetRegistryResult,
  repositoryRootPath: string,
): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  for (const record of registry.records) {
    const target = `research_asset:${record.id}`;
    const targetPath = join(repositoryRootPath, record.path);
    try {
      const symlinkAncestor = symlinkedAncestorWithin(targetPath, repositoryRootPath);
      if (symlinkAncestor) {
        issues.push(issue(
          "research_asset_registry_target_ancestor_symlink",
          target,
          `registered asset target must not be reached through symlinked ancestor ${symlinkAncestor}`,
        ));
        continue;
      }
      const stat = lstatSync(targetPath);
      if (stat.isFile() && stat.nlink > 1) {
        issues.push(issue(
          "research_asset_registry_target_hardlink_alias",
          target,
          `registered asset target must have one filesystem identity; hard-link count is ${stat.nlink} for ${record.path}`,
        ));
      }
    } catch (error) {
      issues.push(issue(
        "research_asset_registry_target_alias_check_failed",
        target,
        error instanceof Error ? error.message : String(error),
      ));
    }
  }
  return issues;
}

function researchAssetProvenanceSourcePathIssues(
  registry: ResearchAssetRegistryResult,
): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  for (const provenance of registry.provenanceRecords) {
    const expectedPath = `${RESEARCH_ASSET_REGISTRY_ROOT}/assets/${provenance.assetId}.yml`;
    if (provenance.sourcePath !== expectedPath) {
      issues.push(issue(
        "research_asset_provenance_source_path_mismatch",
        `research_asset_provenance:${provenance.assetId}`,
        `sourcePath must identify the stable Research Asset record ${expectedPath}; found ${provenance.sourcePath}`,
      ));
    }
  }
  return issues;
}

export function readMarketEventAuthorityView(
  databasePath: string = DEFAULT_MARKET_EVENT_DB_PATH,
): ResearchKnowledgeAuthorityView {
  if (!existsSync(databasePath)) return emptyView("event");

  let db: ReturnType<typeof openMarketEventDatabase> | null = null;
  try {
    db = openMarketEventDatabase({ path: databasePath, readonly: true });
    const rows = db.prepare(`
      SELECT event_id AS eventId, created_at AS createdAt
      FROM market_events
      ORDER BY event_id
    `).all() as Array<{ eventId: string; createdAt: string }>;
    const availability: Record<string, string> = {};
    const ids: string[] = [];
    const issues: ResearchKnowledgeIssue[] = [];

    for (const row of rows) {
      const target = `market_event_repository:${row.eventId}`;
      if (!row.eventId.trim()) {
        issues.push(issue("research_event_repository_empty_id", target, "market_events.event_id must not be empty"));
        continue;
      }
      if (row.eventId !== row.eventId.trim()) {
        issues.push(issue(
          "research_event_repository_noncanonical_id",
          target,
          "market_events.event_id must not contain surrounding whitespace",
        ));
        continue;
      }
      ids.push(row.eventId);
      if (!strictInstant(row.createdAt, `${target}.createdAt`)) {
        issues.push(issue(
          "research_event_repository_invalid_created_at",
          target,
          `Market Event created_at must be a strict first-known instant; found ${row.createdAt}`,
        ));
        continue;
      }
      availability[row.eventId] = row.createdAt;
    }

    return {
      nodeType: "event",
      ids: [...new Set(ids)].sort(),
      availability: Object.fromEntries(Object.entries(availability).sort(([a], [b]) => a.localeCompare(b))),
      issues: issues.sort((a, b) => `${a.code}|${a.target}`.localeCompare(`${b.code}|${b.target}`)),
    };
  } catch (error) {
    return emptyView("event", [issue(
      "research_event_repository_read_failed",
      databasePath,
      error instanceof Error ? error.message : String(error),
    )]);
  } finally {
    db?.close();
  }
}

export function readSecurityEntityAuthorityView(
  entitiesPath: string = SECURITY_MASTER_PATHS.entities,
): ResearchKnowledgeAuthorityView {
  if (!existsSync(entitiesPath)) return emptyView("entity");

  try {
    const stat = lstatSync(entitiesPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      return emptyView("entity", [issue(
        "research_entity_repository_non_standalone_file",
        entitiesPath,
        "Security Master entity authority must be a standalone regular file with one filesystem identity",
      )]);
    }
    const content = readFileSync(entitiesPath, "utf-8");
    if (content.length > 0 && !content.endsWith("\n")) {
      return emptyView("entity", [issue(
        "research_entity_repository_partial_tail",
        entitiesPath,
        "Security Master JSONL must end with a newline; partial write is possible",
      )]);
    }
    const records = parseSecurityMasterJsonl<SecurityMasterEntityRecord>(content, entitiesPath);
    const schema = loadCouncilSchema(SECURITY_MASTER_PATHS.entitySchema);
    const valid: SecurityMasterEntityRecord[] = [];
    const issues: ResearchKnowledgeIssue[] = [];

    for (const record of records) {
      const recordIssues = validateSecurityEntityRecord(record, schema);
      const errors = recordIssues.filter((entry) => entry.severity === "error");
      if (errors.length > 0) {
        for (const entry of errors) {
          issues.push(issue(
            `research_entity_repository_${entry.code}`,
            entry.target,
            entry.message,
          ));
        }
        continue;
      }
      valid.push(record);
    }

    const view = buildSecurityEntityAuthorityView(valid);
    return mergeAuthorityIssues(view, issues);
  } catch (error) {
    return emptyView("entity", [issue(
      "research_entity_repository_read_failed",
      entitiesPath,
      error instanceof Error ? error.message : String(error),
    )]);
  }
}

export function readEdgeAuthorityView(
  options: {
    firstKnownAtByEdge?: Readonly<Record<string, string>>;
    provenancePath?: string;
    provenanceSchemaPath?: string;
  } = {},
): ResearchKnowledgeAuthorityView {
  try {
    const edges = loadEdges();
    const edgeIds = edges.map((edge) => edge.id);

    if (options.firstKnownAtByEdge !== undefined) {
      return buildEdgeAuthorityView(edgeIds, options.firstKnownAtByEdge);
    }

    const provenance: EdgeProvenanceRepositoryResult = readEdgeProvenanceRepository(edgeIds, {
      path: options.provenancePath,
      schemaPath: options.provenanceSchemaPath,
    });
    return mergeAuthorityIssues(
      buildEdgeAuthorityView(edgeIds, provenance.firstKnownAtByEdge),
      provenance.issues,
    );
  } catch (error) {
    return emptyView("edge", [issue(
      "research_edge_repository_read_failed",
      "research/edge_registry/edges",
      error instanceof Error ? error.message : String(error),
    )]);
  }
}

export function readResearchKnowledgeAuthorityViews(
  options: ResearchKnowledgeAuthorityRepositoryOptions = {},
): ResearchKnowledgeAuthorityRepositoryViews {
  const assetRepositoryRootPath = options.assetRegistryRepositoryRootPath ?? ".";
  const assetRegistry = readResearchAssetRegistry({
    rootPath: options.assetRegistryRootPath,
    repositoryRootPath: assetRepositoryRootPath,
    assetSchemaPath: options.assetRegistrySchemaPath,
    provenancePath: options.assetProvenancePath,
    provenanceSchemaPath: options.assetProvenanceSchemaPath,
  });
  const assets = buildResearchAssetAuthorityViews(assetRegistry);
  const assetAliasIssues = researchAssetTargetAliasIssues(assetRegistry, assetRepositoryRootPath);
  const assetProvenanceSourcePathIssues = researchAssetProvenanceSourcePathIssues(assetRegistry);
  const additionalAssetIssues = [...assetAliasIssues, ...assetProvenanceSourcePathIssues];
  const sharedAssetIssues = [...assetRegistry.issues, ...additionalAssetIssues];

  return {
    event: readMarketEventAuthorityView(options.marketEventDatabasePath),
    entity: readSecurityEntityAuthorityView(options.securityMasterEntitiesPath),
    edge: readEdgeAuthorityView({
      firstKnownAtByEdge: options.edgeFirstKnownAt,
      provenancePath: options.edgeProvenancePath,
      provenanceSchemaPath: options.edgeProvenanceSchemaPath,
    }),
    document: mergeAuthorityIssues(assets.document, additionalAssetIssues),
    watch: mergeAuthorityIssues(assets.watch, sharedAssetIssues),
    implementation: mergeAuthorityIssues(assets.implementation, sharedAssetIssues),
  };
}
