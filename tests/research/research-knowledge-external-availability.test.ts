import assert from "node:assert/strict";
import {
  validateResearchKnowledgeIntegrity,
  type ResearchKnowledgeIntegritySnapshot,
} from "../../src/research/research-knowledge-integrity.js";

const ontologyVersion = "research-knowledge-v1" as const;
const createdAt = "2026-08-28T11:00:00+09:00";
const eventKnownAt = "2026-08-28T10:59:00+09:00";

function snapshot(): ResearchKnowledgeIntegritySnapshot {
  return {
    researchItems: [],
    researchQuestions: [],
    observations: [],
    mechanisms: [],
    researchFamilies: [],
    researchComponents: [],
    cases: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "case-strict-external-availability",
      title: "Strict external availability fixture",
      status: "open",
      createdAt,
      summary: "Repository-mode chronology must know when an external Event identity became available.",
    }],
    studies: [],
    sampleManifests: [],
    studyResults: [],
    opportunities: [],
    relations: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-strict-event-availability",
      relationType: "includes_event",
      sourceType: "case",
      sourceId: "case-strict-external-availability",
      targetType: "event",
      targetId: "evt_strict_example",
      order: 0,
      createdAt,
    }],
    lineages: [],
    externalReferences: {
      eventIds: ["evt_strict_example"],
    },
  };
}

{
  const issues = validateResearchKnowledgeIntegrity(snapshot(), {
    requireExternalAvailability: true,
  });
  assert.ok(
    issues.some((entry) => entry.code === "research_external_availability_required"),
    `strict repository mode must fail closed without Event availableAt: ${JSON.stringify(issues)}`,
  );
}

{
  const value = snapshot();
  value.externalAvailability = {
    event: {
      evt_strict_example: eventKnownAt,
    },
  };
  assert.deepEqual(
    validateResearchKnowledgeIntegrity(value, { requireExternalAvailability: true }),
    [],
    "strict repository mode must pass when the owning Event authority supplies a safe first-known timestamp",
  );
}

{
  const value = snapshot();
  value.externalAvailability = {
    event: {
      evt_strict_example: "2026-08-28T11:01:00+09:00",
    },
  };
  const issues = validateResearchKnowledgeIntegrity(value, {
    requireExternalAvailability: true,
  });
  assert.ok(
    issues.some((entry) => entry.code === "research_relation_before_target_available"),
    `strict mode must reject a relation created before Alpha Pon knew the Event identity: ${JSON.stringify(issues)}`,
  );
}

console.log("research knowledge external availability: strict mode covered");
