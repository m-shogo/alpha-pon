import { MARKET_LESSONS, type LessonMatch, type MarketLesson } from "./market-lessons.js";
import { EXTRA_MARKET_LESSONS } from "./market-lessons-extra.js";
import { CRISIS_MARKET_LESSONS } from "./market-lessons-crisis.js";
import type { Candidate, ScoreResult } from "../types.js";

const ALL_MARKET_LESSONS: MarketLesson[] = [
  ...MARKET_LESSONS,
  ...EXTRA_MARKET_LESSONS,
  ...CRISIS_MARKET_LESSONS,
];

type LessonInput = {
  candidate: Candidate;
  textParts?: string[];
};

function buildSearchText(input: LessonInput): string {
  return [
    input.candidate.name,
    ...input.candidate.tags,
    ...input.candidate.rules,
    ...(input.textParts ?? []),
  ].join(" ").toLowerCase();
}

function uniqueByLesson(matches: LessonMatch[]): LessonMatch[] {
  const seen = new Set<string>();
  const result: LessonMatch[] = [];

  for (const match of matches) {
    if (seen.has(match.lesson.id)) continue;
    seen.add(match.lesson.id);
    result.push(match);
  }

  return result;
}

export function findRelatedMarketLessons(input: LessonInput, limit = 3): LessonMatch[] {
  const tags = new Set(input.candidate.tags.map(tag => tag.toLowerCase()));
  const text = buildSearchText(input);

  const matches = ALL_MARKET_LESSONS
    .map(lesson => {
      const matchedTags = lesson.affectedTags.filter(tag => tags.has(tag.toLowerCase()) || text.includes(tag.toLowerCase()));
      const titleHit = text.includes(lesson.title.toLowerCase()) ? 1 : 0;
      const categoryHit = text.includes(lesson.category.toLowerCase()) ? 1 : 0;
      const summaryHits = lesson.affectedTags.filter(tag => text.includes(tag.toLowerCase())).length;
      const score = matchedTags.length * 12 + titleHit * 15 + categoryHit * 10 + summaryHits * 4;
      const why = [
        ...matchedTags.map(tag => `tag:${tag}`),
        ...(titleHit ? ["title similarity"] : []),
        ...(categoryHit ? ["category similarity"] : []),
      ];
      return { lesson, matchedTags, score, why } satisfies LessonMatch;
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);

  return uniqueByLesson(matches).slice(0, limit);
}

export function findRelatedMarketLessonsForScore(result: ScoreResult, limit = 3): LessonMatch[] {
  return findRelatedMarketLessons({
    candidate: result.candidate,
    textParts: [
      ...result.reasons,
      ...result.negativeReasons,
      ...result.warnings,
      ...(result.hypothesisMap?.clusters.map(cluster => cluster.label) ?? []),
      ...(result.hypothesisMap?.crossLinks ?? []),
    ],
  }, limit);
}
