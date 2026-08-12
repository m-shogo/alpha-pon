import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { findRelatedMarketLessonsForScore } from "./market-lesson-links.js";
import { buildModernAnalogies } from "./modern-analogy.js";
import { analogyReviewDueDate } from "../analogy-review-date.js";
import type { ScoreResult } from "../types.js";

export type AnalogyOutcomeDirection = "same" | "opposite" | "mixed" | "unknown";
export type AnalogyOutcomeQuality = "useful" | "misleading" | "too_early" | "unknown";
export type AnalogyExpectedDirection = "up" | "down" | "mixed" | "risk_off" | "unknown";
export type AnalogyTimeframe = "1d" | "1w" | "1m";

export type AnalogyUsageRecord = {
  schemaVersion: 1;
  createdAt: string;
  candidateCode: string;
  candidateName: string;
  score: number;
  alertLevel: string;
  dataQuality: string;
  lessonId: string;
  lessonTitle: string;
  lessonCategory: string;
  lessonDirection: string;
  matchedTags: string[];
  matchScore: number;
  tags: string[];
  rules: string[];
  hypothesisClusterIds: string[];
  evidenceNeeded: string[];
  practicalQuestions: string[];
};

export type AnalogyPredictionRecord = {
  schemaVersion: 1;
  createdAt: string;
  reviewDueAt: string;
  eventId: string;
  timeframe: AnalogyTimeframe;
  candidateCode?: string;
  candidateName?: string;
  lessonId: string;
  lessonTitle: string;
  thesis: string;
  expectedDirection: AnalogyExpectedDirection;
  expectedTimeframe?: string;
  confidence: number;
  conditions: string[];
  invalidationSignals: string[];
  evidenceNeeded: string[];
  similarPoints: string[];
  differentPoints: string[];
  status: "open" | "reviewed";
};

export type AnalogyOutcomeRecord = {
  schemaVersion: 1;
  createdAt: string;
  evaluatedAt: string;
  eventId?: string;
  timeframe?: AnalogyTimeframe;
  candidateCode?: string;
  candidateName?: string;
  lessonId: string;
  lessonTitle: string;
  direction: AnalogyOutcomeDirection;
  quality: AnalogyOutcomeQuality;
  actualOutcome: string;
  startDate?: string;
  endDate?: string;
  startClose?: number;
  endClose?: number;
  returnPct?: number;
  benchmarkCode?: string;
  benchmarkReturnPct?: number;
  relativeReturnPct?: number;
  maxDrawdownPct?: number;
  benchmarkMaxDrawdownPct?: number;
  dataAvailability?: "price_and_benchmark" | "price_only" | "missing";
  whatMatched: string[];
  whatDiffered: string[];
  missedSignals: string[];
  improvedRuleIdeas: string[];
};

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function appendJsonl(path: string, records: unknown[]): void {
  if (records.length === 0) return;
  ensureDir(path);
  const text = records.map(record => JSON.stringify(record)).join("\n") + "\n";
  appendFileSync(path, text, "utf-8");
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function directionToExpected(direction: string): AnalogyExpectedDirection {
  if (direction === "up") return "up";
  if (direction === "down") return "down";
  if (direction === "volatile") return "mixed";
  return "unknown";
}

function makeEventId(date: string, candidateCode: string | undefined, lessonId: string, timeframe: AnalogyTimeframe): string {
  return `${date}_${candidateCode ?? "world"}_${lessonId}_${timeframe}`;
}

export function buildAnalogyUsageRecords(result: ScoreResult, limit = 3): AnalogyUsageRecord[] {
  const lessons = findRelatedMarketLessonsForScore(result, limit);

  return lessons.map(match => ({
    schemaVersion: 1,
    createdAt: result.createdAt,
    candidateCode: result.candidate.code,
    candidateName: result.candidate.name,
    score: result.score,
    alertLevel: result.alertLevel,
    dataQuality: result.dataQuality,
    lessonId: match.lesson.id,
    lessonTitle: match.lesson.title,
    lessonCategory: match.lesson.category,
    lessonDirection: match.lesson.direction,
    matchedTags: match.matchedTags,
    matchScore: match.score,
    tags: result.candidate.tags,
    rules: result.candidate.rules,
    hypothesisClusterIds: result.hypothesisMap?.clusters.map(cluster => cluster.id) ?? [],
    evidenceNeeded: match.lesson.primaryChecks.slice(0, 6),
    practicalQuestions: match.lesson.modernAnalogyQuestions.slice(0, 4),
  }));
}

export function buildAnalogyPredictionRecords(result: ScoreResult, limit = 3): AnalogyPredictionRecord[] {
  const lessons = findRelatedMarketLessonsForScore(result, limit);
  const analogies = buildModernAnalogies(result, limit);
  const timeframes: AnalogyTimeframe[] = ["1d", "1w", "1m"];

  return lessons.flatMap((match, index) => {
    const analogy = analogies[index];
    return timeframes.map(timeframe => ({
      schemaVersion: 1,
      createdAt: result.createdAt,
      reviewDueAt: analogyReviewDueDate(result.createdAt, timeframe),
      eventId: makeEventId(result.createdAt, result.candidate.code, match.lesson.id, timeframe),
      timeframe,
      candidateCode: result.candidate.code,
      candidateName: result.candidate.name,
      lessonId: match.lesson.id,
      lessonTitle: match.lesson.title,
      thesis: `${result.candidate.name} は ${match.lesson.title} の型に一部似ている可能性。スコア加点ではなく、${timeframe} 後に実際と比較する仮説として保存する。`,
      expectedDirection: directionToExpected(match.lesson.direction),
      confidence: Math.min(0.8, Math.max(0.2, match.score / 100)),
      conditions: match.lesson.context?.modernConditionsToCompare.slice(0, 6) ?? match.lesson.primaryChecks.slice(0, 6),
      invalidationSignals: match.lesson.context?.whyItCouldInvert.slice(0, 5) ?? ["一次情報で前提が否定される", "市場が織り込み済み", "政策対応や代替供給で影響が限定される"],
      evidenceNeeded: match.lesson.primaryChecks.slice(0, 6),
      similarPoints: analogy?.similarPoints ?? match.matchedTags.map(tag => `tag:${tag}`),
      differentPoints: analogy?.differentPoints ?? ["時代背景・金利・政策・市場構造は当時と違う可能性"],
      status: "open",
    } satisfies AnalogyPredictionRecord));
  });
}

export function saveAnalogyUsageDb(results: ScoreResult[], date: string): void {
  const records = results.flatMap(result => buildAnalogyUsageRecords(result, 3));
  const dailyPath = join("data", "analogy_usage", `${date}.jsonl`);
  const latestPath = join("data", "analogy_usage_latest.json");

  appendJsonl(dailyPath, records);
  ensureDir(latestPath);
  writeFileSync(latestPath, JSON.stringify(records, null, 2), "utf-8");
}

export function saveAnalogyPredictionDb(results: ScoreResult[], date: string): void {
  const records = results.flatMap(result => buildAnalogyPredictionRecords(result, 3));
  const dailyPath = join("data", "analogy_predictions", `${date}.jsonl`);
  const latestPath = join("data", "analogy_predictions_latest.json");

  appendJsonl(dailyPath, records);
  ensureDir(latestPath);
  writeFileSync(latestPath, JSON.stringify(records, null, 2), "utf-8");
}

export function saveAnalogyOutcome(record: AnalogyOutcomeRecord): void {
  appendJsonl(join("data", "analogy_outcomes.jsonl"), [record]);
}

export function saveAnalogyOutcomes(records: AnalogyOutcomeRecord[]): void {
  appendJsonl(join("data", "analogy_outcomes.jsonl"), records);
}

export function loadAnalogyUsageRecords(): AnalogyUsageRecord[] {
  const latestPath = join("data", "analogy_usage_latest.json");
  if (existsSync(latestPath)) {
    return JSON.parse(readFileSync(latestPath, "utf-8")) as AnalogyUsageRecord[];
  }
  return [];
}

export function loadAnalogyPredictionRecords(): AnalogyPredictionRecord[] {
  const latestPath = join("data", "analogy_predictions_latest.json");
  if (existsSync(latestPath)) {
    return JSON.parse(readFileSync(latestPath, "utf-8")) as AnalogyPredictionRecord[];
  }
  return [];
}

export function loadAnalogyOutcomeRecords(): AnalogyOutcomeRecord[] {
  return readJsonl<AnalogyOutcomeRecord>(join("data", "analogy_outcomes.jsonl"));
}

export function summarizeAnalogyDb() {
  const usage = loadAnalogyUsageRecords();
  const predictions = loadAnalogyPredictionRecords();
  const outcomes = loadAnalogyOutcomeRecords();
  const lessonUsage: Record<string, number> = {};
  const lessonPredictions: Record<string, number> = {};
  const lessonUseful: Record<string, number> = {};
  const lessonMisleading: Record<string, number> = {};
  const oppositeLessons: Record<string, number> = {};
  const missedSignals: Record<string, number> = {};
  const improvedRuleIdeas: Record<string, number> = {};

  for (const record of usage) lessonUsage[record.lessonTitle] = (lessonUsage[record.lessonTitle] ?? 0) + 1;
  for (const record of predictions) lessonPredictions[record.lessonTitle] = (lessonPredictions[record.lessonTitle] ?? 0) + 1;

  for (const record of outcomes) {
    if (record.quality === "useful") lessonUseful[record.lessonTitle] = (lessonUseful[record.lessonTitle] ?? 0) + 1;
    if (record.quality === "misleading") lessonMisleading[record.lessonTitle] = (lessonMisleading[record.lessonTitle] ?? 0) + 1;
    if (record.direction === "opposite") oppositeLessons[record.lessonTitle] = (oppositeLessons[record.lessonTitle] ?? 0) + 1;
    for (const signal of record.missedSignals) missedSignals[signal] = (missedSignals[signal] ?? 0) + 1;
    for (const idea of record.improvedRuleIdeas) improvedRuleIdeas[idea] = (improvedRuleIdeas[idea] ?? 0) + 1;
  }

  return {
    usageCount: usage.length,
    predictionCount: predictions.length,
    outcomeCount: outcomes.length,
    lessonUsage,
    lessonPredictions,
    lessonUseful,
    lessonMisleading,
    oppositeLessons,
    missedSignals,
    improvedRuleIdeas,
  };
}
