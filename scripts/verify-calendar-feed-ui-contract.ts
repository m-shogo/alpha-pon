import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const actions = readFileSync("apps/web/components/CalendarFeedActions.tsx", "utf8");
const liveCalendar = readFileSync("apps/web/components/LiveMarketEventCalendar.tsx", "utf8");
const serviceWorker = readFileSync("apps/web/public/sw.js", "utf8");

assert(actions.includes("/generated/alpha-pon-events.ics"), "public calendar action must use the generated snapshot ICS");
assert(actions.includes("公開購読は生成時点のSNAPSHOT"), "public subscription must be labelled as a snapshot before interaction");
assert(actions.includes("Token付きLIVE購読URLはこの画面へ出さず"), "manual tokenized live subscription boundary must be explicit");
assert(!actions.includes("/api/calendar-feed-url"), "client must not call the intentionally disabled calendar feed URL endpoint");
assert(!actions.includes("/calendar.ics"), "client bundle must not contain the token-protected live ICS path");
assert(!actions.includes("CALENDAR_FEED_TOKEN"), "client bundle must never reference the calendar feed secret name");
assert(!/token\s*=|[?&]token=/i.test(actions), "client bundle must never construct a tokenized calendar URL");
assert(actions.includes("noopener,noreferrer"), "snapshot feed must open without opener or referrer linkage");

assert(liveCalendar.includes("Cloudflare D1のLIVEデータを表示しています。"), "LIVE D1 screen state must be explicit");
assert(liveCalendar.includes("生成済みSNAPSHOTを表示しています。"), "fallback screen state must be explicit");

assert(serviceWorker.includes("url.pathname === '/calendar.ics'"), "service worker must bypass the tokenized live ICS route");
assert(serviceWorker.includes("url.pathname.startsWith('/api/')"), "service worker must bypass live APIs");
assert(serviceWorker.includes("'/generated/alpha-pon-events.ics'"), "service worker may cache only the public snapshot ICS");

console.log("calendar-feed-ui-contract-verification: ok");
