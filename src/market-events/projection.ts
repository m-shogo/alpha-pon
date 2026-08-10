import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compareExplicitIso8601Instants } from "../research/iso-instant.js";
import type { DecisionState, EventSource, MarketEvent, MarketEventPriority } from "./contracts.js";
import { buildMarketEventsIcs } from "./ics.js";
import {
  listEventSources,
  listMarketEvents,
  type MarketEventDatabase,
} from "./sqlite-store.js";

export const DEFAULT_MARKET_EVENT_JSON_PATH = "apps/web/public/generated/alpha-pon-events.json";
export const DEFAULT_MARKET_EVENT_ICS_PATH = "apps/web/public/generated/alpha-pon-events.ics";

export type MarketEventProjectionSource = Pick<
  EventSource,
  "sourceId" | "authority" | "sourceType" | "url" | "title" | "publishedAt" | "retrievedAt" | "contentHash"
>;

export type MarketEventProjectionItem = MarketEvent & {
  revisionNumber: number;
  sources: MarketEventProjectionSource[];
  freshnessState: "FRESH" | "STALE" | "UNKNOWN";
  calendarIncluded: boolean;
  sortAt: string | null;
};

export type MarketEventGeneratedData = {
  schemaVersion: 1;
  generatedAt: string;
  source: "local-sqlite" | "cloudflare-d1" | "fallback";
  events: MarketEventProjectionItem[];
  summary: {
    total: number;
    scheduled: number;
    unknownDate: number;
    stale: number;
    calendarIncluded: number;
    calendarExcludedUnknownDate: number;
    priorityCounts: Record<MarketEventPriority, number>;
    decisionCounts: Record<DecisionState, number>;
    nextEventAt: string | null;
  };
  meta: {
    warnings: string[];
    databasePath: string | null;
  };
};

function revisionNumber(db: MarketEventDatabase, eventId: string): number {
  const row = db.prepare(`
    SELECT COALESCE(MAX(revision_number), 0) AS revisionNumber
    FROM event_revisions
    WHERE event_id = ?
  `).get(eventId) as { revisionNumber: number };
  return row.revisionNumber;
}

function freshness(event: MarketEvent, generatedAt: string): MarketEventProjectionItem["freshnessState"] {
  if (!event.staleAfter) return "UNKNOWN";
  return compareExplicitIso8601Instants(
    generatedAt,
    event.staleAfter,
    "market event generatedAt",
    "market event staleAfter",
  ) > 0 ? "STALE" : "FRESH";
}

function sortAt(event: MarketEvent): string | null {
  if (event.time.precision === "WINDOW") return event.time.windowStart;
  return event.time.startAt;
}

function projectionSource(source: EventSource): MarketEventProjectionSource {
  return {
    sourceId: source.sourceId,
    authority: source.authority,
    sourceType: source.sourceType,
    url: source.url,
    title: source.title,
    publishedAt: source.publishedAt,
    retrievedAt: source.retrievedAt,
    contentHash: source.contentHash,
  };
}

function chronologicalValue(event: MarketEventProjectionItem): string {
  return event.sortAt ?? "9999-12-31T23:59:59Z";
}

export function buildMarketEventGeneratedData(
  db: MarketEventDatabase,
  options: {
    generatedAt?: string;
    source?: MarketEventGeneratedData["source"];
    databasePath?: string | null;
  } = {},
): { data: MarketEventGeneratedData; ics: string } {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const events = listMarketEvents(db, { includeCancelled: true, limit: 5000 }).map(event => {
    const sources = listEventSources(db, event.eventId);
    return {
      ...event,
      revisionNumber: revisionNumber(db, event.eventId),
      sources: sources.map(projectionSource),
      freshnessState: freshness(event, generatedAt),
      calendarIncluded: event.time.precision !== "UNKNOWN",
      sortAt: sortAt(event),
    } satisfies MarketEventProjectionItem;
  });

  events.sort((a, b) => {
    const priority = a.priority.localeCompare(b.priority);
    if (priority !== 0) return priority;
    const date = chronologicalValue(a).localeCompare(chronologicalValue(b));
    if (date !== 0) return date;
    return a.eventId.localeCompare(b.eventId);
  });

  const icsResult = buildMarketEventsIcs(
    events.map(event => ({
      event,
      revisionNumber: event.revisionNumber,
      sources: event.sources.map(source => ({
        ...source,
        schemaVersion: 1,
        eventId: event.eventId,
        storageClass: "METADATA_ONLY" as const,
        objectKey: null,
      })),
    })),
    generatedAt,
  );

  const priorityCounts: Record<MarketEventPriority, number> = { S0: 0, S1: 0, S2: 0, S3: 0 };
  const decisionCounts: Record<DecisionState, number> = {
    BUY_WATCH: 0,
    WAIT: 0,
    BLOCK: 0,
    ABSTAIN: 0,
    INFO: 0,
  };
  for (const event of events) {
    priorityCounts[event.priority] += 1;
    decisionCounts[event.currentDecisionState] += 1;
  }
  const warnings: string[] = [];
  const stale = events.filter(event => event.freshnessState === "STALE").length;
  if (stale) warnings.push(`${stale}件のイベントがstaleです。一次情報を再確認してください。`);
  if (icsResult.excludedUnknownDate) {
    warnings.push(`${icsResult.excludedUnknownDate}件は日程未確定のためICSから除外しています。`);
  }
  const nextEventAt = events
    .filter(event => {
      if (!event.sortAt || event.status === "CANCELLED" || event.status === "COMPLETED") return false;
      return event.sortAt >= generatedAt.slice(0, 10);
    })
    .map(event => event.sortAt as string)
    .sort()[0] ?? null;

  return {
    data: {
      schemaVersion: 1,
      generatedAt,
      source: options.source ?? "local-sqlite",
      events,
      summary: {
        total: events.length,
        scheduled: events.filter(event => !["CANCELLED", "COMPLETED", "UNKNOWN_DATE"].includes(event.status)).length,
        unknownDate: events.filter(event => event.time.precision === "UNKNOWN").length,
        stale,
        calendarIncluded: icsResult.included,
        calendarExcludedUnknownDate: icsResult.excludedUnknownDate,
        priorityCounts,
        decisionCounts,
        nextEventAt,
      },
      meta: {
        warnings,
        databasePath: options.databasePath ?? null,
      },
    },
    ics: icsResult.content,
  };
}

function writeAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, content, "utf8");
  renameSync(temporaryPath, path);
}

export function writeMarketEventArtifacts(
  db: MarketEventDatabase,
  options: {
    jsonPath?: string;
    icsPath?: string;
    generatedAt?: string;
    source?: MarketEventGeneratedData["source"];
    databasePath?: string | null;
  } = {},
): MarketEventGeneratedData {
  const { data, ics } = buildMarketEventGeneratedData(db, options);
  writeAtomically(options.jsonPath ?? DEFAULT_MARKET_EVENT_JSON_PATH, `${JSON.stringify(data, null, 2)}\n`);
  writeAtomically(options.icsPath ?? DEFAULT_MARKET_EVENT_ICS_PATH, ics);
  return data;
}
