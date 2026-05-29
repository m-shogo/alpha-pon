import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { findRelatedMarketLessonsForScore } from "./market-lesson-links.js";
import type { ScoreResult } from "../types.js";

export type AnalogyOutcomeDirection = "same" | "opposite" | "mixed" | "unknown";
export type AnalogyOutcomeQuality = "useful" | "misleading" | "too_early" | "unknown";

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

export type AnalogyOutcomeRecord = {
  schemaVersion: 1;
  createdAt: string;
  evaluatedAt: string;
  candidateCode?: string;
  candidateName?: string;
  lessonId: string;
  lessonTitle: string;
  direction: AnalogyOutcomeDirection;
  quality: AnalogyOutcomeQuality;
  actualOutcome: string;
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

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
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

export function saveAnalogyUsageDb(results: ScoreResult[], date: string): void {
  const records = results.flatMap(result => buildAnalogyUsageRecords(result, 3));
  const dailyPath = join("data", "analogy_usage", `${date}.jsonl`);
  const latestPath = join("data", "analogy_usage_latest.json");

  appendJsonl(dailyPath, records);
  ensureDir(latestPath);
  writeFileSync(latestPath, JSON.stringify(records, null, 2), "utf-8");
}

export function saveAnalogyOutcome(record: AnalogyOutcomeRecord): void {
  appendJsonl(join("data", "analogy_outcomes.jsonl"), [record]);
}

export function loadAnalogyUsageRecords(): AnalogyUsageRecord[] {
  const latestPath = join("data", "analogy_usage_latest.json");
  if (existsSync(latestPath)) {
    return JSON.parse(readFileSync(latestPath, "utf-8")) as AnalogyUsageRecord[];
  }
  return [];
}

export function loadAnalogyOutcomeRecords(): AnalogyOutcomeRecord[] {
  return readJsonl<AnalogyOutcomeRecord>(join("data", "analogy_outcomes.jsonl"));
}

export function summarizeAnalogyDb() {
  const usage = loadAnalogyUsageRecords();
  const outcomes = loadAnalogyOutcomeRecords();
  const lessonUsage: Record<string, number> = {};
  const lessonUseful: Record<string, number> = {};
  const lessonMisleading: Record<string, number> = {};
  const oppositeLessons: Record<string, number> = {};
  const missedSignals: Record<string, number> = {};

  for (const record of usage) {
    lessonUsage[record.lessonTitle] = (lessonUsage[record.lessonTitle] ?? 0) + 1;
  }

  for (const record of outcomes) {
    if (record.quality === "useful") lessonUseful[record.lessonTitle] = (lessonUseful[record.lessonTitle] ?? 0) + 1;
    if (record.quality === "misleading") lessonMisleading[record.lessonTitle] = (lessonMisleading[record.lessonTitle] ?? 0) + 1;
    if (record.direction === "opposite") oppositeLessons[record.lessonTitle] = (oppositeLessons[record.lessonTitle] ?? 0) + 1;
    for (const signal of record.missedSignals) {
      missedSignals[signal] = (missedSignals[signal] ?? 0) + 1;
    }
  }

  return {
    usageCount: usage.length,
    outcomeCount: outcomes.length,
    lessonUsage,
    lessonUseful,
    lessonMisleading,
    oppositeLessons,
    missedSignals,
  };
}
