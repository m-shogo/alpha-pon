import { compareExplicitIso8601Instants } from "./iso-instant.js";
import {
  validateResearchKnowledgeSemantics,
  type ResearchKnowledgeIssue,
  type ResearchKnowledgeSnapshot,
} from "./research-knowledge-semantics.js";
import type { ResearchLineageNodeType, ResearchRelationNodeType } from "./research-knowledge-types.js";

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function compare(left: string, right: string, leftLabel: string, rightLabel: string): -1 | 0 | 1 {
  return compareExplicitIso8601Instants(left, right, leftLabel, rightLabel);
}

function buildAvailabilityIndex(snapshot: ResearchKnowledgeSnapshot): Map<string, string> {
  const index = new Map<string, string>();
  const put = (type: string, id: string, at: string): void => {
    index.set(`${type}:${id}`, at);
  };

  snapshot.researchItems.forEach((record) => put("research_item", record.id, record.createdAt));
  snapshot.researchQuestions.forEach((record) => put("research_question", record.id, record.createdAt));
  snapshot.observations.forEach((record) => put("observation", record.id, record.observedAt));
  snapshot.mechanisms.forEach((record) => put("mechanism", record.id, record.createdAt));
  snapshot.researchFamilies.forEach((record) => put("research_family", record.id, record.createdAt));
  snapshot.researchComponents.forEach((record) => put("research_component", record.id, record.createdAt));
  snapshot.cases.forEach((record) => put("case", record.id, record.createdAt));
  snapshot.studies.forEach((record) => put("study", record.id, record.createdAt));
  snapshot.studyResults.forEach((record) => put("study_result", record.id, record.createdAt));
  snapshot.opportunities.forEach((record) => put("opportunity", record.id, record.detectedAt));
  return index;
}

function availability(
  index: Map<string, string>,
  type: ResearchRelationNodeType | ResearchLineageNodeType,
  id: string,
): string | undefined {
  return index.get(`${type}:${id}`);
}

function validateRelationChronology(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const index = buildAvailabilityIndex(snapshot);

  for (const relation of snapshot.relations) {
    const target = `relation:${relation.id}`;
    const sourceAt = availability(index, relation.sourceType, relation.sourceId);
    const targetAt = availability(index, relation.targetType, relation.targetId);
    if (sourceAt && compare(
      relation.createdAt,
      sourceAt,
      `${target}.createdAt`,
      `${relation.sourceType}:${relation.sourceId}.availableAt`,
    ) < 0) {
      issues.push(issue(
        "research_relation_before_source_available",
        target,
        `relation creation ${relation.createdAt} predates source availability ${sourceAt}`,
      ));
    }
    if (targetAt && compare(
      relation.createdAt,
      targetAt,
      `${target}.createdAt`,
      `${relation.targetType}:${relation.targetId}.availableAt`,
    ) < 0) {
      issues.push(issue(
        "research_relation_before_target_available",
        target,
        `relation creation ${relation.createdAt} predates target availability ${targetAt}`,
      ));
    }
  }
  return issues;
}

function validateLineageChronology(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const index = buildAvailabilityIndex(snapshot);

  for (const lineage of snapshot.lineages) {
    const target = `lineage:${lineage.id}`;
    const sourceAt = availability(index, lineage.sourceType, lineage.sourceId);
    const targetAt = availability(index, lineage.targetType, lineage.targetId);
    if (sourceAt && compare(
      lineage.decidedAt,
      sourceAt,
      `${target}.decidedAt`,
      `${lineage.sourceType}:${lineage.sourceId}.availableAt`,
    ) < 0) {
      issues.push(issue(
        "research_lineage_before_source_available",
        target,
        `lineage decision ${lineage.decidedAt} predates source availability ${sourceAt}`,
      ));
    }
    if (targetAt && compare(
      lineage.decidedAt,
      targetAt,
      `${target}.decidedAt`,
      `${lineage.targetType}:${lineage.targetId}.availableAt`,
    ) < 0) {
      issues.push(issue(
        "research_lineage_before_target_available",
        target,
        `lineage decision ${lineage.decidedAt} predates target availability ${targetAt}`,
      ));
    }
  }
  return issues;
}

function validateStudyResultLifecycle(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const studyById = new Map(snapshot.studies.map((record) => [record.id, record]));
  const resultCountByStudy = new Map<string, number>();

  for (const result of snapshot.studyResults) {
    resultCountByStudy.set(result.studyId, (resultCountByStudy.get(result.studyId) ?? 0) + 1);
    const study = studyById.get(result.studyId);
    if (!study) continue;
    const target = `study_result:${result.id}`;

    if (study.status !== "completed" && study.status !== "archived") {
      issues.push(issue(
        "research_study_result_before_study_completion",
        target,
        `StudyResult is final knowledge and requires Study status completed/archived; found ${study.status}`,
      ));
    }
    if (study.registeredAt && compare(
      result.createdAt,
      study.registeredAt,
      `${target}.createdAt`,
      `study:${study.id}.registeredAt`,
    ) < 0) {
      issues.push(issue(
        "research_study_result_before_registration",
        target,
        `StudyResult cannot predate Study registration`,
      ));
    }
  }

  for (const study of snapshot.studies) {
    if (study.status === "completed" && (resultCountByStudy.get(study.id) ?? 0) === 0) {
      issues.push(issue(
        "research_completed_study_without_result",
        `study:${study.id}`,
        `completed Study must preserve a StudyResult, including negative/null findings`,
      ));
    }
  }
  return issues;
}

function validateSampleExclusionUniqueness(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  for (const manifest of snapshot.sampleManifests) {
    const seen = new Set<string>();
    for (const excluded of manifest.excludedCases) {
      if (seen.has(excluded.caseId)) {
        issues.push(issue(
          "research_sample_manifest_duplicate_excluded_case",
          `sample_manifest:${manifest.id}`,
          `excluded Case ${excluded.caseId} appears more than once; keep one canonical exclusion reason`,
        ));
      }
      seen.add(excluded.caseId);
    }
  }
  return issues;
}

function validateExternalReferenceUniqueness(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const groups = Object.entries(snapshot.externalReferences ?? {}) as [string, readonly string[]][];
  for (const [authority, ids] of groups) {
    if (new Set(ids).size !== ids.length) {
      issues.push(issue(
        "research_external_reference_duplicate",
        `external_references:${authority}`,
        `authority snapshot contains duplicate IDs`,
      ));
    }
  }
  return issues;
}

export function validateResearchKnowledgeIntegrity(
  snapshot: ResearchKnowledgeSnapshot,
): ResearchKnowledgeIssue[] {
  return [
    ...validateResearchKnowledgeSemantics(snapshot),
    ...validateRelationChronology(snapshot),
    ...validateLineageChronology(snapshot),
    ...validateStudyResultLifecycle(snapshot),
    ...validateSampleExclusionUniqueness(snapshot),
    ...validateExternalReferenceUniqueness(snapshot),
  ].sort((a, b) => `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`));
}
