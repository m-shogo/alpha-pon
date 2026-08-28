import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";
import { validateResearchKnowledgeConflictIntegrity } from "./research-knowledge-conflict-integrity.js";
import {
  validateResearchKnowledgeSemantics,
  type ResearchKnowledgeIssue,
  type ResearchKnowledgeSnapshot,
} from "./research-knowledge-semantics.js";
import type { ResearchLineageNodeType, ResearchRelationNodeType } from "./research-knowledge-types.js";

export type ResearchKnowledgeExternalNodeType =
  | "edge"
  | "event"
  | "entity"
  | "document"
  | "watch"
  | "implementation";

export type ResearchKnowledgeExternalAvailability = Partial<
  Record<ResearchKnowledgeExternalNodeType, Readonly<Record<string, string>>>
>;

export interface ResearchKnowledgeIntegritySnapshot extends ResearchKnowledgeSnapshot {
  /**
   * PIT availability from the owning authority. Values mean "first known to Alpha Pon",
   * not the economic effective date of the underlying entity/event.
   */
  externalAvailability?: ResearchKnowledgeExternalAvailability;
}

export interface ResearchKnowledgeIntegrityOptions {
  /**
   * Repository loaders should enable this once authority adapters exist.
   * Contract-only/in-memory tests may leave it false while persistence is intentionally absent.
   */
  requireExternalAvailability?: boolean;
}

const EXTERNAL_NODE_TYPES = new Set<ResearchKnowledgeExternalNodeType>([
  "edge",
  "event",
  "entity",
  "document",
  "watch",
  "implementation",
]);

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function compare(left: string, right: string, leftLabel: string, rightLabel: string): -1 | 0 | 1 {
  return compareExplicitIso8601Instants(left, right, leftLabel, rightLabel);
}

function isValidInstant(value: string, label: string): boolean {
  try {
    parseExplicitIso8601Instant(value, label);
    return true;
  } catch {
    return false;
  }
}

function isExternalType(type: ResearchRelationNodeType | ResearchLineageNodeType): type is ResearchKnowledgeExternalNodeType {
  return EXTERNAL_NODE_TYPES.has(type as ResearchKnowledgeExternalNodeType);
}

function externalIdsFor(
  snapshot: ResearchKnowledgeIntegritySnapshot,
  type: ResearchKnowledgeExternalNodeType,
): readonly string[] {
  switch (type) {
    case "edge": return snapshot.externalReferences?.edgeIds ?? [];
    case "event": return snapshot.externalReferences?.eventIds ?? [];
    case "entity": return snapshot.externalReferences?.entityIds ?? [];
    case "document": return snapshot.externalReferences?.documentIds ?? [];
    case "watch": return snapshot.externalReferences?.watchIds ?? [];
    case "implementation": return snapshot.externalReferences?.implementationIds ?? [];
  }
}

function buildAvailabilityIndex(snapshot: ResearchKnowledgeIntegritySnapshot): Map<string, string> {
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

  const groups = Object.entries(snapshot.externalAvailability ?? {}) as [
    ResearchKnowledgeExternalNodeType,
    Readonly<Record<string, string>>,
  ][];
  for (const [type, entries] of groups) {
    for (const [id, at] of Object.entries(entries)) {
      if (isValidInstant(at, `externalAvailability.${type}.${id}`)) put(type, id, at);
    }
  }
  return index;
}

function availability(
  index: Map<string, string>,
  type: ResearchRelationNodeType | ResearchLineageNodeType,
  id: string,
): string | undefined {
  return index.get(`${type}:${id}`);
}

function validateRelationChronology(snapshot: ResearchKnowledgeIntegritySnapshot): ResearchKnowledgeIssue[] {
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

function validateLineageChronology(snapshot: ResearchKnowledgeIntegritySnapshot): ResearchKnowledgeIssue[] {
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

function validateExternalAvailability(snapshot: ResearchKnowledgeIntegritySnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const groups = Object.entries(snapshot.externalAvailability ?? {}) as [
    ResearchKnowledgeExternalNodeType,
    Readonly<Record<string, string>>,
  ][];

  for (const [type, entries] of groups) {
    const declared = new Set(externalIdsFor(snapshot, type));
    for (const [id, at] of Object.entries(entries)) {
      const target = `external_availability:${type}:${id}`;
      if (!declared.has(id)) {
        issues.push(issue(
          "research_external_availability_without_reference",
          target,
          `availability metadata exists for undeclared ${type} ID ${id}`,
        ));
      }
      if (!isValidInstant(at, target)) {
        issues.push(issue(
          "research_external_availability_invalid_timestamp",
          target,
          `availableAt must be a strict ISO-8601 instant with explicit timezone`,
        ));
      }
    }
  }
  return issues;
}

function validateExternalAvailabilityCoverage(
  snapshot: ResearchKnowledgeIntegritySnapshot,
  required: boolean,
): ResearchKnowledgeIssue[] {
  if (!required) return [];
  const issues: ResearchKnowledgeIssue[] = [];
  const seen = new Set<string>();

  const requireEndpoint = (
    type: ResearchRelationNodeType | ResearchLineageNodeType,
    id: string,
    target: string,
  ): void => {
    if (!isExternalType(type)) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    const at = snapshot.externalAvailability?.[type]?.[id];
    if (!at) {
      issues.push(issue(
        "research_external_availability_required",
        target,
        `strict external chronology requires availableAt for ${key}`,
      ));
    }
  };

  for (const relation of snapshot.relations) {
    requireEndpoint(relation.sourceType, relation.sourceId, `relation:${relation.id}`);
    requireEndpoint(relation.targetType, relation.targetId, `relation:${relation.id}`);
  }
  for (const lineage of snapshot.lineages) {
    requireEndpoint(lineage.sourceType, lineage.sourceId, `lineage:${lineage.id}`);
    requireEndpoint(lineage.targetType, lineage.targetId, `lineage:${lineage.id}`);
  }
  return issues;
}

export function validateResearchKnowledgeIntegrity(
  snapshot: ResearchKnowledgeIntegritySnapshot,
  options: ResearchKnowledgeIntegrityOptions = {},
): ResearchKnowledgeIssue[] {
  return [
    ...validateResearchKnowledgeSemantics(snapshot),
    ...validateResearchKnowledgeConflictIntegrity(snapshot),
    ...validateExternalAvailability(snapshot),
    ...validateExternalAvailabilityCoverage(snapshot, options.requireExternalAvailability === true),
    ...validateRelationChronology(snapshot),
    ...validateLineageChronology(snapshot),
    ...validateStudyResultLifecycle(snapshot),
    ...validateSampleExclusionUniqueness(snapshot),
    ...validateExternalReferenceUniqueness(snapshot),
  ].sort((a, b) => `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`));
}
