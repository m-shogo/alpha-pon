import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { searchMarketLessons } from "./market-lessons-db.js";
import type { ClassifiedWorldEvent, SourceReliability, VerificationStatus, WorldEventImpact } from "./world-event-map.js";

export type WorldEventReflection = {
  schemaVersion: 1;
  createdAt: string;
  eventId: string;
  title: string;
  source?: string;
  url: string;
  publishedAt?: string;
  totalImpactScore: number;
  sourceReliability: SourceReliability;
  verificationStatus: VerificationStatus;
  misinformationRisk: "low" | "medium" | "high";
  urgencyScore: number;
  verificationChecks: string[];
  categories: string[];
  impactedTags: string[];
  hypothesisClusters: string[];
  thesis: string;
  chainOfImpact: string[];
  possibleBeneficiaries: string[];
  possibleRisks: string[];
  similarLessonIds: string[];
  similarLessonTitles: string[];
  evidenceNeeded: string[];
  invalidationSignals: string[];
  reviewStatus: "open" | "reviewed" | "ignored";
};

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function appendJsonl(path: string, records: unknown[]): void {
  if (records.length === 0) return;
  ensureDir(path);
  appendFileSync(path, records.map(record => JSON.stringify(record)).join("\n") + "\n", "utf-8");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compactImpactText(impact: WorldEventImpact): string {
  return `${impact.category}: ${impact.impactedTags.slice(0, 5).join(", ")} / ${impact.watchQuestions[0]}`;
}

function eventId(date: string, event: ClassifiedWorldEvent): string {
  const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${date}_${safeTitle || "world-event"}`;
}

function isReflectionSafe(event: ClassifiedWorldEvent): boolean {
  if (event.totalImpactScore <= 0) return false;
  if (event.misinformationRisk === "high") return false;
  if (event.verificationStatus === "unverified") return false;
  return ["official", "tier1", "tier2"].includes(event.sourceReliability);
}

export function buildWorldEventReflections(events: ClassifiedWorldEvent[], date: string, limit = 8): WorldEventReflection[] {
  return events
    .filter(isReflectionSafe)
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, limit)
    .map(event => {
      const impactedTags = unique(event.impacts.flatMap(impact => impact.impactedTags));
      const categories = unique(event.impacts.map(impact => impact.category));
      const hypothesisClusters = unique(event.impacts.flatMap(impact => impact.hypothesisClusters));
      const possibleBeneficiaries = unique(event.impacts.flatMap(impact => impact.possibleBeneficiaries));
      const possibleRisks = unique(event.impacts.flatMap(impact => impact.possibleRisks));
      const evidenceNeeded = unique([
        ...event.verificationChecks,
        ...event.impacts.flatMap(impact => impact.primaryChecks),
      ]).slice(0, 12);
      const invalidationSignals = unique([
        "一次情報またはTier1報道で裏取りできない",
        "SNS/速報だけで、公式発表が確認できない",
        ...event.impacts.flatMap(impact => impact.watchQuestions),
      ]).slice(0, 8);
      const lessonMatches = searchMarketLessons({
        tags: impactedTags,
        text: `${event.title} ${event.snippet ?? ""} ${categories.join(" ")} ${hypothesisClusters.join(" ")}`,
        limit: 5,
      });
      const primaryImpact = event.impacts[0];
      const thesis = primaryImpact
        ? `${event.title} は ${primaryImpact.category} のイベントとして、${primaryImpact.impactedTags.slice(0, 5).join(" / ")} に波及する可能性がある。直接の答えではなく、一次情報で検証する仮説として保存する。`
        : `${event.title} は市場テーマへの接続が弱いため、追加確認が必要。`;

      return {
        schemaVersion: 1,
        createdAt: date,
        eventId: eventId(date, event),
        title: event.title,
        source: event.source,
        url: event.url,
        publishedAt: event.publishedAt,
        totalImpactScore: event.totalImpactScore,
        sourceReliability: event.sourceReliability,
        verificationStatus: event.verificationStatus,
        misinformationRisk: event.misinformationRisk,
        urgencyScore: event.urgencyScore,
        verificationChecks: event.verificationChecks,
        categories,
        impactedTags,
        hypothesisClusters,
        thesis,
        chainOfImpact: event.impacts.map(compactImpactText),
        possibleBeneficiaries: possibleBeneficiaries.slice(0, 12),
        possibleRisks: possibleRisks.slice(0, 12),
        similarLessonIds: lessonMatches.map(match => match.lesson.id),
        similarLessonTitles: lessonMatches.map(match => match.lesson.title),
        evidenceNeeded,
        invalidationSignals,
        reviewStatus: "open",
      } satisfies WorldEventReflection;
    });
}

export function saveWorldEventReflections(events: ClassifiedWorldEvent[], date: string): void {
  const records = buildWorldEventReflections(events, date, 8);
  const dailyPath = join("data", "world_event_reflections", `${date}.jsonl`);
  const latestPath = join("data", "world_event_reflections_latest.json");
  appendJsonl(dailyPath, records);
  ensureDir(latestPath);
  writeFileSync(latestPath, JSON.stringify(records, null, 2), "utf-8");
}

export function loadLatestWorldEventReflections(): WorldEventReflection[] {
  const latestPath = join("data", "world_event_reflections_latest.json");
  if (!existsSync(latestPath)) return [];
  return JSON.parse(readFileSync(latestPath, "utf-8")) as WorldEventReflection[];
}
