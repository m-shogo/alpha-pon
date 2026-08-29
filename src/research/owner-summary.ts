import type { ResearchKnowledgeIntegritySnapshot } from "./research-knowledge-integrity.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import type {
  ResearchFamilyRecord,
  ResearchItemRecord,
  ResearchItemStatus,
  ResearchQuestionRecord,
  ResearchQuestionStatus,
} from "./research-knowledge-types.js";
import {
  GATE_KEYS,
  type Checkpoint,
  type Edge,
  type EdgeStatus,
  type GateKey,
  type GateState,
  type ResearchLogEntry,
  type ResearchState,
} from "./types.js";

export interface OwnerResearchQuestionSummary {
  id: string;
  question: string;
  status: ResearchQuestionStatus;
  createdAt: string;
  lastReviewedAt?: string;
}

export interface OwnerResearchFamilySummary {
  id: string;
  title: string;
}

export interface OwnerResearchItemSummary {
  id: string;
  title: string;
  status: ResearchItemStatus;
  origin: ResearchItemRecord["origin"];
  summary: string;
  createdAt: string;
  lastReviewedAt?: string;
  families: OwnerResearchFamilySummary[];
  questions: OwnerResearchQuestionSummary[];
}

export interface OwnerEdgeGateGap {
  key: GateKey;
  state: GateState;
  explanation: string | null;
}

export interface OwnerFormalEdgeSummary {
  id: string;
  title: string;
  status: EdgeStatus;
  priority: Edge["priority"];
  confidence: number;
  hypothesis: string;
  lastUpdate: string;
  samples: {
    current: number;
    required: number;
    analogCurrent: number;
    analogRequired: number;
  };
  gate: {
    pass: number;
    fail: number;
    unknown: number;
    total: number;
  };
  verificationGaps: OwnerEdgeGateGap[];
  requiredData: string[];
}

export interface OwnerResearchTimelineEntry {
  id: string;
  at: string;
  type: ResearchLogEntry["type"];
  edgeId?: string;
  summary: string;
  findings: string[];
  dataGaps: string[];
  nextActions: string[];
}

export interface OwnerResearchCheckpointSummary {
  sequence: number;
  savedAt: string;
  researchedEdgeId?: string;
  researchDone: string;
  dataGaps: string[];
  nextCandidates: Array<{ edgeId: string; why: string }>;
  openQuestions: string[];
}

export interface OwnerResearchSummary {
  schemaVersion: 1;
  generatedAt: string;
  latestResearchAt: string | null;
  integrity: {
    status: "ok" | "attention";
    issueCount: number;
  };
  counts: {
    researchItems: number;
    activeResearchItems: number;
    unresolvedQuestions: number;
    researchFamilies: number;
    formalEdges: number;
    activeFormalEdges: number;
  };
  researchItems: OwnerResearchItemSummary[];
  formalEdges: OwnerFormalEdgeSummary[];
  timeline: OwnerResearchTimelineEntry[];
  checkpoint: OwnerResearchCheckpointSummary | null;
}

const ACTIVE_ITEM_STATUSES = new Set<ResearchItemStatus>([
  "captured",
  "triage",
  "investigating",
  "synthesized",
]);

const ACTIVE_EDGE_STATUSES = new Set<EdgeStatus>(["research", "shadow", "production"]);

const ITEM_STATUS_RANK: Record<ResearchItemStatus, number> = {
  investigating: 0,
  triage: 1,
  captured: 2,
  synthesized: 3,
  parked: 4,
  resolved: 5,
  archived: 6,
};

const EDGE_STATUS_RANK: Record<EdgeStatus, number> = {
  research: 0,
  shadow: 1,
  production: 2,
  idea: 3,
  deprecated: 4,
  rejected: 5,
};

const QUESTION_STATUS_RANK: Record<ResearchQuestionStatus, number> = {
  open: 0,
  partially_answered: 1,
  blocked: 2,
  answered: 3,
  obsolete: 4,
};

function compareNewest(left: string, right: string): number {
  return right.localeCompare(left);
}

function latestTimestamp(values: Array<string | undefined>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.sort(compareNewest)[0] ?? null;
}

function familySummariesForItem(
  itemId: string,
  snapshot: ResearchKnowledgeIntegritySnapshot,
  familyById: Map<string, ResearchFamilyRecord>,
): OwnerResearchFamilySummary[] {
  const familyIds = snapshot.relations
    .filter((relation) =>
      relation.relationType === "member_of"
      && relation.sourceType === "research_item"
      && relation.sourceId === itemId
      && relation.targetType === "research_family",
    )
    .map((relation) => relation.targetId);

  return [...new Set(familyIds)]
    .map((familyId) => familyById.get(familyId))
    .filter((family): family is ResearchFamilyRecord => Boolean(family))
    .map((family) => ({ id: family.id, title: family.title }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

function questionSummariesForItem(
  itemId: string,
  snapshot: ResearchKnowledgeIntegritySnapshot,
  questionById: Map<string, ResearchQuestionRecord>,
): OwnerResearchQuestionSummary[] {
  const questionIds = snapshot.relations
    .filter((relation) =>
      relation.relationType === "addresses"
      && relation.sourceType === "research_question"
      && relation.targetType === "research_item"
      && relation.targetId === itemId,
    )
    .map((relation) => relation.sourceId);

  return [...new Set(questionIds)]
    .map((questionId) => questionById.get(questionId))
    .filter((question): question is ResearchQuestionRecord => Boolean(question))
    .map((question) => ({
      id: question.id,
      question: question.question,
      status: question.status,
      createdAt: question.createdAt,
      ...(question.lastReviewedAt ? { lastReviewedAt: question.lastReviewedAt } : {}),
    }))
    .sort((left, right) => {
      const rank = QUESTION_STATUS_RANK[left.status] - QUESTION_STATUS_RANK[right.status];
      return rank !== 0 ? rank : compareNewest(left.lastReviewedAt ?? left.createdAt, right.lastReviewedAt ?? right.createdAt);
    });
}

function summarizeFormalEdge(edge: Edge, state: ResearchState): OwnerFormalEdgeSummary {
  const gateStates = GATE_KEYS.map((key) => ({ key, item: edge.promotionGate[key] }));
  const gate = gateStates.reduce(
    (counts, entry) => {
      counts[entry.item.state] += 1;
      return counts;
    },
    { pass: 0, fail: 0, unknown: 0, total: GATE_KEYS.length },
  );

  return {
    id: edge.id,
    title: edge.title,
    status: edge.status,
    priority: edge.priority,
    confidence: edge.confidence,
    hypothesis: edge.hypothesis,
    lastUpdate: edge.lastUpdate,
    samples: {
      current: edge.samples.current,
      required: edge.samples.required,
      analogCurrent: state.analogs.filter((analog) => analog.edgeIds?.includes(edge.id)).length,
      analogRequired: edge.samples.requiredAnalogs,
    },
    gate,
    verificationGaps: gateStates
      .filter((entry) => entry.item.state !== "pass")
      .map((entry) => ({
        key: entry.key,
        state: entry.item.state,
        explanation: entry.item.evidence?.trim() || null,
      })),
    requiredData: [...edge.requiredData],
  };
}

function summarizeTimeline(entries: readonly ResearchLogEntry[]): OwnerResearchTimelineEntry[] {
  return [...entries]
    .sort((left, right) => compareNewest(left.at, right.at))
    .slice(0, 12)
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      type: entry.type,
      ...(entry.edgeId ? { edgeId: entry.edgeId } : {}),
      summary: entry.summary,
      findings: [...(entry.findings ?? [])],
      dataGaps: [...(entry.dataGaps ?? [])],
      nextActions: [...(entry.nextActions ?? [])],
    }));
}

function summarizeCheckpoint(checkpoint: Checkpoint | null): OwnerResearchCheckpointSummary | null {
  if (!checkpoint) return null;
  return {
    sequence: checkpoint.sequence,
    savedAt: checkpoint.savedAt,
    ...(checkpoint.researchedEdgeId ? { researchedEdgeId: checkpoint.researchedEdgeId } : {}),
    researchDone: checkpoint.researchDone,
    dataGaps: [...checkpoint.dataGaps],
    nextCandidates: checkpoint.nextCandidates.map((candidate) => ({ ...candidate })),
    openQuestions: [...(checkpoint.openQuestions ?? [])],
  };
}

export function buildOwnerResearchSummary(input: {
  snapshot: ResearchKnowledgeIntegritySnapshot;
  issues: readonly ResearchKnowledgeIssue[];
  researchState: ResearchState;
  researchLog: readonly ResearchLogEntry[];
  generatedAt: string;
}): OwnerResearchSummary {
  const { snapshot, issues, researchState, researchLog, generatedAt } = input;
  const familyById = new Map(snapshot.researchFamilies.map((family) => [family.id, family]));
  const questionById = new Map(snapshot.researchQuestions.map((question) => [question.id, question]));

  const researchItems = snapshot.researchItems
    .map((item): OwnerResearchItemSummary => ({
      id: item.id,
      title: item.title,
      status: item.status,
      origin: item.origin,
      summary: item.summary,
      createdAt: item.createdAt,
      ...(item.lastReviewedAt ? { lastReviewedAt: item.lastReviewedAt } : {}),
      families: familySummariesForItem(item.id, snapshot, familyById),
      questions: questionSummariesForItem(item.id, snapshot, questionById),
    }))
    .sort((left, right) => {
      const rank = ITEM_STATUS_RANK[left.status] - ITEM_STATUS_RANK[right.status];
      return rank !== 0 ? rank : compareNewest(left.lastReviewedAt ?? left.createdAt, right.lastReviewedAt ?? right.createdAt);
    });

  const formalEdges = researchState.edges
    .map((edge) => summarizeFormalEdge(edge, researchState))
    .sort((left, right) => {
      const rank = EDGE_STATUS_RANK[left.status] - EDGE_STATUS_RANK[right.status];
      if (rank !== 0) return rank;
      if (left.priority !== right.priority) return left.priority.localeCompare(right.priority);
      return left.title.localeCompare(right.title);
    });

  const timeline = summarizeTimeline(researchLog);
  const checkpoint = summarizeCheckpoint(researchState.checkpoint);

  const unresolvedQuestions = snapshot.researchQuestions.filter(
    (question) => question.status !== "answered" && question.status !== "obsolete",
  ).length;

  const latestResearchAt = latestTimestamp([
    ...snapshot.researchItems.flatMap((item) => [item.createdAt, item.lastReviewedAt]),
    ...snapshot.researchQuestions.flatMap((question) => [question.createdAt, question.lastReviewedAt]),
    ...snapshot.researchFamilies.map((family) => family.createdAt),
    ...researchLog.map((entry) => entry.at),
    researchState.checkpoint?.savedAt,
  ]);

  return {
    schemaVersion: 1,
    generatedAt,
    latestResearchAt,
    integrity: {
      status: issues.length === 0 ? "ok" : "attention",
      issueCount: issues.length,
    },
    counts: {
      researchItems: snapshot.researchItems.length,
      activeResearchItems: snapshot.researchItems.filter((item) => ACTIVE_ITEM_STATUSES.has(item.status)).length,
      unresolvedQuestions,
      researchFamilies: snapshot.researchFamilies.length,
      formalEdges: researchState.edges.length,
      activeFormalEdges: researchState.edges.filter((edge) => ACTIVE_EDGE_STATUSES.has(edge.status)).length,
    },
    researchItems,
    formalEdges,
    timeline,
    checkpoint,
  };
}
