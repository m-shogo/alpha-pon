import type { ResearchKnowledgeIntegritySnapshot } from "./research-knowledge-integrity.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import type {
  ResearchFamilyRecord,
  ResearchItemRecord,
  ResearchItemStatus,
  ResearchQuestionRecord,
  ResearchQuestionStatus,
} from "./research-knowledge-types.js";

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
  };
  researchItems: OwnerResearchItemSummary[];
}

const ACTIVE_ITEM_STATUSES = new Set<ResearchItemStatus>([
  "captured",
  "triage",
  "investigating",
  "synthesized",
]);

const ITEM_STATUS_RANK: Record<ResearchItemStatus, number> = {
  investigating: 0,
  triage: 1,
  captured: 2,
  synthesized: 3,
  parked: 4,
  resolved: 5,
  archived: 6,
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

export function buildOwnerResearchSummary(input: {
  snapshot: ResearchKnowledgeIntegritySnapshot;
  issues: readonly ResearchKnowledgeIssue[];
  generatedAt: string;
}): OwnerResearchSummary {
  const { snapshot, issues, generatedAt } = input;
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

  const unresolvedQuestions = snapshot.researchQuestions.filter(
    (question) => question.status !== "answered" && question.status !== "obsolete",
  ).length;

  const latestResearchAt = latestTimestamp([
    ...snapshot.researchItems.flatMap((item) => [item.createdAt, item.lastReviewedAt]),
    ...snapshot.researchQuestions.flatMap((question) => [question.createdAt, question.lastReviewedAt]),
    ...snapshot.researchFamilies.map((family) => family.createdAt),
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
    },
    researchItems,
  };
}
