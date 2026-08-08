import {
  computeOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewRecord,
} from "./outcome-semantic-review.js";
import {
  computeQuantitativeOutcomeHash,
  type QuantitativeOutcomeRecord,
} from "./quantitative-outcome.js";
import {
  computeRecommendationHash,
  type RecommendationRecord,
} from "./recommendation-persistence.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

export type OutcomeReviewDueStateKind =
  | "not_due"
  | "quantitative_due"
  | "semantic_review_due"
  | "human_confirmation_due"
  | "reviewed_current";

export type OutcomeReviewDueState = {
  recommendationId: string;
  recommendationContentHash: string;
  dueDate: string;
  asOfJstDate: string;
  state: OutcomeReviewDueStateKind;
  dueToday: boolean;
  overdue: boolean;
  daysPastDue: number;
  latestQuantitativeOutcomeId: string | null;
  latestQuantitativeOutcomeContentHash: string | null;
  latestSemanticReviewId: string | null;
  latestSemanticReviewContentHash: string | null;
  latestReviewAuthority: OutcomeSemanticReviewRecord["reviewAuthority"] | null;
  nextAction:
    | "wait_for_review_date"
    | "create_quantitative_outcome"
    | "create_semantic_review"
    | "request_human_confirmation"
    | "none";
};

export type OutcomeReviewDueSummary = {
  asOfJstDate: string;
  total: number;
  overdue: number;
  counts: Record<OutcomeReviewDueStateKind, number>;
  states: OutcomeReviewDueState[];
};

function jstDateOf(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("asOf must be a valid Date");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function daysBetweenDates(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

function reviewedAtMs(value: string, target: string): number {
  try {
    return parseExplicitIso8601Instant(value, target);
  } catch (error) {
    throw new Error(`invalid ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function latestByReviewedAt<T extends { reviewedAt: string }>(
  records: T[],
  tieBreaker: (record: T) => string,
  target: string,
): T | null {
  return [...records].sort((left, right) => {
    const timeDiff = reviewedAtMs(right.reviewedAt, `${target}.reviewedAt`)
      - reviewedAtMs(left.reviewedAt, `${target}.reviewedAt`);
    return timeDiff !== 0 ? timeDiff : tieBreaker(left).localeCompare(tieBreaker(right));
  })[0] ?? null;
}

function canonicalQuantitativeOutcomes(input: {
  recommendation: RecommendationRecord;
  records: QuantitativeOutcomeRecord[];
}): QuantitativeOutcomeRecord[] {
  const matches = input.records.filter((record) =>
    record.recommendationId === input.recommendation.recommendationId
    && record.recommendationContentHash === input.recommendation.contentHash,
  );
  for (const record of matches) {
    if (computeQuantitativeOutcomeHash(record) !== record.contentHash) {
      throw new Error(`invalid Quantitative Outcome contentHash: ${record.outcomeId}`);
    }
    reviewedAtMs(record.reviewedAt, `Quantitative Outcome ${record.outcomeId}.reviewedAt`);
  }
  return matches;
}

function canonicalSemanticReviews(input: {
  recommendation: RecommendationRecord;
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  records: OutcomeSemanticReviewRecord[];
}): OutcomeSemanticReviewRecord[] {
  const outcomeById = new Map(input.quantitativeOutcomes.map((record) => [record.outcomeId, record]));
  const matches = input.records.filter((record) =>
    record.recommendationId === input.recommendation.recommendationId
    && record.recommendationContentHash === input.recommendation.contentHash,
  );
  for (const record of matches) {
    if (computeOutcomeSemanticReviewHash(record) !== record.contentHash) {
      throw new Error(`invalid Semantic Review contentHash: ${record.reviewId}`);
    }
    reviewedAtMs(record.reviewedAt, `Semantic Review ${record.reviewId}.reviewedAt`);
    const outcome = outcomeById.get(record.quantitativeOutcomeId);
    if (
      !outcome
      || outcome.contentHash !== record.quantitativeOutcomeContentHash
    ) {
      throw new Error(`Semantic Review references unknown or mismatched Quantitative Outcome: ${record.reviewId}`);
    }
  }
  return matches;
}

function stateFor(input: {
  recommendation: RecommendationRecord;
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  semanticReviews: OutcomeSemanticReviewRecord[];
  asOfJstDate: string;
}): OutcomeReviewDueState {
  if (computeRecommendationHash(input.recommendation) !== input.recommendation.contentHash) {
    throw new Error(`invalid Recommendation contentHash: ${input.recommendation.recommendationId}`);
  }

  const quant = canonicalQuantitativeOutcomes({
    recommendation: input.recommendation,
    records: input.quantitativeOutcomes,
  });
  const reviews = canonicalSemanticReviews({
    recommendation: input.recommendation,
    quantitativeOutcomes: quant,
    records: input.semanticReviews,
  });
  const latestQuant = latestByReviewedAt(quant, (record) => record.outcomeId, "Quantitative Outcome");
  const reviewsForLatestQuant = latestQuant
    ? reviews.filter((record) =>
      record.quantitativeOutcomeId === latestQuant.outcomeId
      && record.quantitativeOutcomeContentHash === latestQuant.contentHash,
    )
    : [];
  const latestReviewForLatestQuant = latestByReviewedAt(
    reviewsForLatestQuant,
    (record) => record.reviewId,
    "Semantic Review",
  );

  const dueDate = input.recommendation.outcomeReviewDate;
  const dueToday = input.asOfJstDate === dueDate;
  const isPastDueDate = input.asOfJstDate > dueDate;
  let state: OutcomeReviewDueStateKind;
  let nextAction: OutcomeReviewDueState["nextAction"];

  if (latestReviewForLatestQuant?.reviewAuthority === "human_confirmed") {
    state = "reviewed_current";
    nextAction = "none";
  } else if (input.asOfJstDate < dueDate) {
    state = "not_due";
    nextAction = "wait_for_review_date";
  } else if (!latestQuant) {
    state = "quantitative_due";
    nextAction = "create_quantitative_outcome";
  } else if (!latestReviewForLatestQuant) {
    state = "semantic_review_due";
    nextAction = "create_semantic_review";
  } else {
    state = "human_confirmation_due";
    nextAction = "request_human_confirmation";
  }

  const overdue = isPastDueDate && state !== "reviewed_current";
  const daysPastDue = overdue ? Math.max(0, daysBetweenDates(dueDate, input.asOfJstDate)) : 0;

  return {
    recommendationId: input.recommendation.recommendationId,
    recommendationContentHash: input.recommendation.contentHash,
    dueDate,
    asOfJstDate: input.asOfJstDate,
    state,
    dueToday,
    overdue,
    daysPastDue,
    latestQuantitativeOutcomeId: latestQuant?.outcomeId ?? null,
    latestQuantitativeOutcomeContentHash: latestQuant?.contentHash ?? null,
    latestSemanticReviewId: latestReviewForLatestQuant?.reviewId ?? null,
    latestSemanticReviewContentHash: latestReviewForLatestQuant?.contentHash ?? null,
    latestReviewAuthority: latestReviewForLatestQuant?.reviewAuthority ?? null,
    nextAction,
  };
}

export function deriveOutcomeReviewDueState(input: {
  recommendation: RecommendationRecord;
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  semanticReviews: OutcomeSemanticReviewRecord[];
  asOf?: Date;
}): OutcomeReviewDueState {
  const asOf = input.asOf ?? new Date();
  return stateFor({
    recommendation: input.recommendation,
    quantitativeOutcomes: input.quantitativeOutcomes,
    semanticReviews: input.semanticReviews,
    asOfJstDate: jstDateOf(asOf),
  });
}

const STATE_PRIORITY: Record<OutcomeReviewDueStateKind, number> = {
  quantitative_due: 0,
  semantic_review_due: 1,
  human_confirmation_due: 2,
  not_due: 3,
  reviewed_current: 4,
};

export function deriveOutcomeReviewDueSummary(input: {
  recommendations: RecommendationRecord[];
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  semanticReviews: OutcomeSemanticReviewRecord[];
  asOf?: Date;
}): OutcomeReviewDueSummary {
  const asOf = input.asOf ?? new Date();
  const asOfJstDate = jstDateOf(asOf);
  const states = input.recommendations.map((recommendation) => stateFor({
    recommendation,
    quantitativeOutcomes: input.quantitativeOutcomes,
    semanticReviews: input.semanticReviews,
    asOfJstDate,
  })).sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    const stateDiff = STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state];
    if (stateDiff !== 0) return stateDiff;
    const dueDiff = left.dueDate.localeCompare(right.dueDate);
    return dueDiff !== 0 ? dueDiff : left.recommendationId.localeCompare(right.recommendationId);
  });

  const counts: Record<OutcomeReviewDueStateKind, number> = {
    not_due: 0,
    quantitative_due: 0,
    semantic_review_due: 0,
    human_confirmation_due: 0,
    reviewed_current: 0,
  };
  for (const state of states) counts[state.state] += 1;

  return {
    asOfJstDate,
    total: states.length,
    overdue: states.filter((state) => state.overdue).length,
    counts,
    states,
  };
}
