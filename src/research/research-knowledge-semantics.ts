import { compareExplicitIso8601Instants } from "./iso-instant.js";
import type {
  ResearchCaseRecord,
  ResearchComponentRecord,
  ResearchFamilyRecord,
  ResearchItemRecord,
  ResearchLineageNodeType,
  ResearchLineageRecord,
  ResearchMechanismRecord,
  ResearchObservationRecord,
  ResearchOpportunityRecord,
  ResearchQuestionRecord,
  ResearchRelationNodeType,
  ResearchRelationRecord,
  ResearchRelationType,
  ResearchStudyRecord,
  ResearchStudyResultRecord,
  ResearchStudySampleManifestRecord,
} from "./research-knowledge-types.js";

export interface ResearchKnowledgeExternalReferences {
  edgeIds?: readonly string[];
  eventIds?: readonly string[];
  entityIds?: readonly string[];
  documentIds?: readonly string[];
  watchIds?: readonly string[];
  implementationIds?: readonly string[];
}

export interface ResearchKnowledgeSnapshot {
  researchItems: readonly ResearchItemRecord[];
  researchQuestions: readonly ResearchQuestionRecord[];
  observations: readonly ResearchObservationRecord[];
  mechanisms: readonly ResearchMechanismRecord[];
  researchFamilies: readonly ResearchFamilyRecord[];
  researchComponents: readonly ResearchComponentRecord[];
  cases: readonly ResearchCaseRecord[];
  studies: readonly ResearchStudyRecord[];
  sampleManifests: readonly ResearchStudySampleManifestRecord[];
  studyResults: readonly ResearchStudyResultRecord[];
  opportunities: readonly ResearchOpportunityRecord[];
  relations: readonly ResearchRelationRecord[];
  lineages: readonly ResearchLineageRecord[];
  externalReferences?: ResearchKnowledgeExternalReferences;
}

export interface ResearchKnowledgeIssue {
  severity: "error";
  code: string;
  target: string;
  message: string;
}

const RELATION_ENDPOINT_MATRIX: Record<
  ResearchRelationType,
  { sources: readonly ResearchRelationNodeType[]; targets: readonly ResearchRelationNodeType[] }
> = {
  observes_event: { sources: ["observation"], targets: ["event"] },
  includes_event: { sources: ["case"], targets: ["event"] },
  involves_entity: { sources: ["case"], targets: ["entity"] },
  addresses: { sources: ["research_question"], targets: ["research_item"] },
  member_of: { sources: ["research_item", "edge"], targets: ["research_family"] },
  part_of: { sources: ["research_component"], targets: ["research_item", "edge"] },
  considers_mechanism: {
    sources: ["research_item", "research_question", "edge"],
    targets: ["mechanism"],
  },
  studies: {
    sources: ["study"],
    targets: ["research_item", "research_question", "mechanism", "research_component", "edge"],
  },
  used_in: {
    sources: ["case"],
    targets: ["research_item", "research_question", "research_component", "edge"],
  },
  documents: {
    sources: ["document"],
    targets: [
      "research_item",
      "research_question",
      "mechanism",
      "research_family",
      "research_component",
      "case",
      "study",
      "study_result",
      "opportunity",
      "edge",
    ],
  },
  operationalizes: {
    sources: ["watch"],
    targets: ["research_item", "research_component", "edge"],
  },
  implements: {
    sources: ["implementation"],
    targets: ["watch", "research_item", "research_component", "edge"],
  },
  applies_edge: { sources: ["opportunity"], targets: ["edge"] },
  triggered_by: { sources: ["opportunity"], targets: ["event"] },
  depends_on: {
    sources: [
      "research_item",
      "research_question",
      "mechanism",
      "research_family",
      "research_component",
      "study",
      "opportunity",
      "edge",
    ],
    targets: [
      "research_item",
      "research_question",
      "mechanism",
      "research_family",
      "research_component",
      "study",
      "opportunity",
      "edge",
    ],
  },
};

const INTERNAL_RELATION_NODE_TYPES = new Set<ResearchRelationNodeType>([
  "research_item",
  "research_question",
  "observation",
  "mechanism",
  "research_family",
  "research_component",
  "case",
  "study",
  "study_result",
  "opportunity",
]);

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function nodeKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function compare(left: string, right: string, leftLabel: string, rightLabel: string): -1 | 0 | 1 {
  return compareExplicitIso8601Instants(left, right, leftLabel, rightLabel);
}

function addIds(target: Map<ResearchRelationNodeType, Set<string>>, type: ResearchRelationNodeType, ids: readonly string[]): void {
  target.set(type, new Set(ids));
}

function buildRelationNodeIndex(snapshot: ResearchKnowledgeSnapshot): Map<ResearchRelationNodeType, Set<string>> {
  const index = new Map<ResearchRelationNodeType, Set<string>>();
  addIds(index, "research_item", snapshot.researchItems.map((record) => record.id));
  addIds(index, "research_question", snapshot.researchQuestions.map((record) => record.id));
  addIds(index, "observation", snapshot.observations.map((record) => record.id));
  addIds(index, "mechanism", snapshot.mechanisms.map((record) => record.id));
  addIds(index, "research_family", snapshot.researchFamilies.map((record) => record.id));
  addIds(index, "research_component", snapshot.researchComponents.map((record) => record.id));
  addIds(index, "case", snapshot.cases.map((record) => record.id));
  addIds(index, "study", snapshot.studies.map((record) => record.id));
  addIds(index, "study_result", snapshot.studyResults.map((record) => record.id));
  addIds(index, "opportunity", snapshot.opportunities.map((record) => record.id));
  addIds(index, "edge", snapshot.externalReferences?.edgeIds ?? []);
  addIds(index, "event", snapshot.externalReferences?.eventIds ?? []);
  addIds(index, "entity", snapshot.externalReferences?.entityIds ?? []);
  addIds(index, "document", snapshot.externalReferences?.documentIds ?? []);
  addIds(index, "watch", snapshot.externalReferences?.watchIds ?? []);
  addIds(index, "implementation", snapshot.externalReferences?.implementationIds ?? []);
  return index;
}

function buildLineageNodeIndex(snapshot: ResearchKnowledgeSnapshot): Map<ResearchLineageNodeType, Set<string>> {
  const relationIndex = buildRelationNodeIndex(snapshot);
  const types: readonly ResearchLineageNodeType[] = [
    "research_item",
    "research_question",
    "mechanism",
    "research_family",
    "research_component",
    "case",
    "study",
    "study_result",
    "opportunity",
    "edge",
  ];
  return new Map(types.map((type) => [type, new Set(relationIndex.get(type) ?? [])]));
}

function validateOwnedIdUniqueness(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const seen = new Map<string, string>();
  const groups: readonly [string, readonly { id: string }[]][] = [
    ["research_item", snapshot.researchItems],
    ["research_question", snapshot.researchQuestions],
    ["observation", snapshot.observations],
    ["mechanism", snapshot.mechanisms],
    ["research_family", snapshot.researchFamilies],
    ["research_component", snapshot.researchComponents],
    ["case", snapshot.cases],
    ["study", snapshot.studies],
    ["sample_manifest", snapshot.sampleManifests],
    ["study_result", snapshot.studyResults],
    ["opportunity", snapshot.opportunities],
    ["relation", snapshot.relations],
    ["lineage", snapshot.lineages],
  ];

  for (const [type, records] of groups) {
    for (const record of records) {
      const prior = seen.get(record.id);
      if (prior) {
        issues.push(issue(
          "research_knowledge_duplicate_owned_id",
          `${type}:${record.id}`,
          `Research-owned ID ${record.id} is already used by ${prior}`,
        ));
      } else {
        seen.set(record.id, type);
      }
    }
  }
  return issues;
}

function validateRelations(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const index = buildRelationNodeIndex(snapshot);
  const semanticKeys = new Map<string, string>();
  const primaryFamilies = new Map<string, string[]>();
  const componentParents = new Map<string, string[]>();
  const questionParents = new Map<string, string[]>();
  const studyTargets = new Map<string, string[]>();
  const opportunityEdges = new Map<string, string[]>();
  const eventChains = new Map<string, ResearchRelationRecord[]>();
  const dependencyEdges: [string, string][] = [];

  for (const relation of snapshot.relations) {
    const target = `relation:${relation.id}`;
    const matrix = RELATION_ENDPOINT_MATRIX[relation.relationType];
    const sourceExists = index.get(relation.sourceType)?.has(relation.sourceId) === true;
    const targetExists = index.get(relation.targetType)?.has(relation.targetId) === true;

    if (!sourceExists) {
      issues.push(issue(
        "research_relation_dangling_source",
        target,
        `${relation.sourceType}:${relation.sourceId} does not exist in the supplied authority snapshot`,
      ));
    }
    if (!targetExists) {
      issues.push(issue(
        "research_relation_dangling_target",
        target,
        `${relation.targetType}:${relation.targetId} does not exist in the supplied authority snapshot`,
      ));
    }
    if (!matrix.sources.includes(relation.sourceType) || !matrix.targets.includes(relation.targetType)) {
      issues.push(issue(
        "research_relation_endpoint_type_mismatch",
        target,
        `${relation.relationType} does not allow ${relation.sourceType} -> ${relation.targetType}`,
      ));
    }
    if (relation.sourceType === relation.targetType && relation.sourceId === relation.targetId) {
      issues.push(issue(
        "research_relation_self_reference",
        target,
        `${relation.relationType} cannot point a node to itself`,
      ));
    }
    if (relation.informationCutoff && compare(
      relation.informationCutoff,
      relation.createdAt,
      `${target}.informationCutoff`,
      `${target}.createdAt`,
    ) > 0) {
      issues.push(issue(
        "research_relation_future_information_cutoff",
        target,
        `${relation.informationCutoff} is later than relation creation ${relation.createdAt}`,
      ));
    }
    if (relation.order !== undefined && relation.relationType !== "includes_event") {
      issues.push(issue(
        "research_relation_order_not_allowed",
        target,
        `order is reserved for includes_event Event Chains`,
      ));
    }

    const semanticKey = [
      relation.relationType,
      relation.sourceType,
      relation.sourceId,
      relation.targetType,
      relation.targetId,
      relation.role ?? "",
      relation.order ?? "",
    ].join("|");
    const prior = semanticKeys.get(semanticKey);
    if (prior) {
      issues.push(issue(
        "research_relation_semantic_duplicate",
        target,
        `duplicates semantic relation ${prior} independent of record ID`,
      ));
    } else {
      semanticKeys.set(semanticKey, relation.id);
    }

    if (relation.relationType === "member_of") {
      if (relation.role !== "primary" && relation.role !== "secondary") {
        issues.push(issue(
          "research_member_of_role_required",
          target,
          `member_of must declare role primary or secondary`,
        ));
      }
      if (relation.role === "primary") {
        const key = nodeKey(relation.sourceType, relation.sourceId);
        primaryFamilies.set(key, [...(primaryFamilies.get(key) ?? []), relation.id]);
      }
    }

    if (relation.relationType === "used_in") {
      const allowedRoles = new Set([
        "seed",
        "supporting_sample",
        "negative_control",
        "near_miss",
        "contradictory",
        "confounded",
        "calibration",
        "holdout",
        "out_of_sample",
        "candidate",
      ]);
      if (!relation.role || !allowedRoles.has(relation.role)) {
        issues.push(issue(
          "research_used_in_role_required",
          target,
          `used_in must declare a case-use role`,
        ));
      }
    }

    if (relation.relationType === "part_of" && relation.sourceType === "research_component") {
      componentParents.set(
        relation.sourceId,
        [...(componentParents.get(relation.sourceId) ?? []), relation.id],
      );
    }
    if (relation.relationType === "addresses" && relation.sourceType === "research_question") {
      questionParents.set(
        relation.sourceId,
        [...(questionParents.get(relation.sourceId) ?? []), relation.id],
      );
    }
    if (relation.relationType === "studies" && relation.sourceType === "study") {
      studyTargets.set(relation.sourceId, [...(studyTargets.get(relation.sourceId) ?? []), relation.id]);
    }
    if (relation.relationType === "applies_edge" && relation.sourceType === "opportunity") {
      opportunityEdges.set(
        relation.sourceId,
        [...(opportunityEdges.get(relation.sourceId) ?? []), relation.id],
      );
    }
    if (relation.relationType === "includes_event" && relation.sourceType === "case") {
      eventChains.set(relation.sourceId, [...(eventChains.get(relation.sourceId) ?? []), relation]);
    }
    if (relation.relationType === "depends_on") {
      dependencyEdges.push([
        nodeKey(relation.sourceType, relation.sourceId),
        nodeKey(relation.targetType, relation.targetId),
      ]);
    }
  }

  for (const [key, relationIds] of primaryFamilies) {
    if (relationIds.length > 1) {
      issues.push(issue(
        "research_multiple_primary_families",
        key,
        `more than one primary ResearchFamily is declared: ${relationIds.join(", ")}`,
      ));
    }
  }

  for (const component of snapshot.researchComponents) {
    const parents = componentParents.get(component.id) ?? [];
    if (parents.length !== 1) {
      issues.push(issue(
        "research_component_parent_cardinality",
        `research_component:${component.id}`,
        `ResearchComponent must have exactly one part_of parent; found ${parents.length}`,
      ));
    }
  }
  for (const question of snapshot.researchQuestions) {
    const parents = questionParents.get(question.id) ?? [];
    if (parents.length < 1) {
      issues.push(issue(
        "research_question_without_parent_item",
        `research_question:${question.id}`,
        `ResearchQuestion must address at least one ResearchItem`,
      ));
    }
  }
  for (const study of snapshot.studies) {
    const targets = studyTargets.get(study.id) ?? [];
    if (targets.length < 1) {
      issues.push(issue(
        "research_study_without_target",
        `study:${study.id}`,
        `Study must have at least one studies relation`,
      ));
    }
  }
  for (const opportunity of snapshot.opportunities) {
    const edges = opportunityEdges.get(opportunity.id) ?? [];
    if (edges.length < 1) {
      issues.push(issue(
        "research_opportunity_without_edge",
        `opportunity:${opportunity.id}`,
        `Opportunity must apply at least one formal Edge; otherwise keep it as ResearchItem/Case`,
      ));
    }
  }

  for (const [caseId, chain] of eventChains) {
    const missingOrder = chain.filter((relation) => relation.order === undefined);
    if (missingOrder.length > 0) {
      issues.push(issue(
        "research_event_chain_order_required",
        `case:${caseId}`,
        `all includes_event relations in an Event Chain must declare order`,
      ));
      continue;
    }
    const orders = chain.map((relation) => relation.order as number).sort((a, b) => a - b);
    const unique = new Set(orders);
    if (unique.size !== orders.length) {
      issues.push(issue(
        "research_event_chain_duplicate_order",
        `case:${caseId}`,
        `Event Chain order values must be unique: ${orders.join(", ")}`,
      ));
      continue;
    }
    const expected = orders.map((_, index) => index);
    if (orders.some((value, index) => value !== expected[index])) {
      issues.push(issue(
        "research_event_chain_non_contiguous_order",
        `case:${caseId}`,
        `Event Chain order must be contiguous from 0; found ${orders.join(", ")}`,
      ));
    }
  }

  if (hasDirectedCycle(dependencyEdges)) {
    issues.push(issue(
      "research_dependency_cycle",
      "relations:depends_on",
      `depends_on graph must be acyclic`,
    ));
  }

  return issues;
}

function validateLineages(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];
  const index = buildLineageNodeIndex(snapshot);
  const semanticKeys = new Map<string, string>();
  const mergedDestinations = new Map<string, string[]>();
  const edges: [string, string][] = [];

  for (const lineage of snapshot.lineages) {
    const target = `lineage:${lineage.id}`;
    if (index.get(lineage.sourceType)?.has(lineage.sourceId) !== true) {
      issues.push(issue(
        "research_lineage_dangling_source",
        target,
        `${lineage.sourceType}:${lineage.sourceId} does not exist`,
      ));
    }
    if (index.get(lineage.targetType)?.has(lineage.targetId) !== true) {
      issues.push(issue(
        "research_lineage_dangling_target",
        target,
        `${lineage.targetType}:${lineage.targetId} does not exist`,
      ));
    }
    if (lineage.sourceType === lineage.targetType && lineage.sourceId === lineage.targetId) {
      issues.push(issue(
        "research_lineage_self_reference",
        target,
        `lineage cannot point a node to itself`,
      ));
    }

    if (
      ["merged_into", "split_into", "supersedes"].includes(lineage.lineageType)
      && lineage.sourceType !== lineage.targetType
    ) {
      issues.push(issue(
        "research_lineage_type_mismatch",
        target,
        `${lineage.lineageType} requires the same source and target node type`,
      ));
    }
    if (lineage.lineageType === "reclassified_as" && lineage.sourceType === lineage.targetType) {
      issues.push(issue(
        "research_reclassification_same_type",
        target,
        `reclassified_as is reserved for cross-type identity reclassification`,
      ));
    }

    const semanticKey = [
      lineage.lineageType,
      lineage.sourceType,
      lineage.sourceId,
      lineage.targetType,
      lineage.targetId,
    ].join("|");
    const prior = semanticKeys.get(semanticKey);
    if (prior) {
      issues.push(issue(
        "research_lineage_semantic_duplicate",
        target,
        `duplicates lineage ${prior} independent of record ID`,
      ));
    } else {
      semanticKeys.set(semanticKey, lineage.id);
    }

    if (lineage.lineageType === "merged_into") {
      const key = nodeKey(lineage.sourceType, lineage.sourceId);
      mergedDestinations.set(key, [...(mergedDestinations.get(key) ?? []), lineage.targetId]);
    }
    edges.push([
      nodeKey(lineage.sourceType, lineage.sourceId),
      nodeKey(lineage.targetType, lineage.targetId),
    ]);
  }

  for (const [source, destinations] of mergedDestinations) {
    if (new Set(destinations).size > 1) {
      issues.push(issue(
        "research_multiple_merge_destinations",
        source,
        `one source cannot be merged_into multiple destinations: ${destinations.join(", ")}`,
      ));
    }
  }
  if (hasDirectedCycle(edges)) {
    issues.push(issue(
      "research_lineage_cycle",
      "lineage",
      `Research Lineage must be acyclic across derivation, merge, split, supersession and reclassification`,
    ));
  }
  return issues;
}

function validateTemporalAndLifecycleSemantics(snapshot: ResearchKnowledgeSnapshot): ResearchKnowledgeIssue[] {
  const issues: ResearchKnowledgeIssue[] = [];

  for (const item of snapshot.researchItems) {
    const target = `research_item:${item.id}`;
    if (item.status === "resolved" && !item.resolution) {
      issues.push(issue(
        "research_item_resolved_without_resolution",
        target,
        `resolved ResearchItem must declare resolution`,
      ));
    }
    if (
      ["captured", "triage", "investigating", "synthesized"].includes(item.status)
      && (item.resolution || item.stopReason)
    ) {
      issues.push(issue(
        "research_item_active_with_final_disposition",
        target,
        `active ResearchItem cannot carry final resolution/stopReason`,
      ));
    }
    if (item.lastReviewedAt && compare(
      item.lastReviewedAt,
      item.createdAt,
      `${target}.lastReviewedAt`,
      `${target}.createdAt`,
    ) < 0) {
      issues.push(issue(
        "research_item_review_before_creation",
        target,
        `${item.lastReviewedAt} is before creation ${item.createdAt}`,
      ));
    }
  }

  for (const question of snapshot.researchQuestions) {
    if (question.lastReviewedAt && compare(
      question.lastReviewedAt,
      question.createdAt,
      `research_question:${question.id}.lastReviewedAt`,
      `research_question:${question.id}.createdAt`,
    ) < 0) {
      issues.push(issue(
        "research_question_review_before_creation",
        `research_question:${question.id}`,
        `lastReviewedAt cannot predate createdAt`,
      ));
    }
  }

  for (const mechanism of snapshot.mechanisms) {
    if (mechanism.lastReviewedAt && compare(
      mechanism.lastReviewedAt,
      mechanism.createdAt,
      `mechanism:${mechanism.id}.lastReviewedAt`,
      `mechanism:${mechanism.id}.createdAt`,
    ) < 0) {
      issues.push(issue(
        "research_mechanism_review_before_creation",
        `mechanism:${mechanism.id}`,
        `lastReviewedAt cannot predate createdAt`,
      ));
    }
  }

  for (const record of snapshot.cases) {
    if (record.episodeStart && record.episodeEnd && compare(
      record.episodeEnd,
      record.episodeStart,
      `case:${record.id}.episodeEnd`,
      `case:${record.id}.episodeStart`,
    ) < 0) {
      issues.push(issue(
        "research_case_episode_reversed",
        `case:${record.id}`,
        `episodeEnd cannot predate episodeStart`,
      ));
    }
  }

  const registeredStatuses = new Set(["registered", "running", "completed"]);
  for (const study of snapshot.studies) {
    const target = `study:${study.id}`;
    if (registeredStatuses.has(study.status) && !study.registeredAt) {
      issues.push(issue(
        "research_study_registered_status_without_timestamp",
        target,
        `${study.status} Study must declare registeredAt`,
      ));
    }
    if (study.registeredAt && compare(
      study.registeredAt,
      study.createdAt,
      `${target}.registeredAt`,
      `${target}.createdAt`,
    ) < 0) {
      issues.push(issue(
        "research_study_registration_before_creation",
        target,
        `registeredAt cannot predate createdAt`,
      ));
    }
    if (study.registeredAt && study.informationCutoff && compare(
      study.informationCutoff,
      study.registeredAt,
      `${target}.informationCutoff`,
      `${target}.registeredAt`,
    ) > 0) {
      issues.push(issue(
        "research_study_future_information_at_registration",
        target,
        `informationCutoff cannot be later than registeredAt`,
      ));
    }
  }

  const studyById = new Map(snapshot.studies.map((record) => [record.id, record]));
  const caseIds = new Set(snapshot.cases.map((record) => record.id));
  const manifestById = new Map(snapshot.sampleManifests.map((record) => [record.id, record]));

  for (const manifest of snapshot.sampleManifests) {
    const target = `sample_manifest:${manifest.id}`;
    const study = studyById.get(manifest.studyId);
    if (!study) {
      issues.push(issue(
        "research_sample_manifest_unknown_study",
        target,
        `Study ${manifest.studyId} does not exist`,
      ));
    } else {
      if (manifest.role !== study.mode) {
        issues.push(issue(
          "research_sample_manifest_role_mismatch",
          target,
          `manifest role ${manifest.role} must match Study mode ${study.mode}`,
        ));
      }
      if (compare(
        manifest.createdAt,
        study.createdAt,
        `${target}.createdAt`,
        `study:${study.id}.createdAt`,
      ) < 0) {
        issues.push(issue(
          "research_sample_manifest_before_study",
          target,
          `manifest cannot be created before its Study`,
        ));
      }
    }
    if (compare(
      manifest.selectionCutoff,
      manifest.createdAt,
      `${target}.selectionCutoff`,
      `${target}.createdAt`,
    ) > 0) {
      issues.push(issue(
        "research_sample_manifest_future_selection_cutoff",
        target,
        `selectionCutoff cannot be later than manifest creation`,
      ));
    }

    const included = new Set(manifest.includedCaseIds);
    for (const caseId of manifest.includedCaseIds) {
      if (!caseIds.has(caseId)) {
        issues.push(issue(
          "research_sample_manifest_unknown_included_case",
          target,
          `included Case ${caseId} does not exist`,
        ));
      }
    }
    for (const excluded of manifest.excludedCases) {
      if (!caseIds.has(excluded.caseId)) {
        issues.push(issue(
          "research_sample_manifest_unknown_excluded_case",
          target,
          `excluded Case ${excluded.caseId} does not exist`,
        ));
      }
      if (included.has(excluded.caseId)) {
        issues.push(issue(
          "research_sample_manifest_case_overlap",
          target,
          `Case ${excluded.caseId} cannot be both included and excluded`,
        ));
      }
    }
  }

  for (const result of snapshot.studyResults) {
    const target = `study_result:${result.id}`;
    const study = studyById.get(result.studyId);
    const manifest = manifestById.get(result.sampleManifestId);
    if (!study) {
      issues.push(issue(
        "research_study_result_unknown_study",
        target,
        `Study ${result.studyId} does not exist`,
      ));
    }
    if (!manifest) {
      issues.push(issue(
        "research_study_result_unknown_manifest",
        target,
        `Sample Manifest ${result.sampleManifestId} does not exist`,
      ));
    }
    if (manifest && manifest.studyId !== result.studyId) {
      issues.push(issue(
        "research_study_result_manifest_study_mismatch",
        target,
        `Sample Manifest ${manifest.id} belongs to ${manifest.studyId}, not ${result.studyId}`,
      ));
    }
    if (study && compare(
      result.createdAt,
      study.createdAt,
      `${target}.createdAt`,
      `study:${study.id}.createdAt`,
    ) < 0) {
      issues.push(issue(
        "research_study_result_before_study",
        target,
        `StudyResult cannot predate Study creation`,
      ));
    }
    if (manifest && compare(
      result.createdAt,
      manifest.createdAt,
      `${target}.createdAt`,
      `sample_manifest:${manifest.id}.createdAt`,
    ) < 0) {
      issues.push(issue(
        "research_study_result_before_manifest",
        target,
        `StudyResult cannot predate its Sample Manifest`,
      ));
    }
  }

  for (const opportunity of snapshot.opportunities) {
    if (opportunity.informationCutoff && compare(
      opportunity.informationCutoff,
      opportunity.detectedAt,
      `opportunity:${opportunity.id}.informationCutoff`,
      `opportunity:${opportunity.id}.detectedAt`,
    ) > 0) {
      issues.push(issue(
        "research_opportunity_future_information_cutoff",
        `opportunity:${opportunity.id}`,
        `Opportunity informationCutoff cannot be later than detectedAt`,
      ));
    }
  }

  return issues;
}

function hasDirectedCycle(edges: readonly [string, string][]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const [from, to] of edges) {
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of adjacency.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

export function validateResearchKnowledgeSemantics(
  snapshot: ResearchKnowledgeSnapshot,
): ResearchKnowledgeIssue[] {
  return [
    ...validateOwnedIdUniqueness(snapshot),
    ...validateRelations(snapshot),
    ...validateLineages(snapshot),
    ...validateTemporalAndLifecycleSemantics(snapshot),
  ].sort((a, b) => `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`));
}

export function isResearchOwnedRelationNodeType(type: ResearchRelationNodeType): boolean {
  return INTERNAL_RELATION_NODE_TYPES.has(type);
}
