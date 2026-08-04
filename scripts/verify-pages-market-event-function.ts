import assert from "node:assert/strict";
import { onRequest } from "../functions/[[path]].js";

const eventRows = [
  {
    event_id: "evt_111111111111111111111111",
    schema_version: 1,
    occurrence_key: "fy2026-q1",
    issuer_code: "8136",
    issuer_name: "サンリオ",
    event_type: "EARNINGS_RELEASE",
    title: "FY2026 Q1 決算発表",
    status: "SCHEDULED",
    priority: "S1",
    start_at: "2026-08-10T15:00:00+09:00",
    end_at: null,
    all_day: 0,
    timezone: "Asia/Tokyo",
    time_precision: "EXACT",
    window_start: null,
    window_end: null,
    edge_types_json: '["PERSONAL_EXECUTIVE_SHOCK"]',
    current_decision_state: "WAIT",
    why_it_matters: "不祥事後の業績影響を確認する",
    checks_before_json: '["会社予想"]',
    checks_after_json: '["翌営業日株価"]',
    related_event_ids_json: "[]",
    current_revision_id: "rev_111111111111111111111111",
    last_verified_at: "2026-08-03T06:00:00Z",
    stale_after: "2099-08-04T06:00:00Z",
    created_at: "2026-08-03T06:00:00Z",
    updated_at: "2026-08-03T06:00:00Z",
  },
  {
    event_id: "evt_222222222222222222222222",
    schema_version: 1,
    occurrence_key: "investigation-final-2026",
    issuer_code: "9999",
    issuer_name: "検証会社",
    event_type: "THIRD_PARTY_COMMITTEE_REPORT",
    title: "第三者委員会最終報告",
    status: "UNKNOWN_DATE",
    priority: "S1",
    start_at: null,
    end_at: null,
    all_day: 0,
    timezone: "Asia/Tokyo",
    time_precision: "UNKNOWN",
    window_start: null,
    window_end: null,
    edge_types_json: "[]",
    current_decision_state: "WAIT",
    why_it_matters: "追加不正を確認する",
    checks_before_json: "[]",
    checks_after_json: "[]",
    related_event_ids_json: "[]",
    current_revision_id: "rev_222222222222222222222222",
    last_verified_at: "2026-08-03T06:00:00Z",
    stale_after: null,
    created_at: "2026-08-03T06:00:00Z",
    updated_at: "2026-08-03T06:00:00Z",
  },
];

const sourceRows = [{
  source_id: "src_111111111111111111111111",
  event_id: eventRows[0].event_id,
  authority: "SANRIO_IR",
  source_type: "IR",
  url: "https://example.com/sanrio/fy2026-q1",
  title: "決算発表予定",
  published_at: "2026-08-01T06:00:00Z",
  retrieved_at: "2026-08-03T06:00:00Z",
  content_hash: "aaaaaaaa",
}];

const revisionRows = [
  { event_id: eventRows[0].event_id, revision_number: 1 },
  { event_id: eventRows[1].event_id, revision_number: 1 },
];

const fakeDb = {
  prepare(query: string) {
    return {
      bind() { return this; },
      async all<T>() {
        if (query.includes("FROM market_events")) return { success: true, results: eventRows as T[] };
        if (query.includes("FROM event_sources")) return { success: true, results: sourceRows as T[] };
        if (query.includes("FROM event_revisions")) return { success: true, results: revisionRows as T[] };
        throw new Error(`Unexpected query: ${query}`);
      },
      async first<T>() { return null as T | null; },
    };
  },
};

const feedToken = "0123456789abcdef0123456789abcdef";
const env = {
  DB: fakeDb,
  PUBLIC_ORIGIN: "https://alpha.example.com",
  CALENDAR_FEED_TOKEN: feedToken,
};
const envWithoutDb = {
  PUBLIC_ORIGIN: "https://alpha.example.com",
  CALENDAR_FEED_TOKEN: feedToken,
};

function context(
  url: string,
  options: RequestInit = {},
  contextEnv: typeof env | typeof envWithoutDb = env,
) {
  return {
    request: new Request(url, options),
    env: contextEnv,
    waitUntil() {},
  };
}

const health = await onRequest(context("https://alpha.example.com/healthz"));
assert.equal(health.status, 200);
const healthBody = await health.json() as {
  accessConfigured: boolean;
  apiAccessMode: string;
  calendarFeedConfigured: boolean;
  databaseBound: boolean;
};
assert.equal(healthBody.accessConfigured, false);
assert.equal(healthBody.apiAccessMode, "public-read-only");
assert.equal(healthBody.calendarFeedConfigured, true);
assert.equal(healthBody.databaseBound, true);

const publicProjection = await onRequest(context("https://alpha.example.com/api/market-events"));
assert.equal(publicProjection.status, 200);
const projectionText = await publicProjection.text();
assert.doesNotMatch(projectionText, new RegExp(feedToken));
const projection = JSON.parse(projectionText) as {
  source: string;
  events: Array<{ eventId: string }>;
  summary: { total: number; unknownDate: number; calendarIncluded: number };
};
assert.equal(projection.source, "cloudflare-d1");
assert.equal(projection.events.length, 2);
assert.equal(projection.summary.total, 2);
assert.equal(projection.summary.unknownDate, 1);
assert.equal(projection.summary.calendarIncluded, 1);

const oneEvent = await onRequest(context(`https://alpha.example.com/api/market-events/${eventRows[0].event_id}`));
assert.equal(oneEvent.status, 200);
assert.equal((await oneEvent.json() as { eventId: string }).eventId, eventRows[0].event_id);

const missingEvent = await onRequest(context("https://alpha.example.com/api/market-events/evt_missing"));
assert.equal(missingEvent.status, 404);
assert.deepEqual(await missingEvent.json(), { error: "not found" });

const marketWithoutDb = await onRequest(context(
  "https://alpha.example.com/api/market-events",
  {},
  envWithoutDb,
));
assert.equal(marketWithoutDb.status, 503);
assert.deepEqual(await marketWithoutDb.json(), { error: "database unavailable" });

const eventWithoutDb = await onRequest(context(
  `https://alpha.example.com/api/market-events/${eventRows[0].event_id}`,
  {},
  envWithoutDb,
));
assert.equal(eventWithoutDb.status, 503);
assert.deepEqual(await eventWithoutDb.json(), { error: "database unavailable" });

const post = await onRequest(context("https://alpha.example.com/api/market-events", {
  method: "POST",
}));
assert.equal(post.status, 405);
assert.equal(post.headers.get("allow"), "GET");

const hiddenFeedUrl = await onRequest(context("https://alpha.example.com/api/calendar-feed-url"));
assert.equal(hiddenFeedUrl.status, 404);
assert.doesNotMatch(await hiddenFeedUrl.text(), new RegExp(feedToken));

const spoofedFeedUrl = await onRequest(context("https://alpha.example.com/api/calendar-feed-url", {
  headers: { "Cf-Access-Authenticated-User-Email": "owner@example.com" },
}));
assert.equal(spoofedFeedUrl.status, 404);
assert.doesNotMatch(await spoofedFeedUrl.text(), new RegExp(feedToken));

const missingToken = await onRequest(context("https://alpha.example.com/calendar.ics"));
assert.equal(missingToken.status, 404);
const missingTokenWithoutDb = await onRequest(context(
  "https://alpha.example.com/calendar.ics",
  {},
  envWithoutDb,
));
assert.equal(missingTokenWithoutDb.status, 404);

const wrongToken = await onRequest(context("https://alpha.example.com/calendar.ics?token=wrong"));
assert.equal(wrongToken.status, 404);
const wrongTokenWithoutDb = await onRequest(context(
  "https://alpha.example.com/calendar.ics?token=wrong",
  {},
  envWithoutDb,
));
assert.equal(wrongTokenWithoutDb.status, 404);

const calendar = await onRequest(context(`https://alpha.example.com/calendar.ics?token=${feedToken}`));
assert.equal(calendar.status, 200);
assert.match(calendar.headers.get("content-type") ?? "", /text\/calendar/);
const ics = await calendar.text();
assert.match(ics, new RegExp(`UID:${eventRows[0].event_id}@alpha-pon`));
assert.doesNotMatch(ics, new RegExp(`UID:${eventRows[1].event_id}@alpha-pon`));
assert.doesNotMatch(ics, new RegExp(feedToken));
assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);

const calendarWithoutDb = await onRequest(context(
  `https://alpha.example.com/calendar.ics?token=${feedToken}`,
  {},
  envWithoutDb,
));
assert.equal(calendarWithoutDb.status, 503);
assert.deepEqual(await calendarWithoutDb.json(), { error: "database unavailable" });

console.log("pages-market-event-function: ok");
