import type { ResearchKnowledgeIntegritySnapshot } from "./research-knowledge-integrity.js";
import type { ResearchFamilyRecord, ResearchItemRecord } from "./research-knowledge-types.js";
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

export interface OwnerHistoryMapAnalog {
  id: string;
  eventType: string;
  companyCode: string;
  companyName: string;
  eventDate: string;
  summary: string;
  edgeIds: string[];
  outcome: {
    verdict: OwnerHistoricalAnalogVerdict;
    measuredAt: string;
  } | null;
  dataGaps: string[];
}

export interface OwnerResearchHistoryMap {
  schemaVersion: 1;
  generatedAt: string;
  counts: {
    families: number;
    historicalAnalogs: number;
    resolvedOutcomes: number;
    unresolvedOutcomes: number;
  };
  families: OwnerHistoryMapFamily[];
  historicalAnalogs: OwnerHistoryMapAnalog[];
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

function summarizeAnalog(analog: HistoricalAnalog): OwnerHistoryMapAnalog {
  return {
    id: analog.id,
    eventType: analog.eventType,
    companyCode: analog.companyCode,
    companyName: analog.companyName,
    eventDate: analog.eventDate,
    summary: analog.summary,
    edgeIds: [...(analog.edgeIds ?? [])].sort(),
    outcome: analog.outcome
      ? {
          verdict: analog.outcome.verdict,
          measuredAt: analog.outcome.measuredAt,
        }
      : null,
    dataGaps: [...(analog.dataGaps ?? [])],
  };
}

export function buildOwnerResearchHistoryMap(input: {
  snapshot: ResearchKnowledgeIntegritySnapshot;
  researchState: ResearchState;
  generatedAt: string;
}): OwnerResearchHistoryMap {
  const { snapshot, researchState, generatedAt } = input;
  const historicalAnalogs = researchState.analogs
    .map(summarizeAnalog)
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
    },
    families: summarizeFamilies(snapshot, researchState),
    historicalAnalogs,
  };
}
