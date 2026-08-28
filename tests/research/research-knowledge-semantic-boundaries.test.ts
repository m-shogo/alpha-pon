import assert from "node:assert/strict";
import { validateResearchKnowledgeIntegrity } from "../../src/research/research-knowledge-integrity.js";
import type { ResearchKnowledgeSnapshot } from "../../src/research/research-knowledge-semantics.js";

const ontologyVersion = "research-knowledge-v1" as const;
const at = "2026-08-28T11:00:00+09:00";
const later = "2026-08-28T11:10:00+09:00";

function empty(): ResearchKnowledgeSnapshot {
  return {
    researchItems: [],
    researchQuestions: [],
    observations: [],
    mechanisms: [],
    researchFamilies: [],
    researchComponents: [],
    cases: [],
    studies: [],
    sampleManifests: [],
    studyResults: [],
    opportunities: [],
    relations: [],
    lineages: [],
    externalReferences: {},
  };
}

function item(id: string) {
  return {
    schemaVersion: 1 as const,
    ontologyVersion,
    id,
    title: id,
    status: "investigating" as const,
    createdAt: at,
    origin: "manual_research" as const,
    summary: "Semantic boundary fixture.",
  };
}

function assertClean(snapshot: ResearchKnowledgeSnapshot): void {
  assert.deepEqual(validateResearchKnowledgeIntegrity(snapshot), []);
}

function assertCode(snapshot: ResearchKnowledgeSnapshot, code: string): void {
  const issues = validateResearchKnowledgeIntegrity(snapshot);
  assert.ok(issues.some((entry) => entry.code === code), `${code} missing: ${JSON.stringify(issues)}`);
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-split-source"), item("research-split-a"), item("research-split-b")];
  snapshot.lineages = [
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "lineage-split-a",
      lineageType: "split_into",
      sourceType: "research_item",
      sourceId: "research-split-source",
      targetType: "research_item",
      targetId: "research-split-a",
      decidedAt: later,
      reason: "One broad idea split into two independently testable ideas.",
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "lineage-split-b",
      lineageType: "split_into",
      sourceType: "research_item",
      sourceId: "research-split-source",
      targetType: "research_item",
      targetId: "research-split-b",
      decidedAt: later,
      reason: "Second independently testable child.",
    },
  ];
  assertClean(snapshot);
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-old"), item("research-new")];
  snapshot.lineages = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "lineage-supersedes",
    lineageType: "supersedes",
    sourceType: "research_item",
    sourceId: "research-new",
    targetType: "research_item",
    targetId: "research-old",
    decidedAt: later,
    reason: "New formulation replaces the old formulation without deleting history.",
  }];
  assertClean(snapshot);
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-reclassified")];
  snapshot.mechanisms = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "mechanism-reclassified",
    title: "Reclassified mechanism",
    description: "The captured idea was actually a reusable causal mechanism, not a standalone research item.",
    status: "active",
    createdAt: at,
  }];
  snapshot.lineages = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "lineage-reclassified",
    lineageType: "reclassified_as",
    sourceType: "research_item",
    sourceId: "research-reclassified",
    targetType: "mechanism",
    targetId: "mechanism-reclassified",
    decidedAt: later,
    reason: "Preserve identity history while changing semantic class.",
  }];
  assertClean(snapshot);
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-a"), item("research-b")];
  snapshot.lineages = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "lineage-bad-reclassification",
    lineageType: "reclassified_as",
    sourceType: "research_item",
    sourceId: "research-a",
    targetType: "research_item",
    targetId: "research-b",
    decidedAt: later,
    reason: "Same-type transition should use merge/split/supersede, not reclassification.",
  }];
  assertCode(snapshot, "research_reclassification_same_type");
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-family-member")];
  snapshot.researchFamilies = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "family-structure",
    title: "Structure",
    description: "Causal family fixture.",
    status: "active",
    createdAt: at,
  }];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-family-no-role",
    relationType: "member_of",
    sourceType: "research_item",
    sourceId: "research-family-member",
    targetType: "research_family",
    targetId: "family-structure",
    createdAt: at,
  }];
  assertCode(snapshot, "research_member_of_role_required");
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-case-target")];
  snapshot.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-role-fixture",
    title: "Case role fixture",
    status: "closed",
    createdAt: at,
    summary: "Case-use role must be explicit.",
  }];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-case-no-role",
    relationType: "used_in",
    sourceType: "case",
    sourceId: "case-role-fixture",
    targetType: "research_item",
    targetId: "research-case-target",
    createdAt: at,
  }];
  assertCode(snapshot, "research_used_in_role_required");
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-dependency-a"), item("research-dependency-b")];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-order-outside-event-chain",
    relationType: "depends_on",
    sourceType: "research_item",
    sourceId: "research-dependency-a",
    targetType: "research_item",
    targetId: "research-dependency-b",
    order: 0,
    createdAt: at,
  }];
  assertCode(snapshot, "research_relation_order_not_allowed");
}

{
  const snapshot = empty();
  snapshot.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-unordered-event-chain",
    title: "Unordered chain",
    status: "open",
    createdAt: at,
    summary: "Event Chain must make ordering explicit.",
  }];
  snapshot.externalReferences = { eventIds: ["evt_example"] };
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-unordered-event",
    relationType: "includes_event",
    sourceType: "case",
    sourceId: "case-unordered-event-chain",
    targetType: "event",
    targetId: "evt_example",
    createdAt: at,
  }];
  assertCode(snapshot, "research_event_chain_order_required");
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-cutoff-target")];
  snapshot.researchQuestions = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "question-cutoff",
    question: "Can a relation use information from the future?",
    status: "open",
    createdAt: at,
  }];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-future-cutoff",
    relationType: "addresses",
    sourceType: "research_question",
    sourceId: "question-cutoff",
    targetType: "research_item",
    targetId: "research-cutoff-target",
    createdAt: at,
    informationCutoff: later,
  }];
  assertCode(snapshot, "research_relation_future_information_cutoff");
}

{
  const snapshot = empty();
  snapshot.researchItems = [item("research-lineage-old"), item("research-lineage-new")];
  const lineage = {
    schemaVersion: 1 as const,
    ontologyVersion,
    lineageType: "supersedes" as const,
    sourceType: "research_item" as const,
    sourceId: "research-lineage-new",
    targetType: "research_item" as const,
    targetId: "research-lineage-old",
    decidedAt: later,
    reason: "Duplicate semantic lineage fixture.",
  };
  snapshot.lineages = [
    { ...lineage, id: "lineage-duplicate-a" },
    { ...lineage, id: "lineage-duplicate-b" },
  ];
  assertCode(snapshot, "research_lineage_semantic_duplicate");
}

console.log("research knowledge semantic boundaries: all tests passed");
