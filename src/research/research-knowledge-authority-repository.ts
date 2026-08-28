import { existsSync, readFileSync } from "node:fs";
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
  buildResearchAssetAuthorityViews,
  readResearchAssetRegistry,
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
  const assetRegistry = readResearchAssetRegistry({
    rootPath: options.assetRegistryRootPath,
    repositoryRootPath: options.assetRegistryRepositoryRootPath,
    assetSchemaPath: options.assetRegistrySchemaPath,
    provenancePath: options.assetProvenancePath,
    provenanceSchemaPath: options.assetProvenanceSchemaPath,
  });
  const assets = buildResearchAssetAuthorityViews(assetRegistry);

  return {
    event: readMarketEventAuthorityView(options.marketEventDatabasePath),
    entity: readSecurityEntityAuthorityView(options.securityMasterEntitiesPath),
    edge: readEdgeAuthorityView({
      firstKnownAtByEdge: options.edgeFirstKnownAt,
      provenancePath: options.edgeProvenancePath,
      provenanceSchemaPath: options.edgeProvenanceSchemaPath,
    }),
    document: assets.document,
    watch: assets.watch,
    implementation: assets.implementation,
  };
}
