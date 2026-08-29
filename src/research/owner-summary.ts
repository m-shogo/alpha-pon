import type { Issue } from "./edge-registry.js";
import { evaluateGate, type HoldoutAccessEntry } from "./promotion.js";
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
  hypothesisPreview: string;
  lastUpdate: string;
  lastResearchAt: string | null;
  knownFindings: string[];
  nextActions: string[];
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
  rejectionReason?: string;
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

export interface OwnerResearchOverview {
  asOf: string;
  edgeStatus: {
    research: number;
    shadow: number;
    production: number;
    idea: number;
    rejected: number;
    deprecated: number;
  };
  recent7d: {
    from: string;
    to: string;
    edgesAdded: number;
    analogsAdded: number;
    currentFormalSamples: number;
    sampleDelta: null;
    sampleDeltaReason: string;
  };
  readiness: {
    promotionReadyEdgeIds: string[];
    holdoutReadyEdgeIds: string[];
  };
}

export interface OwnerResearchSummary {
  schemaVersion: 1;
  generatedAt: string;
  latestResearchAt: string | null;
  integrity: {
    status: "ok" | "attention";
    issueCount: number;
    errorCount: number;
    warningCount: number;
    knowledgeIssueCount: number;
  };
  counts: {
    researchItems: number;
    activeResearchItems: number;
    unresolvedQuestions: number;
    researchFamilies: number;
    formalEdges: number;
    activeFormalEdges: number;
  };
  overview: OwnerResearchOverview;
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

const DAY_MS = 86_400_000;

function compareNewest(left: string, right: string): number {
  return right.localeCompare(left);
}

function latestTimestamp(values: Array<string | undefined>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.sort(compareNewest)[0] ?? null;
}

function dateEpoch(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const check = new Date(epoch);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return epoch;
}

function epochDate(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

function isWithinWindow(value: string, fromEpoch: number, toEpoch: number): boolean {
  const epoch = dateEpoch(value);
  return epoch !== null && epoch >= fromEpoch && epoch <= toEpoch;
}

function uniqueStrings(values: readonly string[], limit = 5): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function hypothesisPreview(text: string): string {
  const parts = text.match(/[^。！？!?]+[。！？!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text.trim()];
  const preview = parts.slice(0, 2).join("");
  return preview.length <= 260 ? preview : `${preview.slice(0, 259)}…`;
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

function summarizeFormalEdge(
  edge: Edge,
  state: ResearchState,
  researchLog: readonly ResearchLogEntry[],
): OwnerFormalEdgeSummary {
  const gateStates = GATE_KEYS.map((key) => ({ key, item: edge.promotionGate[key] }));
  const gate = gateStates.reduce(
    (counts, entry) => {
      counts[entry.item.state] += 1;
      return counts;
    },
    { pass: 0, fail: 0, unknown: 0, total: GATE_KEYS.length },
  );
  const edgeLogs = researchLog
    .filter((entry) => entry.edgeId === edge.id)
    .sort((left, right) => compareNewest(left.at, right.at));

  return {
    id: edge.id,
    title: edge.title,
    status: edge.status,
    priority: edge.priority,
    confidence: edge.confidence,
    hypothesis: edge.hypothesis,
    hypothesisPreview: hypothesisPreview(edge.hypothesis),
    lastUpdate: edge.lastUpdate,
    lastResearchAt: edgeLogs[0]?.at ?? null,
    knownFindings: uniqueStrings(edgeLogs.flatMap((entry) => entry.findings ?? [])),
    nextActions: uniqueStrings(edgeLogs.flatMap((entry) => entry.nextActions ?? [])),
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
      ...(entry.rejectionReason ? { rejectionReason: entry.rejectionReason } : {}),
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

function buildOverview(input: {
  researchState: ResearchState;
  accessLog: HoldoutAccessEntry[];
  asOf: string;
}): OwnerResearchOverview {
  const { researchState, accessLog, asOf } = input;
  const toEpoch = dateEpoch(asOf);
  if (toEpoch === null) throw new Error(`Owner Research Summary asOf must be YYYY-MM-DD: ${asOf}`);
  const fromEpoch = toEpoch - 6 * DAY_MS;
  const evaluations = new Map(
    researchState.edges.map((edge) => [edge.id, evaluateGate(edge, researchState, accessLog, asOf)]),
  );

  const promotionReadyEdgeIds = researchState.edges
    .filter((edge) => edge.status === "shadow" && evaluations.get(edge.id)?.promotable)
    .map((edge) => edge.id)
    .sort();

  const holdoutReadyEdgeIds = researchState.edges
    .filter((edge) => {
      if (edge.status === "production" || edge.status === "rejected" || edge.status === "deprecated") return false;
      const evaluation = evaluations.get(edge.id);
      if (!evaluation || evaluation.unsupportedPasses.length > 0) return false;
      const remaining = evaluation.blockers.filter((blocker) => blocker.gate !== "holdoutPass");
      return edge.promotionGate.holdoutPass.state !== "pass" && remaining.length === 0;
    })
    .map((edge) => edge.id)
    .sort();

  const countStatus = (status: EdgeStatus) => researchState.edges.filter((edge) => edge.status === status).length;

  return {
    asOf,
    edgeStatus: {
      research: countStatus("research"),
      shadow: countStatus("shadow"),
      production: countStatus("production"),
      idea: countStatus("idea"),
      rejected: countStatus("rejected"),
      deprecated: countStatus("deprecated"),
    },
    recent7d: {
      from: epochDate(fromEpoch),
      to: asOf,
      edgesAdded: researchState.edges.filter((edge) => isWithinWindow(edge.createdAt, fromEpoch, toEpoch)).length,
      analogsAdded: researchState.analogs.filter((analog) => isWithinWindow(analog.recordedAt, fromEpoch, toEpoch)).length,
      currentFormalSamples: researchState.edges.reduce((sum, edge) => sum + edge.samples.current, 0),
      sampleDelta: null,
      sampleDeltaReason: "Formal sample current はスナップショット値のみで追加日時を保持していないため、直近7日増分は算出しません。",
    },
    readiness: {
      promotionReadyEdgeIds,
      holdoutReadyEdgeIds,
    },
  };
}

export function buildOwnerResearchSummary(input: {
  snapshot: ResearchKnowledgeIntegritySnapshot;
  issues: readonly ResearchKnowledgeIssue[];
  researchOsIssues: readonly Issue[];
  researchState: ResearchState;
  researchLog: readonly ResearchLogEntry[];
  accessLog: HoldoutAccessEntry[];
  asOf: string;
  generatedAt: string;
}): OwnerResearchSummary {
  const {
    snapshot,
    issues,
    researchOsIssues,
    researchState,
    researchLog,
    accessLog,
    asOf,
    generatedAt,
  } = input;
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
    .map((edge) => summarizeFormalEdge(edge, researchState, researchLog))
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

  const knowledgeIssueCount = issues.length;
  const researchErrorCount = researchOsIssues.filter((issue) => issue.severity === "error").length;
  const researchWarningCount = researchOsIssues.filter((issue) => issue.severity === "warning").length;
  const errorCount = knowledgeIssueCount + researchErrorCount;
  const warningCount = researchWarningCount;

  return {
    schemaVersion: 1,
    generatedAt,
    latestResearchAt,
    integrity: {
      status: errorCount + warningCount === 0 ? "ok" : "attention",
      issueCount: errorCount + warningCount,
      errorCount,
      warningCount,
      knowledgeIssueCount,
    },
    counts: {
      researchItems: snapshot.researchItems.length,
      activeResearchItems: snapshot.researchItems.filter((item) => ACTIVE_ITEM_STATUSES.has(item.status)).length,
      unresolvedQuestions,
      researchFamilies: snapshot.researchFamilies.length,
      formalEdges: researchState.edges.length,
      activeFormalEdges: researchState.edges.filter((edge) => ACTIVE_EDGE_STATUSES.has(edge.status)).length,
    },
    overview: buildOverview({ researchState, accessLog, asOf }),
    researchItems,
    formalEdges,
    timeline,
    checkpoint,
  };
}
