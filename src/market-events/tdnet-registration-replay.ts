import type { MarketEventBundle } from "./contracts.js";
import {
  auditMarketEventDatabase,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "./sqlite-store.js";

export type TdnetRegistrationReplayCounts = {
  events: number;
  revisions: number;
  sources: number;
  decisions: number;
  outbox: number;
  reviewTasks: number;
};

export type TdnetRegistrationReplayReport = {
  eventId: string;
  revisionId: string;
  sourceIds: string[];
  firstPass: TdnetRegistrationReplayCounts;
  secondPass: TdnetRegistrationReplayCounts;
  duplicateDelta: TdnetRegistrationReplayCounts;
  auditStatus: "ok" | "error";
  status: "ok" | "error";
};

function counts(db: ReturnType<typeof openMarketEventDatabase>): TdnetRegistrationReplayCounts {
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total;
  return {
    events: count("market_events"),
    revisions: count("event_revisions"),
    sources: count("event_sources"),
    decisions: count("decision_snapshots"),
    outbox: count("delivery_outbox"),
    reviewTasks: count("review_tasks"),
  };
}

function subtract(
  after: TdnetRegistrationReplayCounts,
  before: TdnetRegistrationReplayCounts,
): TdnetRegistrationReplayCounts {
  return {
    events: after.events - before.events,
    revisions: after.revisions - before.revisions,
    sources: after.sources - before.sources,
    decisions: after.decisions - before.decisions,
    outbox: after.outbox - before.outbox,
    reviewTasks: after.reviewTasks - before.reviewTasks,
  };
}

function isZero(countsValue: TdnetRegistrationReplayCounts): boolean {
  return Object.values(countsValue).every(value => value === 0);
}

export function replayTdnetRegistrationPreviewIsolated(
  bundle: MarketEventBundle,
): TdnetRegistrationReplayReport {
  if (bundle.deliveries.length !== 0) {
    throw new Error("TDnet isolated replay rejects bundles with deliveries");
  }
  if (bundle.decisionSnapshot !== null) {
    throw new Error("TDnet isolated replay rejects bundles with decision snapshots");
  }

  const db = openMarketEventDatabase({ path: ":memory:" });
  try {
    registerMarketEventBundle(db, bundle);
    const firstPass = counts(db);

    registerMarketEventBundle(db, bundle);
    const secondPass = counts(db);
    const duplicateDelta = subtract(secondPass, firstPass);
    const audit = auditMarketEventDatabase(db, ":memory:");

    const expectedFirstPass = firstPass.events === 1
      && firstPass.revisions === 1
      && firstPass.sources === bundle.sources.length
      && firstPass.decisions === 0
      && firstPass.outbox === 0
      && firstPass.reviewTasks === 0;

    return {
      eventId: bundle.event.eventId,
      revisionId: bundle.revision.revisionId,
      sourceIds: bundle.sources.map(source => source.sourceId),
      firstPass,
      secondPass,
      duplicateDelta,
      auditStatus: audit.status,
      status: expectedFirstPass && isZero(duplicateDelta) && audit.status === "ok" ? "ok" : "error",
    };
  } finally {
    db.close();
  }
}
