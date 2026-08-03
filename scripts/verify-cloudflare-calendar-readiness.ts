import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";

const requiredFiles = [
  "apps/web/next.config.ts",
  "apps/web/app/calendar/page.tsx",
  "apps/web/components/MarketEventCalendar.tsx",
  "apps/web/components/CalendarFeedActions.tsx",
  "apps/web/public/_routes.json",
  "apps/web/public/_headers",
  "apps/web/public/sw.js",
  "functions/[[path]].ts",
  "migrations/0001_market_event_foundation.sql",
  "migrations/0002_market_event_revision_guards.sql",
  "scripts/build-cloudflare-pages.sh",
  "scripts/bootstrap-cloudflare-d1.sh",
  "scripts/verify-d1-bootstrap-export.ts",
  "scripts/verify-market-event-revision-guards.ts",
  "docs/implementation/cloudflare-pages-registration-runbook.md",
  "wrangler.jsonc.example",
  ".dev.vars.example",
];
for (const path of requiredFiles) assert(existsSync(path), `missing Cloudflare readiness file: ${path}`);

assert(!existsSync(".dev.vars"), ".dev.vars must never be committed or present in the readiness workspace");
assert(!existsSync("wrangler.jsonc"), "real wrangler.jsonc is created only after Cloudflare registration");

const nextConfig = readFileSync("apps/web/next.config.ts", "utf8");
assert.match(nextConfig, /output:\s*['"]export['"]/, "Next.js must produce a static Pages export");

const routes = JSON.parse(readFileSync("apps/web/public/_routes.json", "utf8")) as {
  version: number;
  include: string[];
  exclude: string[];
};
assert.equal(routes.version, 1);
for (const requiredRoute of ["/api/market-events*", "/api/calendar-feed-url*", "/calendar.ics*", "/healthz*"]) {
  assert(routes.include.includes(requiredRoute), `missing Pages Functions route: ${requiredRoute}`);
}

const headers = readFileSync("apps/web/public/_headers", "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "X-Robots-Tag", "Referrer-Policy"]) {
  assert(headers.includes(header), `missing security header: ${header}`);
}

const foundationMigration = readFileSync("migrations/0001_market_event_foundation.sql", "utf8");
for (const table of ["market_events", "event_revisions", "event_sources", "decision_snapshots", "delivery_outbox", "calendar_sync_state"]) {
  assert(foundationMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing D1 table: ${table}`);
}
const guardMigration = readFileSync("migrations/0002_market_event_revision_guards.sql", "utf8");
for (const trigger of [
  "trg_event_revision_continuity",
  "trg_event_revision_promote_current",
  "trg_event_revisions_no_update",
  "trg_event_revisions_no_delete",
]) {
  assert(guardMigration.includes(`TRIGGER IF NOT EXISTS ${trigger}`), `missing D1 guard trigger: ${trigger}`);
}

const gitignore = readFileSync(".gitignore", "utf8");
for (const ignored of [".dev.vars", "data/market-events.db", "data/exports/", "apps/web/out/"]) {
  assert(gitignore.includes(ignored), `missing .gitignore protection: ${ignored}`);
}

const eventDirectory = "config/market-events";
const files = existsSync(eventDirectory)
  ? readdirSync(eventDirectory).filter(name => name.endsWith(".json")).sort()
  : [];
const contexts = new Map<string, { revisionNumber: number; previousRevisionId: string | null; existingCreatedAt: string | null }>();
const eventIds = new Set<string>();
let inputCount = 0;
for (const name of files) {
  const path = join(eventDirectory, name);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as MarketEventRegistrationInput | MarketEventRegistrationInput[];
  const inputs = Array.isArray(parsed) ? parsed : [parsed];
  for (const input of inputs) {
    inputCount += 1;
    const eventId = buildEventId(input);
    const existing = contexts.get(eventId) ?? { revisionNumber: 1, previousRevisionId: null, existingCreatedAt: null };
    const bundle = buildMarketEventBundle(input, existing);
    contexts.set(eventId, {
      revisionNumber: existing.revisionNumber + 1,
      previousRevisionId: bundle.revision.revisionId,
      existingCreatedAt: bundle.event.createdAt,
    });
    const eventRevisionKey = `${bundle.event.eventId}:${bundle.revision.revisionNumber}`;
    assert(!eventIds.has(eventRevisionKey), `duplicate seed event revision: ${eventRevisionKey}`);
    eventIds.add(eventRevisionKey);

    assert(
      Date.parse(bundle.event.lastVerifiedAt) <= Date.parse(bundle.revision.observedAt),
      `lastVerifiedAt must not be after observedAt: ${path}`,
    );
    for (const source of bundle.sources) {
      assert(/^[a-f0-9]{32,128}$/.test(source.contentHash), `source contentHash must be lowercase hex: ${path}`);
      assert(
        Date.parse(source.retrievedAt) <= Date.parse(bundle.revision.observedAt),
        `source retrievedAt must not be after observedAt: ${path}`,
      );
      if (source.publishedAt) {
        assert(
          Date.parse(source.publishedAt) <= Date.parse(source.retrievedAt),
          `source publishedAt must not be after retrievedAt: ${path}`,
        );
      }
    }

    if (bundle.event.eventType === "REVIEW_CHECKPOINT") {
      assert(bundle.event.title.includes("内部レビュー"), `review checkpoint must be explicit: ${path}`);
      assert.equal(bundle.deliveries.length, 0, `review seed must not enqueue external delivery: ${path}`);
      assert(bundle.sources.length > 0, `review checkpoint must retain an official source: ${path}`);
    }
  }
}

const wranglerExample = readFileSync("wrangler.jsonc.example", "utf8");
assert(wranglerExample.includes("REPLACE_AFTER_CLOUDFLARE_REGISTRATION"));
assert(!wranglerExample.includes("CALENDAR_FEED_TOKEN"), "calendar bearer token must be a secret, not wrangler vars");

const bootstrapScript = readFileSync("scripts/bootstrap-cloudflare-d1.sh", "utf8");
assert(bootstrapScript.includes("migrations/[0-9]*.sql"), "D1 bootstrap must apply every ordered migration");
assert(bootstrapScript.includes("--apply"), "D1 remote writes must require explicit --apply");

console.log(JSON.stringify({
  status: "READY_PENDING_CLOUDFLARE_REGISTRATION",
  requiredFiles: requiredFiles.length,
  pagesFunctionRoutes: routes.include,
  validatedSeedFiles: files.length,
  validatedSeedInputs: inputCount,
  remainingExternalSteps: [
    "Create/connect Cloudflare Pages project",
    "Create D1 database and bind it as DB",
    "Apply every migration and optional bootstrap SQL",
    "Set OWNER_EMAIL and PUBLIC_ORIGIN",
    "Set encrypted CALENDAR_FEED_TOKEN",
    "Configure Cloudflare Access and narrow calendar.ics bypass",
  ],
}, null, 2));
