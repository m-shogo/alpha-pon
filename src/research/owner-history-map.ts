import type { ResearchKnowledgeIntegritySnapshot } from "./research-knowledge-integrity.js";
import type {
  ResearchComponentKind,
  ResearchComponentStatus,
  ResearchFamilyRecord,
  ResearchItemRecord,
  ResearchLineageType,
} from "./research-knowledge-types.js";
import type { HistoricalAnalog, ResearchState } from "./types.js";

export type OwnerHistoricalAnalogVerdict = NonNullable<HistoricalAnalog["outcome"]>["verdict"];

export interface OwnerHistoryMapFamilyMember {
  type: "research_item" | "edge";
  id: string;
  title: string;
  status: string;
}

export interface OwnerHistoryMapFamily {
  id: string;
  title: string;
  description: string;
  status: ResearchFamilyRecord["status"];
  members: OwnerHistoryMapFamilyMember[];
}

export interface OwnerHistoryMapAnalogMarketReaction {
  measuredAt: string;
  horizonDays: number;
  rawReturnBps: number;
  benchmarkReturnBps?: number;
  excessReturnBps?: number;
  benchmark?: string;
}

export interface OwnerHistoryMapAnalogCounterfactual {
  id: string;
  method: string;
  comparator: string;
  differenceBps?: number;
}

export interface OwnerHistoryMapAnalog {
  id: string;
  eventType: string;
  companyCode: string;
  companyName: string;
  eventDate: string;
  observedAt: string;
  sourceType: HistoricalAnalog["sourceType"];
  summary: string;
  edgeIds: string[];
  marketReaction: OwnerHistoryMapAnalogMarketReaction | null;
  outcome: {
    verdict: OwnerHistoricalAnalogVerdict;
    measuredAt: string;
    roiBps?: number;
  } | null;
  keyEvents: Array<{ date: string; label: string }>;
  counterfactuals: OwnerHistoryMapAnalogCounterfactual[];
  dataGaps: string[];
}

export interface OwnerHistoryMapCaseRelation {
  relationType: string;
  targetType: string;
  targetId: string;
  role?: string;
}

export interface OwnerHistoryMapCase {
  id: string;
  title: string;
  status: "open" | "closed" | "archived";
  summary: string;
  createdAt: string;
  episodeStart?: string;
  episodeEnd?: string;
  relations: OwnerHistoryMapCaseRelation[];
}

export interface OwnerHistoryMapComponent {
  id: string;
  title: string;
  kind: ResearchComponentKind;
  status: ResearchComponentStatus;
  description: string;
  edgeIds: string[];
}

export interface OwnerHistoryMapLineage {
  id: string;
  lineageType: ResearchLineageType;
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  targetType: string;
  targetId: string;
  targetTitle: string;
  decidedAt: string;
  reason: string;
}

export interface OwnerResearchHistoryMap {
  schemaVersion: 1;
  generatedAt: string;
  counts: {
    families: number;
    historicalAnalogs: number;
    resolvedOutcomes: number;
    unresolvedOutcomes: number;
    cases: number;
    researchComponents: number;
    lineages: number;
    studies: number;
    studyResults: number;
  };
  families: OwnerHistoryMapFamily[];
  historicalAnalogs: OwnerHistoryMapAnalog[];
  cases: OwnerHistoryMapCase[];
  researchComponents: OwnerHistoryMapComponent[];
  lineages: OwnerHistoryMapLineage[];
}

function familyMembers(
  familyId: string,
  snapshot: ResearchKnowledgeIntegritySnapshot,
  researchState: ResearchState,
): OwnerHistoryMapFamilyMember[] {
  const itemById = new Map<string, ResearchItemRecord>(
    snapshot.researchItems.map((item) => [item.id, item]),
  );
  const edgeById = new Map(researchState.edges.map((edge) => [edge.id, edge]));

  const members: OwnerHistoryMapFamilyMember[] = [];
  const seen = new Set<string>();

  for (const relation of snapshot.relations) {
    if (
      relation.relationType !== "member_of"
      || relation.targetType !== "research_family"
      || relation.targetId !== familyId
    ) {
      continue;
    }

    if (relation.sourceType === "research_item") {
      const item = itemById.get(relation.sourceId);
      if (!item) continue;
      const key = `research_item:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        type: "research_item",
        id: item.id,
        title: item.title,
        status: item.status,
      });
      continue;
    }

    if (relation.sourceType === "edge") {
      const edge = edgeById.get(relation.sourceId);
      if (!edge) continue;
      const key = `edge:${edge.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      members.push({
        type: "edge",
        id: edge.id,
        title: edge.title,
        status: edge.status,
      });
    }
  }

  return members.sort((left, right) => {
    if (left.type !== right.type) return left.type === "research_item" ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
}

function summarizeFamilies(
  snapshot: ResearchKnowledgeIntegritySnapshot,
  researchState: ResearchState,
): OwnerHistoryMapFamily[] {
  return snapshot.researchFamilies
    .map((family) => ({
      id: family.id,
      title: family.title,
      description: family.description,
      status: family.status,
      members: familyMembers(family.id, snapshot, researchState),
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

function summarizeAnalog(analog: HistoricalAnalog, researchState: ResearchState): OwnerHistoryMapAnalog {
  return {
    id: analog.id,
    eventType: analog.eventType,
    companyCode: analog.companyCode,
    companyName: analog.companyName,
    eventDate: analog.eventDate,
    observedAt: analog.observedAt,
    sourceType: analog.sourceType,
    summary: analog.summary,
    edgeIds: [...(analog.edgeIds ?? [])].sort(),
    marketReaction: analog.marketReaction
      ? {
          measuredAt: analog.marketReaction.measuredAt,
          horizonDays: analog.marketReaction.horizonDays,
          rawReturnBps: analog.marketReaction.rawReturnBps,
          ...(analog.marketReaction.benchmarkReturnBps !== undefined
            ? { benchmarkReturnBps: analog.marketReaction.benchmarkReturnBps }
            : {}),
          ...(analog.marketReaction.excessReturnBps !== undefined
            ? { excessReturnBps: analog.marketReaction.excessReturnBps }
            : {}),
          ...(analog.marketReaction.benchmark ? { benchmark: analog.marketReaction.benchmark } : {}),
        }
      : null,
    outcome: analog.outcome
      ? {
          verdict: analog.outcome.verdict,
          measuredAt: analog.outcome.measuredAt,
          ...(analog.outcome.roiBps !== undefined ? { roiBps: analog.outcome.roiBps } : {}),
        }
      : null,
    keyEvents: (analog.keyEvents ?? []).map((event) => ({ date: event.date, label: event.label })),
    counterfactuals: researchState.counterfactuals
      .filter((counterfactual) => counterfactual.analogId === analog.id)
      .map((counterfactual) => ({
        id: counterfactual.id,
        method: counterfactual.method,
        comparator: counterfactual.comparator,
        ...(counterfactual.differenceBps !== undefined ? { differenceBps: counterfactual.differenceBps } : {}),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    dataGaps: [...(analog.dataGaps ?? [])],
  };
}

function summarizeCases(snapshot: ResearchKnowledgeIntegritySnapshot): OwnerHistoryMapCase[] {
  return snapshot.cases
    .map((researchCase) => ({
      id: researchCase.id,
      title: researchCase.title,
      status: researchCase.status,
      summary: researchCase.summary,
      createdAt: researchCase.createdAt,
      ...(researchCase.episodeStart ? { episodeStart: researchCase.episodeStart } : {}),
      ...(researchCase.episodeEnd ? { episodeEnd: researchCase.episodeEnd } : {}),
      relations: snapshot.relations
        .filter((relation) => relation.sourceType === "case" && relation.sourceId === researchCase.id)
        .map((relation) => ({
          relationType: relation.relationType,
          targetType: relation.targetType,
          targetId: relation.targetId,
          ...(relation.role ? { role: relation.role } : {}),
        }))
        .sort((left, right) => `${left.relationType}:${left.targetType}:${left.targetId}`.localeCompare(`${right.relationType}:${right.targetType}:${right.targetId}`)),
    }))
    .sort((left, right) => (right.episodeStart ?? right.createdAt).localeCompare(left.episodeStart ?? left.createdAt));
}

function summarizeComponents(snapshot: ResearchKnowledgeIntegritySnapshot): OwnerHistoryMapComponent[] {
  return snapshot.researchComponents
    .map((component) => ({
      id: component.id,
      title: component.title,
      kind: component.kind,
      status: component.status,
      description: component.description,
      edgeIds: snapshot.relations
        .filter((relation) =>
          relation.sourceType === "research_component"
          && relation.sourceId === component.id
          && relation.relationType === "part_of"
          && relation.targetType === "edge",
        )
        .map((relation) => relation.targetId)
        .filter((edgeId, index, all) => all.indexOf(edgeId) === index)
        .sort(),
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

function nodeTitle(
  type: string,
  id: string,
  snapshot: ResearchKnowledgeIntegritySnapshot,
  researchState: ResearchState,
): string {
  if (type === "edge") return researchState.edges.find((edge) => edge.id === id)?.title ?? id;
  if (type === "research_item") return snapshot.researchItems.find((item) => item.id === id)?.title ?? id;
  if (type === "research_family") return snapshot.researchFamilies.find((family) => family.id === id)?.title ?? id;
  if (type === "research_component") return snapshot.researchComponents.find((component) => component.id === id)?.title ?? id;
  if (type === "case") return snapshot.cases.find((researchCase) => researchCase.id === id)?.title ?? id;
  if (type === "study") return snapshot.studies.find((study) => study.id === id)?.title ?? id;
  return id;
}

function summarizeLineages(
  snapshot: ResearchKnowledgeIntegritySnapshot,
  researchState: ResearchState,
): OwnerHistoryMapLineage[] {
  return snapshot.lineages
    .map((lineage) => ({
      id: lineage.id,
      lineageType: lineage.lineageType,
      sourceType: lineage.sourceType,
      sourceId: lineage.sourceId,
      sourceTitle: nodeTitle(lineage.sourceType, lineage.sourceId, snapshot, researchState),
      targetType: lineage.targetType,
      targetId: lineage.targetId,
      targetTitle: nodeTitle(lineage.targetType, lineage.targetId, snapshot, researchState),
      decidedAt: lineage.decidedAt,
      reason: lineage.reason,
    }))
    .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt));
}

export function buildOwnerResearchHistoryMap(input: {
  snapshot: ResearchKnowledgeIntegritySnapshot;
  researchState: ResearchState;
  generatedAt: string;
}): OwnerResearchHistoryMap {
  const { snapshot, researchState, generatedAt } = input;
  const historicalAnalogs = researchState.analogs
    .map((analog) => summarizeAnalog(analog, researchState))
    .sort((left, right) => {
      const date = right.eventDate.localeCompare(left.eventDate);
      return date !== 0 ? date : left.id.localeCompare(right.id);
    });

  const resolvedOutcomes = historicalAnalogs.filter(
    (analog) => analog.outcome && analog.outcome.verdict !== "unresolved",
  ).length;

  return {
    schemaVersion: 1,
    generatedAt,
    counts: {
      families: snapshot.researchFamilies.length,
      historicalAnalogs: historicalAnalogs.length,
      resolvedOutcomes,
      unresolvedOutcomes: historicalAnalogs.length - resolvedOutcomes,
      cases: snapshot.cases.length,
      researchComponents: snapshot.researchComponents.length,
      lineages: snapshot.lineages.length,
      studies: snapshot.studies.length,
      studyResults: snapshot.studyResults.length,
    },
    families: summarizeFamilies(snapshot, researchState),
    historicalAnalogs,
    cases: summarizeCases(snapshot),
    researchComponents: summarizeComponents(snapshot),
    lineages: summarizeLineages(snapshot, researchState),
  };
}
