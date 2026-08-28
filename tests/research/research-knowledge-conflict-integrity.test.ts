import assert from "node:assert/strict";
import { validateResearchKnowledgeIntegrity } from "../../src/research/research-knowledge-integrity.js";
import type { ResearchKnowledgeIntegritySnapshot } from "../../src/research/research-knowledge-integrity.js";

const ontologyVersion = "research-knowledge-v1" as const;
const at = "2026-08-28T11:30:00+09:00";

function empty(): ResearchKnowledgeIntegritySnapshot {
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

function has(snapshot: ResearchKnowledgeIntegritySnapshot, code: string): boolean {
  return validateResearchKnowledgeIntegrity(snapshot).some((entry) => entry.code === code);
}

{
  const snapshot = empty();
  snapshot.researchItems = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "research-role-conflict",
    title: "Role conflict fixture",
    status: "investigating",
    createdAt: at,
    origin: "manual_research",
    summary: "The same Case cannot be both a supporting sample and negative control for one target.",
  }];
  snapshot.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-role-conflict",
    title: "Role conflict Case",
    status: "closed",
    createdAt: at,
    summary: "Synthetic Case for conflict validation.",
  }];
  snapshot.relations = [
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-supporting-role",
      relationType: "used_in",
      sourceType: "case",
      sourceId: "case-role-conflict",
      targetType: "research_item",
      targetId: "research-role-conflict",
      role: "supporting_sample",
      createdAt: at,
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-negative-role",
      relationType: "used_in",
      sourceType: "case",
      sourceId: "case-role-conflict",
      targetType: "research_item",
      targetId: "research-role-conflict",
      role: "negative_control",
      createdAt: at,
    },
  ];
  assert.equal(has(snapshot, "research_relation_conflicting_roles"), true);
}

{
  const snapshot = empty();
  snapshot.researchItems = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "research-family-role-conflict",
    title: "Family role conflict fixture",
    status: "investigating",
    createdAt: at,
    origin: "manual_research",
    summary: "One exact Family membership cannot be primary and secondary simultaneously.",
  }];
  snapshot.researchFamilies = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "family-role-conflict",
    title: "Family role conflict",
    description: "Synthetic Family.",
    status: "active",
    createdAt: at,
  }];
  snapshot.relations = [
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-family-primary",
      relationType: "member_of",
      sourceType: "research_item",
      sourceId: "research-family-role-conflict",
      targetType: "research_family",
      targetId: "family-role-conflict",
      role: "primary",
      createdAt: at,
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-family-secondary",
      relationType: "member_of",
      sourceType: "research_item",
      sourceId: "research-family-role-conflict",
      targetType: "research_family",
      targetId: "family-role-conflict",
      role: "secondary",
      createdAt: at,
    },
  ];
  assert.equal(has(snapshot, "research_relation_conflicting_roles"), true);
}

{
  const snapshot = empty();
  snapshot.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-duplicate-event",
    title: "Duplicate Event Chain fixture",
    status: "open",
    createdAt: at,
    summary: "The same canonical Event must not occupy two positions in one Case Event Chain.",
  }];
  snapshot.externalReferences = { eventIds: ["evt_duplicate"] };
  snapshot.relations = [
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-event-first",
      relationType: "includes_event",
      sourceType: "case",
      sourceId: "case-duplicate-event",
      targetType: "event",
      targetId: "evt_duplicate",
      order: 0,
      createdAt: at,
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-event-second",
      relationType: "includes_event",
      sourceType: "case",
      sourceId: "case-duplicate-event",
      targetType: "event",
      targetId: "evt_duplicate",
      order: 1,
      createdAt: at,
    },
  ];
  assert.equal(has(snapshot, "research_event_chain_duplicate_event"), true);
}

console.log("research knowledge conflict integrity: all tests passed");
