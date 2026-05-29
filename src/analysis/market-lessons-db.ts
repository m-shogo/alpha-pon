import { MARKET_LESSONS, type LessonMatch, type MarketLesson } from "./market-lessons.js";
import { EXTRA_MARKET_LESSONS } from "./market-lessons-extra.js";
import { CRISIS_MARKET_LESSONS } from "./market-lessons-crisis.js";
import { enrichMarketLesson } from "./market-lesson-context.js";

export const ALL_MARKET_LESSONS: MarketLesson[] = [
  ...MARKET_LESSONS,
  ...EXTRA_MARKET_LESSONS,
  ...CRISIS_MARKET_LESSONS,
].map(enrichMarketLesson);

export function getMarketLessonById(id: string): MarketLesson | undefined {
  return ALL_MARKET_LESSONS.find(lesson => lesson.id === id);
}

export function listMarketLessonCategories(): string[] {
  return [...new Set(ALL_MARKET_LESSONS.map(lesson => lesson.category))].sort();
}

export function listMarketLessonTags(): string[] {
  return [...new Set(ALL_MARKET_LESSONS.flatMap(lesson => lesson.affectedTags))].sort();
}

export function searchMarketLessons(input: { tags?: string[]; text?: string; limit?: number }): LessonMatch[] {
  const tags = new Set((input.tags ?? []).map(tag => tag.toLowerCase()));
  const text = (input.text ?? "").toLowerCase();
  const limit = input.limit ?? ALL_MARKET_LESSONS.length;

  return ALL_MARKET_LESSONS
    .map(lesson => {
      const matchedTags = lesson.affectedTags.filter(tag => tags.has(tag.toLowerCase()) || text.includes(tag.toLowerCase()));
      const contextText = lesson.context
        ? [
            ...lesson.context.macroBackdrop,
            ...lesson.context.policyBackdrop,
            ...lesson.context.geopoliticalBackdrop,
            ...lesson.context.socialBackdrop,
            ...lesson.context.marketStructure,
            ...lesson.context.transmissionPath,
            lesson.context.whyItMoved,
          ].join(" ")
        : "";
      const textHits = [
        lesson.id,
        lesson.category,
        lesson.title,
        lesson.shortSummary,
        contextText,
        ...lesson.sourceHints,
      ].filter(value => text.includes(value.toLowerCase())).length;
      const score = matchedTags.length * 12 + textHits * 10;
      const why = [
        ...matchedTags.map(tag => `tag:${tag}`),
        ...(textHits > 0 ? ["text/context similarity"] : []),
      ];
      return { lesson, matchedTags, score, why } satisfies LessonMatch;
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function marketLessonsDbStats() {
  return {
    total: ALL_MARKET_LESSONS.length,
    categories: listMarketLessonCategories(),
    tags: listMarketLessonTags(),
    hasContext: ALL_MARKET_LESSONS.filter(lesson => lesson.context != null).length,
  };
}
