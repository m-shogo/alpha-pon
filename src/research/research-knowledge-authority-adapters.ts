import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";
import type { SecurityMasterEntityRecord } from "./security-master.js";
import type { MarketEventLedgerRecord } from "../market-events/local-ledger.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import type { ResearchKnowledgeExternalNodeType } from "./research-knowledge-integrity.js";

export interface ResearchKnowledgeAuthorityView {
  nodeType: ResearchKnowledgeExternalNodeType;
  ids: readonly string[];
  availability: Readonly<Record<string, string>>;
  issues: readonly ResearchKnowledgeIssue[];
}

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function isStrictInstant(value: string, label: string): boolean {
  try {
    parseExplicitIso8601Instant(value, label);
    return true;
  } catch {
    return false;
  }
}

function earlierInstant(current: string | undefined, candidate: string, label: string): string {
  if (!current) return candidate;
  return compareExplicitIso8601Instants(candidate, current, `${label}.candidate`, `${label}.current`) < 0
    ? candidate
    : current;
}

function sortedAvailability(values: Map<string, string>): Readonly<Record<string, string>> {
  return Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sortIssues(issues: readonly ResearchKnowledgeIssue[]): ResearchKnowledgeIssue[] {
  return [...issues].sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function buildMarketEventAuthorityView(
  records: readonly MarketEventLedgerRecord[],
): ResearchKnowledgeAuthorityView {
  const ids = new Set<string>();
  const availability = new Map<string, string>();
  const issues: ResearchKnowledgeIssue[] = [];

  for (const [index, record] of records.entries()) {
    if (record.recordType !== "MARKET_EVENT") continue;
    const eventId = record.payload.eventId;
    const target = `market_event_authority:${index}:${eventId}`;
    if (!eventId.trim()) {
      issues.push(issue("research_event_authority_empty_id", target, "MARKET_EVENT record must expose a stable eventId"));
      continue;
    }
    if (eventId !== eventId.trim()) {
      issues.push(issue(
        "research_event_authority_noncanonical_id",
        target,
        "MARKET_EVENT eventId must not contain surrounding whitespace",
      ));
      continue;
    }
    ids.add(eventId);
    if (!isStrictInstant(record.recordedAt, `${target}.recordedAt`)) {
      issues.push(issue(
        "research_event_authority_invalid_recorded_at",
        target,
        `recordedAt must be a strict first-known candidate; found ${record.recordedAt}`,
      ));
      continue;
    }
    availability.set(
      eventId,
      earlierInstant(availability.get(eventId), record.recordedAt, `${target}.recordedAt`),
    );
  }

  return {
    nodeType: "event",
    ids: [...ids].sort(),
    availability: sortedAvailability(availability),
    issues: sortIssues(issues),
  };
}

export function buildSecurityEntityAuthorityView(
  records: readonly SecurityMasterEntityRecord[],
): ResearchKnowledgeAuthorityView {
  const ids = new Set<string>();
  const availability = new Map<string, string>();
  const issues: ResearchKnowledgeIssue[] = [];

  for (const [index, record] of records.entries()) {
    const entityId = record.entityId;
    const target = `security_entity_authority:${index}:${entityId}`;
    if (!entityId.trim()) {
      issues.push(issue("research_entity_authority_empty_id", target, "Security Master record must expose a stable entityId"));
      continue;
    }
    ids.add(entityId);

    if (!isStrictInstant(record.observedAt, `${target}.observedAt`)) {
      issues.push(issue(
        "research_entity_authority_invalid_observed_at",
        target,
        `observedAt must be a strict ISO-8601 instant; found ${record.observedAt}`,
      ));
      continue;
    }
    if (!isStrictInstant(record.retrievedAt, `${target}.retrievedAt`)) {
      issues.push(issue(
        "research_entity_authority_invalid_retrieved_at",
        target,
        `retrievedAt must be a strict ISO-8601 instant; found ${record.retrievedAt}`,
      ));
      continue;
    }
    if (compareExplicitIso8601Instants(
      record.retrievedAt,
      record.observedAt,
      `${target}.retrievedAt`,
      `${target}.observedAt`,
    ) < 0) {
      issues.push(issue(
        "research_entity_authority_retrieved_before_observed",
        target,
        `retrievedAt ${record.retrievedAt} predates observedAt ${record.observedAt}`,
      ));
      continue;
    }

    availability.set(
      entityId,
      earlierInstant(availability.get(entityId), record.retrievedAt, `${target}.retrievedAt`),
    );
  }

  return {
    nodeType: "entity",
    ids: [...ids].sort(),
    availability: sortedAvailability(availability),
    issues: sortIssues(issues),
  };
}

export function buildEdgeAuthorityView(
  edgeIds: readonly string[],
  firstKnownAtByEdge: Readonly<Record<string, string>> = {},
): ResearchKnowledgeAuthorityView {
  const issues: ResearchKnowledgeIssue[] = [];
  const canonicalIds: string[] = [];
  for (const [index, edgeId] of edgeIds.entries()) {
    const target = `edge_authority:${index}:${edgeId}`;
    if (!edgeId || edgeId !== edgeId.trim()) {
      issues.push(issue(
        "research_edge_authority_invalid_id",
        target,
        "Edge authority IDs must be canonical non-empty strings without surrounding whitespace",
      ));
      continue;
    }
    canonicalIds.push(edgeId);
  }

  const ids = [...new Set(canonicalIds)].sort();
  const declared = new Set(ids);
  const availability = new Map<string, string>();

  for (const [edgeId, firstKnownAt] of Object.entries(firstKnownAtByEdge).sort(([left], [right]) => left.localeCompare(right))) {
    const target = `edge_authority:${edgeId}`;
    if (!declared.has(edgeId)) {
      issues.push(issue(
        "research_edge_authority_availability_without_id",
        target,
        `first-known timestamp supplied for undeclared Edge ${edgeId}`,
      ));
      continue;
    }
    if (!isStrictInstant(firstKnownAt, `${target}.firstKnownAt`)) {
      issues.push(issue(
        "research_edge_authority_invalid_first_known_at",
        target,
        `Edge firstKnownAt must be a strict ISO-8601 instant; never synthesize midnight from date-only createdAt`,
      ));
      continue;
    }
    availability.set(edgeId, firstKnownAt);
  }

  return {
    nodeType: "edge",
    ids,
    availability: sortedAvailability(availability),
    issues: sortIssues(issues),
  };
}

export function buildOpaqueAuthorityView(
  nodeType: Extract<ResearchKnowledgeExternalNodeType, "document" | "watch" | "implementation">,
  ids: readonly string[],
  firstKnownAtById: Readonly<Record<string, string>> = {},
): ResearchKnowledgeAuthorityView {
  const canonicalIds = [...new Set(ids)].sort();
  const declared = new Set(canonicalIds);
  const availability = new Map<string, string>();
  const issues: ResearchKnowledgeIssue[] = [];

  for (const [id, firstKnownAt] of Object.entries(firstKnownAtById).sort(([left], [right]) => left.localeCompare(right))) {
    const target = `${nodeType}_authority:${id}`;
    if (!declared.has(id)) {
      issues.push(issue(
        "research_opaque_authority_availability_without_id",
        target,
        `first-known timestamp supplied for undeclared ${nodeType} ${id}`,
      ));
      continue;
    }
    if (!isStrictInstant(firstKnownAt, `${target}.firstKnownAt`)) {
      issues.push(issue(
        "research_opaque_authority_invalid_first_known_at",
        target,
        `${nodeType} firstKnownAt must be a strict ISO-8601 instant`,
      ));
      continue;
    }
    availability.set(id, firstKnownAt);
  }

  return {
    nodeType,
    ids: canonicalIds,
    availability: sortedAvailability(availability),
    issues: sortIssues(issues),
  };
}
