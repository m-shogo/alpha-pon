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
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";

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

function calendarDateUtcMs(value: string, target: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`invalid ${target}: expected YYYY-MM-DD, got ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    throw new Error(`invalid ${target}: non-Gregorian date ${value}`);
  }

  const utcMs = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcMs);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`invalid ${target}: non-Gregorian date ${value}`);
  }
  return utcMs;
}

function daysBetweenDates(from: string, to: string): number {
  const fromMs = calendarDateUtcMs(from, "outcomeReviewDate");
  const toMs = calendarDateUtcMs(to, "asOfJstDate");
  return Math.round((toMs - fromMs) / 86_400_000);
}

function reviewedAtMs(value: string, target: string): number {
  try {
    return parseExplicitIso8601Instant(value, target);
  } catch (error) {
    throw new Error(`invalid ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function compareReviewedAt(left: string, right: string, target: string): -1 | 0 | 1 {
  try {
    return compareExplicitIso8601Instants(
      left,
      right,
      `${target}.reviewedAt`,
      `${target}.reviewedAt`,
    );
  } catch (error) {
    throw new Error(`invalid ${target}.reviewedAt: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function availableByAsOf(value: string, asOfInstant: string, target: string): boolean {
  return compareExplicitIso8601Instants(
    value,
    asOfInstant,
    `${target}.reviewedAt`,
    "outcome review due asOf",
  ) <= 0;
}

function latestByReviewedAt<T extends { reviewedAt: string }>(
  records: T[],
  tieBreaker: (record: T) => string,
  target: string,
): T | null {
  return [...records].sort((left, right) => {
    const instantOrder = compareReviewedAt(right.reviewedAt, left.reviewedAt, target);
    return instantOrder !== 0 ? instantOrder : tieBreaker(left).localeCompare(tieBreaker(right));
  })[0] ?? null;
}

function canonicalQuantitativeOutcomes(input: {
  recommendation: RecommendationRecord;
  records: QuantitativeOutcomeRecord[];
  asOfInstant: string;
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
    if (record.measurementCutoff !== record.reviewedAt) {
      throw new Error(`Quantitative Outcome measurementCutoff must equal reviewedAt: ${record.outcomeId}`);
    }
  }
  const available = matches.filter((record) => availableByAsOf(
    record.reviewedAt,
    input.asOfInstant,
    `Quantitative Outcome ${record.outcomeId}`,
  ));

  const byId = new Map(available.map((record) => [record.outcomeId, record]));
  const roots = available.filter((record) => !record.supersedesOutcomeId);
  if (roots.length > 1) {
    throw new Error(`multiple Quantitative Outcome roots in outcome review queue: ${input.recommendation.recommendationId}`);
  }
  const childrenByParent = new Map<string, string[]>();
  for (const record of available) {
    if (!record.supersedesOutcomeId) continue;
    const prior = byId.get(record.supersedesOutcomeId);
    if (!prior) {
      throw new Error(`Quantitative Outcome revision references unavailable superseded outcome: ${record.outcomeId}`);
    }
    if (compareExplicitIso8601Instants(
      record.reviewedAt,
      prior.reviewedAt,
      `Quantitative Outcome ${record.outcomeId}.reviewedAt`,
      `Quantitative Outcome ${prior.outcomeId}.reviewedAt`,
    ) <= 0) {
      throw new Error(`Quantitative Outcome revision reviewedAt is not monotonic: ${record.outcomeId}`);
    }
    if (record.terminalTradingDate < prior.terminalTradingDate) {
      throw new Error(`Quantitative Outcome revision terminalTradingDate regressed: ${record.outcomeId}`);
    }
    if (prior.targetAssessment === "reached" && record.targetAssessment !== "reached") {
      throw new Error(`Quantitative Outcome revision targetAssessment regressed: ${record.outcomeId}`);
    }
    const children = childrenByParent.get(record.supersedesOutcomeId) ?? [];
    children.push(record.outcomeId);
    childrenByParent.set(record.supersedesOutcomeId, children);
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      throw new Error(`Quantitative Outcome revision fork in outcome review queue: ${parentId}`);
    }
  }

  return available;
}

function canonicalSemanticReviews(input: {
  recommendation: RecommendationRecord;
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  records: OutcomeSemanticReviewRecord[];
  asOfInstant: string;
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
    if (compareExplicitIso8601Instants(
      record.evidenceCutoff,
      record.reviewedAt,
      `Semantic Review ${record.reviewId}.evidenceCutoff`,
      `Semantic Review ${record.reviewId}.reviewedAt`,
    ) > 0) {
      throw new Error(`Semantic Review evidenceCutoff is after reviewedAt: ${record.reviewId}`);
    }
  }
  const available = matches.filter((record) => availableByAsOf(
    record.reviewedAt,
    input.asOfInstant,
    `Semantic Review ${record.reviewId}`,
  ));
  for (const record of available) {
    const outcome = outcomeById.get(record.quantitativeOutcomeId);
    if (
      !outcome
      || outcome.contentHash !== record.quantitativeOutcomeContentHash
    ) {
      throw new Error(`Semantic Review references unknown or mismatched Quantitative Outcome: ${record.reviewId}`);
    }
    if (compareExplicitIso8601Instants(
      record.evidenceCutoff,
      outcome.reviewedAt,
      `Semantic Review ${record.reviewId}.evidenceCutoff`,
      `Quantitative Outcome ${outcome.outcomeId}.reviewedAt`,
    ) < 0) {
      throw new Error(`Semantic Review evidenceCutoff is before Quantitative Outcome reviewedAt: ${record.reviewId}`);
    }
  }

  const byId = new Map(available.map((record) => [record.reviewId, record]));
  const roots = available.filter((record) => !record.supersedesReviewId);
  if (roots.length > 1) {
    throw new Error(`multiple Semantic Review roots in outcome review queue: ${input.recommendation.recommendationId}`);
  }
  const childrenByParent = new Map<string, string[]>();
  for (const record of available) {
    if (!record.supersedesReviewId) continue;
    const prior = byId.get(record.supersedesReviewId);
    if (!prior) {
      throw new Error(`Semantic Review revision references unavailable superseded review: ${record.reviewId}`);
    }
    if (compareExplicitIso8601Instants(
      record.reviewedAt,
      prior.reviewedAt,
      `Semantic Review ${record.reviewId}.reviewedAt`,
      `Semantic Review ${prior.reviewId}.reviewedAt`,
    ) <= 0) {
      throw new Error(`Semantic Review revision reviewedAt is not monotonic: ${record.reviewId}`);
    }
    if (compareExplicitIso8601Instants(
      record.evidenceCutoff,
      prior.evidenceCutoff,
      `Semantic Review ${record.reviewId}.evidenceCutoff`,
      `Semantic Review ${prior.reviewId}.evidenceCutoff`,
    ) < 0) {
      throw new Error(`Semantic Review revision evidenceCutoff regressed: ${record.reviewId}`);
    }
    if (prior.reviewAuthority === "human_confirmed" && record.reviewAuthority !== "human_confirmed") {
      throw new Error(`Semantic Review revision authority regressed: ${record.reviewId}`);
    }
    const priorOutcome = outcomeById.get(prior.quantitativeOutcomeId);
    const currentOutcome = outcomeById.get(record.quantitativeOutcomeId);
    if (priorOutcome && currentOutcome && compareExplicitIso8601Instants(
      currentOutcome.reviewedAt,
      priorOutcome.reviewedAt,
      `Quantitative Outcome ${currentOutcome.outcomeId}.reviewedAt`,
      `Quantitative Outcome ${priorOutcome.outcomeId}.reviewedAt`,
    ) < 0) {
      throw new Error(`Semantic Review revision quantitative outcome regressed: ${record.reviewId}`);
    }
    const children = childrenByParent.get(record.supersedesReviewId) ?? [];
    children.push(record.reviewId);
    childrenByParent.set(record.supersedesReviewId, children);
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      throw new Error(`Semantic Review revision fork in outcome review queue: ${parentId}`);
    }
  }

  return available;
}

function stateFor(input: {
  recommendation: RecommendationRecord;
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  semanticReviews: OutcomeSemanticReviewRecord[];
  asOfJstDate: string;
  asOfInstant: string;
}): OutcomeReviewDueState {
  if (computeRecommendationHash(input.recommendation) !== input.recommendation.contentHash) {
    throw new Error(`invalid Recommendation contentHash: ${input.recommendation.recommendationId}`);
  }

  const dueDate = input.recommendation.outcomeReviewDate;
  calendarDateUtcMs(dueDate, "outcomeReviewDate");
  calendarDateUtcMs(input.asOfJstDate, "asOfJstDate");

  const quant = canonicalQuantitativeOutcomes({
    recommendation: input.recommendation,
    records: input.quantitativeOutcomes,
    asOfInstant: input.asOfInstant,
  });
  const reviews = canonicalSemanticReviews({
    recommendation: input.recommendation,
    quantitativeOutcomes: quant,
    records: input.semanticReviews,
    asOfInstant: input.asOfInstant,
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
  const asOfJstDate = jstDateOf(asOf);
  return stateFor({
    recommendation: input.recommendation,
    quantitativeOutcomes: input.quantitativeOutcomes,
    semanticReviews: input.semanticReviews,
    asOfJstDate,
    asOfInstant: asOf.toISOString(),
  });
}

const STATE_PRIORITY: Record<OutcomeReviewDueStateKind, number> = {
  quantitative_due: 0,
  semantic_review_due: 1,
  human_confirmation_due: 2,
  not_due: 3,
  reviewed_current: 4,
};

function canonicalRecommendationCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\.T$/, "");
  return normalized.length === 5 && normalized.endsWith("0")
    ? normalized.slice(0, -1)
    : normalized;
}

function terminalRecommendations(
  records: readonly RecommendationRecord[],
  asOfInstant: string,
): RecommendationRecord[] {
  const available = records.filter((record) => compareExplicitIso8601Instants(
    record.issuedAt,
    asOfInstant,
    `Recommendation ${record.recommendationId}.issuedAt`,
    "outcome review due asOf",
  ) <= 0);
  const byId = new Map(available.map((record) => [record.recommendationId, record]));
  const childrenByParent = new Map<string, string[]>();

  for (const record of available) {
    if (!record.supersedesId) continue;
    const prior = byId.get(record.supersedesId);
    if (!prior) {
      throw new Error(`Recommendation revision references unavailable superseded record: ${record.recommendationId}`);
    }
    if (
      canonicalRecommendationCode(prior.code) !== canonicalRecommendationCode(record.code)
      || prior.companyName !== record.companyName
    ) {
      throw new Error(`Recommendation revision identity mismatch: ${record.recommendationId}`);
    }
    if (compareExplicitIso8601Instants(
      record.issuedAt,
      prior.issuedAt,
      `Recommendation ${record.recommendationId}.issuedAt`,
      `Recommendation ${prior.recommendationId}.issuedAt`,
    ) <= 0) {
      throw new Error(`Recommendation revision issuedAt is not monotonic: ${record.recommendationId}`);
    }
    if (compareExplicitIso8601Instants(
      record.informationCutoff,
      prior.informationCutoff,
      `Recommendation ${record.recommendationId}.informationCutoff`,
      `Recommendation ${prior.recommendationId}.informationCutoff`,
    ) < 0) {
      throw new Error(`Recommendation revision informationCutoff regressed: ${record.recommendationId}`);
    }
    const children = childrenByParent.get(record.supersedesId) ?? [];
    children.push(record.recommendationId);
    childrenByParent.set(record.supersedesId, children);
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      throw new Error(`Recommendation revision fork in outcome review queue: ${parentId}`);
    }
  }

  const supersededIds = new Set(childrenByParent.keys());
  return available.filter((record) => !supersededIds.has(record.recommendationId));
}

export function deriveOutcomeReviewDueSummary(input: {
  recommendations: RecommendationRecord[];
  quantitativeOutcomes: QuantitativeOutcomeRecord[];
  semanticReviews: OutcomeSemanticReviewRecord[];
  asOf?: Date;
}): OutcomeReviewDueSummary {
  const asOf = input.asOf ?? new Date();
  const asOfJstDate = jstDateOf(asOf);
  const asOfInstant = asOf.toISOString();
  const currentRecommendations = terminalRecommendations(input.recommendations, asOfInstant);
  const states = currentRecommendations.map((recommendation) => stateFor({
    recommendation,
    quantitativeOutcomes: input.quantitativeOutcomes,
    semanticReviews: input.semanticReviews,
    asOfJstDate,
    asOfInstant,
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
