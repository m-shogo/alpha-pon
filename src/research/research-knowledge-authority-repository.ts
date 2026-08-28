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

export interface ResearchKnowledgeAuthorityRepositoryOptions {
  marketEventDatabasePath?: string;
  securityMasterEntitiesPath?: string;
  edgeFirstKnownAt?: Readonly<Record<string, string>>;
}

export interface ResearchKnowledgeAuthorityRepositoryViews {
  event: ResearchKnowledgeAuthorityView;
  entity: ResearchKnowledgeAuthorityView;
  edge: ResearchKnowledgeAuthorityView;
}

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function emptyView(nodeType: "event" | "entity" | "edge", issues: readonly ResearchKnowledgeIssue[] = []): ResearchKnowledgeAuthorityView {
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
    return {
      ...view,
      issues: [...issues, ...view.issues].sort((a, b) =>
        `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`),
      ),
    };
  } catch (error) {
    return emptyView("entity", [issue(
      "research_entity_repository_read_failed",
      entitiesPath,
      error instanceof Error ? error.message : String(error),
    )]);
  }
}

export function readEdgeAuthorityView(
  firstKnownAtByEdge: Readonly<Record<string, string>> = {},
): ResearchKnowledgeAuthorityView {
  try {
    const edges = loadEdges();
    return buildEdgeAuthorityView(edges.map((edge) => edge.id), firstKnownAtByEdge);
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
  return {
    event: readMarketEventAuthorityView(options.marketEventDatabasePath),
    entity: readSecurityEntityAuthorityView(options.securityMasterEntitiesPath),
    edge: readEdgeAuthorityView(options.edgeFirstKnownAt),
  };
}
