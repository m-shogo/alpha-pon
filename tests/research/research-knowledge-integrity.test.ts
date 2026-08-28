import "./research-knowledge-semantic-boundaries.test.js";
import assert from "node:assert/strict";
import {
  validateResearchKnowledgeIntegrity,
  type ResearchKnowledgeIntegritySnapshot,
} from "../../src/research/research-knowledge-integrity.js";

const ontologyVersion = "research-knowledge-v1" as const;
const created = "2026-08-28T10:00:00+09:00";
const later = "2026-08-28T10:10:00+09:00";
const latest = "2026-08-28T10:20:00+09:00";

function emptySnapshot(): ResearchKnowledgeIntegritySnapshot {
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

function item(id: string, at = created) {
  return {
    schemaVersion: 1 as const,
    ontologyVersion,
    id,
    title: id,
    status: "investigating" as const,
    createdAt: at,
    origin: "manual_research" as const,
    summary: "Integrity test fixture.",
  };
}

function codes(snapshot: ResearchKnowledgeIntegritySnapshot): Set<string> {
  return new Set(validateResearchKnowledgeIntegrity(snapshot).map((entry) => entry.code));
}

function requireCode(snapshot: ResearchKnowledgeIntegritySnapshot, code: string): void {
  const issues = validateResearchKnowledgeIntegrity(snapshot);
  assert.ok(issues.some((entry) => entry.code === code), `${code} missing: ${JSON.stringify(issues)}`);
}

{
  const snapshot = emptySnapshot();
  snapshot.researchItems = [item("research-base")];
  assert.deepEqual(validateResearchKnowledgeIntegrity(snapshot), []);
}

{
  const snapshot = emptySnapshot();
  snapshot.researchItems = [item("research-late-item", later)];
  snapshot.researchQuestions = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "question-early-relation",
    question: "Can a relation exist before its target?",
    status: "open",
    createdAt: created,
  }];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-before-target",
    relationType: "addresses",
    sourceType: "research_question",
    sourceId: "question-early-relation",
    targetType: "research_item",
    targetId: "research-late-item",
    createdAt: "2026-08-28T10:05:00+09:00",
  }];
  requireCode(snapshot, "research_relation_before_target_available");
}

{
  const snapshot = emptySnapshot();
  snapshot.researchItems = [item("research-parent")];
  snapshot.researchQuestions = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "question-late-source",
    question: "Can a relation exist before its source?",
    status: "open",
    createdAt: later,
  }];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-before-source",
    relationType: "addresses",
    sourceType: "research_question",
    sourceId: "question-late-source",
    targetType: "research_item",
    targetId: "research-parent",
    createdAt: "2026-08-28T10:05:00+09:00",
  }];
  requireCode(snapshot, "research_relation_before_source_available");
}

{
  const snapshot = emptySnapshot();
  snapshot.researchItems = [item("research-source"), item("research-target", later)];
  snapshot.lineages = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "lineage-too-early",
    lineageType: "merged_into",
    sourceType: "research_item",
    sourceId: "research-source",
    targetType: "research_item",
    targetId: "research-target",
    decidedAt: "2026-08-28T10:05:00+09:00",
    reason: "Intentional chronology violation.",
  }];
  requireCode(snapshot, "research_lineage_before_target_available");
}

function completedStudySnapshot(): ResearchKnowledgeIntegritySnapshot {
  const snapshot = emptySnapshot();
  snapshot.researchItems = [item("research-study-target")];
  snapshot.studies = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "study-completed",
    title: "Completed study",
    mode: "confirmatory",
    status: "completed",
    createdAt: created,
    registeredAt: later,
    informationCutoff: created,
    purpose: "Prove completed Study results are preserved.",
  }];
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-study-target",
    relationType: "studies",
    sourceType: "study",
    sourceId: "study-completed",
    targetType: "research_item",
    targetId: "research-study-target",
    createdAt: later,
  }];
  snapshot.sampleManifests = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "sample-completed",
    studyId: "study-completed",
    role: "confirmatory",
    createdAt: later,
    selectionCutoff: later,
    selectionMethod: "Declared empty-sample integrity fixture.",
    includedCaseIds: [],
    excludedCases: [],
  }];
  snapshot.studyResults = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "result-completed",
    studyId: "study-completed",
    sampleManifestId: "sample-completed",
    createdAt: latest,
    effectSummary: "Null and negative results are still knowledge.",
    identificationQuality: "unidentified",
    exploitability: "not_executable",
    limitations: ["Synthetic integrity fixture"],
    negativeFindings: ["no_effect"],
  }];
  return snapshot;
}

{
  const snapshot = completedStudySnapshot();
  assert.deepEqual(validateResearchKnowledgeIntegrity(snapshot), []);
}

{
  const snapshot = completedStudySnapshot();
  snapshot.studies = snapshot.studies.map((study) => ({ ...study, status: "running" }));
  requireCode(snapshot, "research_study_result_before_study_completion");
}

{
  const snapshot = completedStudySnapshot();
  snapshot.studyResults = [];
  requireCode(snapshot, "research_completed_study_without_result");
}

{
  const snapshot = completedStudySnapshot();
  snapshot.studyResults = snapshot.studyResults.map((result) => ({
    ...result,
    createdAt: "2026-08-28T10:05:00+09:00",
  }));
  const found = codes(snapshot);
  assert.ok(found.has("research_study_result_before_registration"));
  assert.ok(found.has("research_study_result_before_manifest"));
}

{
  const snapshot = completedStudySnapshot();
  snapshot.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-excluded",
    title: "Excluded Case",
    status: "closed",
    createdAt: created,
    summary: "Synthetic exclusion integrity fixture.",
  }];
  snapshot.sampleManifests = snapshot.sampleManifests.map((manifest) => ({
    ...manifest,
    excludedCases: [
      { caseId: "case-excluded", reason: "First reason." },
      { caseId: "case-excluded", reason: "Second reason must not create a second exclusion row." },
    ],
  }));
  requireCode(snapshot, "research_sample_manifest_duplicate_excluded_case");
}

{
  const snapshot = emptySnapshot();
  snapshot.externalReferences = {
    edgeIds: ["edge-one", "edge-one"],
  };
  requireCode(snapshot, "research_external_reference_duplicate");
}

{
  const snapshot = emptySnapshot();
  snapshot.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-external-pit",
    title: "External PIT fixture",
    status: "open",
    createdAt: created,
    summary: "Relation must not use an Event before Alpha Pon knew the Event identity.",
  }];
  snapshot.externalReferences = { eventIds: ["evt_pit"] };
  snapshot.externalAvailability = {
    event: { evt_pit: later },
  };
  snapshot.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-before-event-known",
    relationType: "includes_event",
    sourceType: "case",
    sourceId: "case-external-pit",
    targetType: "event",
    targetId: "evt_pit",
    order: 0,
    createdAt: "2026-08-28T10:05:00+09:00",
  }];
  requireCode(snapshot, "research_relation_before_target_available");
}

{
  const snapshot = emptySnapshot();
  snapshot.externalReferences = { eventIds: ["evt_valid"] };
  snapshot.externalAvailability = {
    event: { evt_missing: later },
  };
  requireCode(snapshot, "research_external_availability_without_reference");
}

{
  const snapshot = emptySnapshot();
  snapshot.externalReferences = { entityIds: ["entity:one"] };
  snapshot.externalAvailability = {
    entity: { "entity:one": "2026-08-28T10:00:00" },
  };
  requireCode(snapshot, "research_external_availability_invalid_timestamp");
}

console.log("research knowledge integrity hardening: all tests passed");
