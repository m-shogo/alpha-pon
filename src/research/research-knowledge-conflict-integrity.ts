import type {
  ResearchKnowledgeIssue,
  ResearchKnowledgeSnapshot,
} from "./research-knowledge-semantics.js";

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function validateRoleConflicts(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const rolesBySemanticEndpoint = new Map<string, Map<string, string[]>>();

  for (const relation of snapshot.relations) {
    if (relation.relationType !== "member_of" && relation.relationType !== "used_in") continue;
    if (!relation.role) continue;
    const key = [
      relation.relationType,
      relation.sourceType,
      relation.sourceId,
      relation.targetType,
      relation.targetId,
    ].join("|");
    const roles = rolesBySemanticEndpoint.get(key) ?? new Map<string, string[]>();
    roles.set(relation.role, [...(roles.get(relation.role) ?? []), relation.id]);
    rolesBySemanticEndpoint.set(key, roles);
  }

  for (const [key, roles] of rolesBySemanticEndpoint) {
    if (roles.size <= 1) continue;
    const details = [...roles.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([role, ids]) => `${role}=[${ids.join(",")}]`)
      .join("; ");
    issues.push(issue(
      "research_relation_conflicting_roles",
      `relation-endpoint:${key}`,
      `the same semantic endpoint pair cannot carry conflicting roles: ${details}`,
    ));
  }
  return issues;
}

function validateEventChainDuplicateEvents(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const relationsByCase = new Map<string, typeof snapshot.relations[number][]>();

  for (const relation of snapshot.relations) {
    if (relation.relationType !== "includes_event" || relation.sourceType !== "case") continue;
    relationsByCase.set(
      relation.sourceId,
      [...(relationsByCase.get(relation.sourceId) ?? []), relation],
    );
  }

  for (const [caseId, relations] of relationsByCase) {
    const byEvent = new Map<string, string[]>();
    for (const relation of relations) {
      byEvent.set(
        relation.targetId,
        [...(byEvent.get(relation.targetId) ?? []), relation.id],
      );
    }
    for (const [eventId, relationIds] of byEvent) {
      if (relationIds.length <= 1) continue;
      issues.push(issue(
        "research_event_chain_duplicate_event",
        `case:${caseId}`,
        `Event ${eventId} appears multiple times in one Case Event Chain via ${relationIds.join(", ")}`,
      ));
    }
  }
  return issues;
}

export function validateResearchKnowledgeConflictIntegrity(
  snapshot: ResearchKnowledgeSnapshot,
): ResearchKnowledgeIssue[] {
  return [
    ...validateRoleConflicts(snapshot),
    ...validateEventChainDuplicateEvents(snapshot),
  ].sort((a, b) => `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`));
}
