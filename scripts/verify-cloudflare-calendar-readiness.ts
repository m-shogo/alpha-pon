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
  "worker/index.ts",
  "wrangler.jsonc",
  "migrations/0001_market_event_foundation.sql",
  "migrations/0002_market_event_revision_guards.sql",
  "migrations/0003_promote_current_revision.sql",
  "migrations/0004_event_revisions_no_update.sql",
  "migrations/0005_event_revisions_no_delete.sql",
  "migrations/0006_event_sources_no_update.sql",
  "migrations/0007_event_sources_no_delete.sql",
  "migrations/0008_decision_snapshots_no_update.sql",
  "migrations/0009_decision_snapshots_no_delete.sql",
  "migrations/0010_revision_guards_marker.sql",
  "migrations/d1/0001_market_event_foundation.sql",
  "migrations/d1/0002_d1_readonly_mode.sql",
  "scripts/build-cloudflare-pages.sh",
  "scripts/build-cloudflare-workers.sh",
  "scripts/bootstrap-cloudflare-d1.sh",
  "scripts/verify-d1-bootstrap-export.ts",
  "scripts/verify-market-event-revision-guards.ts",
  "scripts/verify-workers-static-assets.ts",
  "docs/implementation/cloudflare-workers-static-assets-runbook.md",
  "wrangler.jsonc.example",
  ".dev.vars.example",
  ".node-version",
];
for (const path of requiredFiles) assert(existsSync(path), `missing Cloudflare readiness file: ${path}`);

assert(!existsSync(".dev.vars"), ".dev.vars must never be committed or present in the readiness workspace");

const nextConfig = readFileSync("apps/web/next.config.ts", "utf8");
assert.match(nextConfig, /output:\s*['"]export['"]/, "Next.js must produce a static export");
assert.match(nextConfig, /trailingSlash:\s*true/, "static export routes must use trailing slashes");

const wranglerConfig = readFileSync("wrangler.jsonc", "utf8");
for (const contract of [
  '"main": "./worker/index.ts"',
  '"keep_vars": true',
  '"directory": "./apps/web/out"',
  '"binding": "ASSETS"',
  '"html_handling": "force-trailing-slash"',
  '"not_found_handling": "404-page"',
  '"migrations_dir": "migrations/d1"',
  '"/api/market-events*"',
  '"/api/calendar-feed-url*"',
  '"/calendar.ics*"',
  '"/healthz*"',
]) {
  assert(wranglerConfig.includes(contract), `missing Workers Static Assets contract: ${contract}`);
}
assert(!wranglerConfig.includes('"/api*"'), "broad /api* route must not shadow static generated API assets");
assert(!wranglerConfig.includes('"CALENDAR_FEED_TOKEN":'), "calendar bearer token must not be committed as a Wrangler variable");

const workerEntry = readFileSync("worker/index.ts", "utf8");
assert(workerEntry.includes("env.ASSETS.fetch(request)"), "Worker must delegate static routes to ASSETS");
assert(workerEntry.includes("pathname.startsWith('/api/market-events/')"), "Worker must execute live market-event routes before asset lookup");
assert(workerEntry.includes("pathname === '/api/calendar-feed-url'"), "Worker must execute calendar URL route before asset lookup");
assert(workerEntry.includes("pathname === '/calendar.ics'"), "Worker must execute tokenized ICS before asset lookup");
assert(!workerEntry.includes("pathname.startsWith('/api/')"), "Worker must not shadow static /api/generated/* routes");

const routes = JSON.parse(readFileSync("apps/web/public/_routes.json", "utf8")) as {
  version: number;
  include: string[];
  exclude: string[];
};
assert.equal(routes.version, 1);
for (const requiredRoute of ["/api/market-events*", "/api/calendar-feed-url*", "/calendar.ics*", "/healthz*"]) {
  assert(routes.include.includes(requiredRoute), `missing transitional Pages parity route: ${requiredRoute}`);
}

const headers = readFileSync("apps/web/public/_headers", "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "X-Robots-Tag", "Referrer-Policy"]) {
  assert(headers.includes(header), `missing security header: ${header}`);
}

const foundationMigration = readFileSync("migrations/0001_market_event_foundation.sql", "utf8");
for (const table of ["market_events", "event_revisions", "event_sources", "decision_snapshots", "delivery_outbox", "calendar_sync_state"]) {
  assert(foundationMigration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing D1 table: ${table}`);
}

const expectedTriggerMigrations = new Map<string, string>([
  ["0002_market_event_revision_guards.sql", "trg_event_revision_continuity"],
  ["0003_promote_current_revision.sql", "trg_event_revision_promote_current"],
  ["0004_event_revisions_no_update.sql", "trg_event_revisions_no_update"],
  ["0005_event_revisions_no_delete.sql", "trg_event_revisions_no_delete"],
  ["0006_event_sources_no_update.sql", "trg_event_sources_no_update"],
  ["0007_event_sources_no_delete.sql", "trg_event_sources_no_delete"],
  ["0008_decision_snapshots_no_update.sql", "trg_decision_snapshots_no_update"],
  ["0009_decision_snapshots_no_delete.sql", "trg_decision_snapshots_no_delete"],
]);

const localMigrationDirectory = "migrations";
const localMigrationFiles = readdirSync(localMigrationDirectory)
  .filter(name => /^\d+.*\.sql$/.test(name))
  .sort();

for (const name of localMigrationFiles) {
  const sql = readFileSync(join(localMigrationDirectory, name), "utf8");
  assert(
    !/\b(?:BEGIN\s+TRANSACTION|SAVEPOINT|COMMIT|ROLLBACK)\b/i.test(sql),
    `local SQLite migration must not contain explicit transaction control: ${name}`,
  );
  const triggerCount = sql.match(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS/gi)?.length ?? 0;
  assert(triggerCount <= 1, `local SQLite migration must contain at most one trigger: ${name}`);
}

for (const [name, trigger] of expectedTriggerMigrations) {
  const sql = readFileSync(join(localMigrationDirectory, name), "utf8");
  assert(sql.includes(`TRIGGER IF NOT EXISTS ${trigger}`), `missing local SQLite guard trigger: ${trigger}`);
  const triggerCount = sql.match(/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS/gi)?.length ?? 0;
  assert.equal(triggerCount, 1, `local SQLite trigger migration must contain exactly one trigger: ${name}`);
}

const guardMarkerMigration = readFileSync("migrations/0010_revision_guards_marker.sql", "utf8");
assert(guardMarkerMigration.includes("0002_market_event_revision_guards"), "missing local revision-guard migration marker");
assert(!/CREATE\s+TRIGGER/i.test(guardMarkerMigration), "local revision-guard marker must not define a trigger");

const remoteMigrationDirectory = "migrations/d1";
const remoteMigrationFiles = readdirSync(remoteMigrationDirectory)
  .filter(name => /^\d+.*\.sql$/.test(name))
  .sort();
assert.deepEqual(remoteMigrationFiles, [
  "0001_market_event_foundation.sql",
  "0002_d1_readonly_mode.sql",
]);

for (const name of remoteMigrationFiles) {
  const sql = readFileSync(join(remoteMigrationDirectory, name), "utf8");
  assert(!/^\s*--/m.test(sql), `remote D1 migration must not contain line comments: ${name}`);
  assert(
    !/\b(?:BEGIN\s+TRANSACTION|SAVEPOINT|COMMIT|ROLLBACK)\b/i.test(sql),
    `remote D1 migration must not contain explicit transaction control: ${name}`,
  );
  assert(!/CREATE\s+TRIGGER/i.test(sql), `remote D1 migration must remain trigger-free: ${name}`);
}

const remoteFoundationMigration = readFileSync("migrations/d1/0001_market_event_foundation.sql", "utf8");
assert.equal(remoteFoundationMigration, foundationMigration, "remote D1 foundation must match the already-applied 0001 migration");
const remoteModeMigration = readFileSync("migrations/d1/0002_d1_readonly_mode.sql", "utf8");
assert(remoteModeMigration.includes("0002_d1_readonly_no_trigger_mode"), "missing remote D1 read-only mode marker");

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
assert(wranglerExample.includes("REPLACE_AFTER_D1_CREATION"));
assert(wranglerExample.includes('"binding": "DB"'));
assert(wranglerExample.includes('"migrations_dir": "migrations/d1"'));
assert(!wranglerExample.includes('"CALENDAR_FEED_TOKEN":'), "calendar bearer token must be a secret, not wrangler vars");

const bootstrapScript = readFileSync("scripts/bootstrap-cloudflare-d1.sh", "utf8");
assert(bootstrapScript.includes('REMOTE_MIGRATION_DIR="migrations/d1"'), "D1 bootstrap must use the remote migration directory");
assert(bootstrapScript.includes("must remain trigger-free"), "D1 bootstrap must reject remote trigger migrations");
assert(bootstrapScript.includes("--apply"), "D1 remote writes must require explicit --apply");

const workerFirstRoutes = [
  "/api/market-events*",
  "/api/calendar-feed-url*",
  "/calendar.ics*",
  "/healthz*",
];
console.log(JSON.stringify({
  status: "READY_PENDING_WORKERS_DEPLOYMENT",
  requiredFiles: requiredFiles.length,
  workerFirstRoutes,
  transitionalPagesRoutes: routes.include,
  validatedSeedFiles: files.length,
  validatedSeedInputs: inputCount,
  validatedLocalMigrations: localMigrationFiles.length,
  validatedRemoteMigrations: remoteMigrationFiles.length,
  validatedLocalGuardTriggers: expectedTriggerMigrations.size,
  remoteD1WriteMode: "READ_ONLY_NO_TRIGGERS",
  remainingExternalSteps: [
    "Merge the Workers migration PR",
    "Redeploy the existing alpha-pon Worker from main",
    "Create D1 database and bind it as DB",
    "Apply every remote D1 migration and bootstrap SQL",
    "Set OWNER_EMAIL and PUBLIC_ORIGIN runtime variables",
    "Set encrypted CALENDAR_FEED_TOKEN",
    "Configure Cloudflare Access and narrow calendar.ics bypass",
  ],
}, null, 2));
