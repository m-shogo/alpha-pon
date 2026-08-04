import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildEventId } from "../src/market-events/contracts.js";
import {
  buildD1SyncApplySql,
  buildD1SyncPlan,
  D1_SYNC_COLUMNS,
  D1_SYNC_TABLES,
  type D1SyncRow,
  type D1SyncSnapshot,
  type D1SyncTable,
} from "../src/market-events/d1-sync.js";
import {
  buildMarketEventBundle,
  type MarketEventRegistrationInput,
} from "../src/market-events/registration.js";
import {
  auditMarketEventDatabase,
  getNextRevisionContext,
  openMarketEventDatabase,
  registerMarketEventBundle,
  type MarketEventDatabase,
} from "../src/market-events/sqlite-store.js";

type Flags = Map<string, string | boolean>;

type CliOptions = {
  database: string;
  apply: boolean;
  outDir: string;
  wranglerVersion: string;
  remoteSnapshotPath: string | null;
};

function parseFlags(argv: string[]): Flags {
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) {
      flags.set(key, inline);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return flags;
}

function stringFlag(flags: Flags, key: string, fallback?: string): string | undefined {
  const value = flags.get(key);
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`--${key} requires a value`);
  return value;
}

function booleanFlag(flags: Flags, key: string): boolean {
  return flags.get(key) === true || flags.get(key) === "true";
}

function options(argv: string[]): CliOptions {
  const flags = parseFlags(argv);
  return {
    database: stringFlag(flags, "database", "alpha-pon-market-events") as string,
    apply: booleanFlag(flags, "apply"),
    outDir: resolve(stringFlag(flags, "out-dir", "artifacts/cloudflare-d1-sync") as string),
    wranglerVersion: stringFlag(flags, "wrangler-version", "4.118.0") as string,
    remoteSnapshotPath: stringFlag(flags, "remote-snapshot")
      ? resolve(stringFlag(flags, "remote-snapshot") as string)
      : null,
  };
}

function usage(): void {
  console.log(`Alpha Pon Cloudflare D1 market-event sync

Usage:
  node --import tsx/esm scripts/sync-cloudflare-d1-market-events.ts [options]

Options:
  --database <name>          Remote D1 database (default: alpha-pon-market-events)
  --out-dir <path>           Diff/SQL/backup artifact directory
  --remote-snapshot <json>   Offline fixture instead of querying Cloudflare
  --wrangler-version <ver>   Pinned Wrangler version (default: 4.118.0)
  --apply                    Export a backup, then apply append/upsert SQL

Safety:
  Default mode is dry-run. No destructive DELETE is generated.
  Public Worker routes are never used for writes.
  --apply is rejected with --remote-snapshot.
`);
}

function readInputs(path: string): MarketEventRegistrationInput[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  if (!values.length) throw new Error(`No market events in ${path}`);
  return values as MarketEventRegistrationInput[];
}

function snapshotDatabase(db: MarketEventDatabase): D1SyncSnapshot {
  const snapshot = {
    market_events: [],
    event_sources: [],
    event_revisions: [],
    decision_snapshots: [],
    triggers: 0,
    legacyGuardMarker: 0,
  } as D1SyncSnapshot;
  for (const table of D1_SYNC_TABLES) {
    const columns = D1_SYNC_COLUMNS[table];
    const orderBy = table === "event_revisions"
      ? "event_id, revision_number, revision_id"
      : columns[0];
    snapshot[table] = db.prepare(
      `SELECT ${columns.join(", ")} FROM ${table} ORDER BY ${orderBy}`,
    ).all() as D1SyncRow[];
  }
  snapshot.triggers = Number(
    (db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'trigger'").get() as { total: number }).total,
  );
  snapshot.legacyGuardMarker = Number(
    (db.prepare(
      "SELECT COUNT(*) AS total FROM schema_migrations WHERE version = '0002_market_event_revision_guards'",
    ).get() as { total: number }).total,
  );
  return snapshot;
}

function buildCanonicalSnapshot(): D1SyncSnapshot {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "alpha-pon-d1-sync-"));
  const databasePath = join(temporaryDirectory, "market-events.db");
  try {
    const db = openMarketEventDatabase({ path: databasePath });
    try {
      const files = readdirSync("config/market-events")
        .filter(name => name.endsWith(".json"))
        .sort()
        .map(name => join("config/market-events", name));
      if (!files.length) throw new Error("No canonical market-event JSON files found");
      for (const file of files) {
        for (const input of readInputs(file)) {
          const eventId = buildEventId(input);
          const context = getNextRevisionContext(db, eventId);
          registerMarketEventBundle(db, buildMarketEventBundle(input, context));
        }
      }
      const audit = auditMarketEventDatabase(db, databasePath);
      if (audit.status !== "ok") throw new Error(`Canonical market-event audit failed: ${JSON.stringify(audit)}`);
      const snapshot = snapshotDatabase(db);
      snapshot.triggers = 0;
      snapshot.legacyGuardMarker = 0;
      return snapshot;
    } finally {
      db.close();
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function runWrangler(args: string[], wranglerVersion: string, capture = true): string {
  const command = ["--yes", `wrangler@${wranglerVersion}`, ...args];
  try {
    return execFileSync("npx", command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    }) ?? "";
  } catch (error) {
    const stderr = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: string }).stderr ?? "")
      : "";
    throw new Error(`Wrangler command failed${stderr ? `: ${stderr.trim()}` : ""}`);
  }
}

function findResultRows(value: unknown): D1SyncRow[] | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rows = findResultRows(item);
      if (rows) return rows;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.results)) return record.results as D1SyncRow[];
  for (const item of Object.values(record)) {
    const rows = findResultRows(item);
    if (rows) return rows;
  }
  return null;
}

function queryRemoteRows(
  database: string,
  table: D1SyncTable,
  wranglerVersion: string,
): D1SyncRow[] {
  const columns = D1_SYNC_COLUMNS[table].join(", ");
  const orderBy = table === "event_revisions" ? "event_id, revision_number, revision_id" : D1_SYNC_COLUMNS[table][0];
  const output = runWrangler([
    "d1", "execute", database, "--remote", "--json",
    `--command=SELECT ${columns} FROM ${table} ORDER BY ${orderBy};`,
  ], wranglerVersion);
  const payload = JSON.parse(output) as unknown;
  const rows = findResultRows(payload);
  if (!rows) throw new Error(`Could not parse Wrangler JSON rows for ${table}`);
  return rows;
}

function queryRemoteState(database: string, wranglerVersion: string): D1SyncSnapshot {
  const snapshot = {
    market_events: [],
    event_sources: [],
    event_revisions: [],
    decision_snapshots: [],
    triggers: 0,
    legacyGuardMarker: 0,
  } as D1SyncSnapshot;
  for (const table of D1_SYNC_TABLES) snapshot[table] = queryRemoteRows(database, table, wranglerVersion);
  const output = runWrangler([
    "d1", "execute", database, "--remote", "--json",
    "--command=SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger') AS triggers, (SELECT COUNT(*) FROM schema_migrations WHERE version = '0002_market_event_revision_guards') AS legacy_guard_marker;",
  ], wranglerVersion);
  const rows = findResultRows(JSON.parse(output) as unknown);
  const row = rows?.[0];
  if (!row) throw new Error("Could not parse remote D1 safety state");
  snapshot.triggers = Number(row.triggers);
  snapshot.legacyGuardMarker = Number(row.legacy_guard_marker);
  return snapshot;
}

function readRemoteSnapshot(path: string): D1SyncSnapshot {
  if (!existsSync(path)) throw new Error(`Remote snapshot not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as D1SyncSnapshot;
}

function counts(snapshot: D1SyncSnapshot): Record<D1SyncTable, number> {
  return Object.fromEntries(D1_SYNC_TABLES.map(table => [table, snapshot[table].length])) as Record<D1SyncTable, number>;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function artifactTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main(): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }
  const cli = options(process.argv.slice(2));
  if (cli.apply && cli.remoteSnapshotPath) throw new Error("--apply cannot be used with --remote-snapshot");
  mkdirSync(cli.outDir, { recursive: true });

  const canonical = buildCanonicalSnapshot();
  const remote = cli.remoteSnapshotPath
    ? readRemoteSnapshot(cli.remoteSnapshotPath)
    : queryRemoteState(cli.database, cli.wranglerVersion);
  const plan = buildD1SyncPlan(canonical, remote);
  const sql = buildD1SyncApplySql(canonical);
  const sqlPath = join(cli.outDir, "market-events-sync.sql");
  const planPath = join(cli.outDir, "market-events-sync-plan.json");
  const canonicalPath = join(cli.outDir, "canonical-snapshot.json");
  const remotePath = join(cli.outDir, "remote-before.json");
  writeFileSync(sqlPath, sql, "utf8");
  writeJson(canonicalPath, canonical);
  writeJson(remotePath, remote);
  writeJson(planPath, {
    generatedAt: new Date().toISOString(),
    mode: cli.apply ? "apply" : "dry-run",
    database: cli.database,
    canonicalCounts: counts(canonical),
    remoteCounts: counts(remote),
    sqlSha256: createHash("sha256").update(sql).digest("hex"),
    plan,
  });

  console.log(JSON.stringify({
    mode: cli.apply ? "apply" : "dry-run",
    database: cli.database,
    artifacts: { planPath, sqlPath, canonicalPath, remotePath },
    canonicalCounts: counts(canonical),
    remoteCounts: counts(remote),
    plan: plan.summary,
    status: plan.status,
  }, null, 2));

  if (plan.status !== "ready") throw new Error(`D1 sync is blocked: ${plan.blockers.join("; ")}`);
  if (!cli.apply) {
    console.log("DRY_RUN_ONLY: no Cloudflare state changed.");
    return;
  }

  const backupPath = join(cli.outDir, `remote-backup-${artifactTimestamp()}.sql`);
  runWrangler([
    "d1", "export", cli.database, "--remote", "--yes", `--output=${backupPath}`,
  ], cli.wranglerVersion, false);
  if (!existsSync(backupPath)) throw new Error("Remote D1 export did not create a backup file; apply blocked");

  let applyError: Error | null = null;
  try {
    runWrangler([
      "d1", "execute", cli.database, "--remote", "--yes", `--file=${sqlPath}`,
    ], cli.wranglerVersion, false);
  } catch (error) {
    applyError = error instanceof Error ? error : new Error(String(error));
  }

  let remoteAfter: D1SyncSnapshot;
  try {
    remoteAfter = queryRemoteState(cli.database, cli.wranglerVersion);
  } catch (error) {
    throw new Error(
      `D1 apply outcome could not be verified after remote re-query failure. Backup: ${backupPath}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const postPlan = buildD1SyncPlan(canonical, remoteAfter);
  const afterPath = join(cli.outDir, "remote-after.json");
  const resultPath = join(cli.outDir, "market-events-sync-result.json");
  writeJson(afterPath, remoteAfter);
  writeJson(resultPath, {
    verifiedAt: new Date().toISOString(),
    database: cli.database,
    backupPath,
    applyCommandFailed: Boolean(applyError),
    remoteCounts: counts(remoteAfter),
    postPlan,
  });

  const unresolved = postPlan.summary.added + postPlan.summary.updated + postPlan.summary.collisions;
  if (applyError || postPlan.status !== "ready" || unresolved !== 0) {
    throw new Error(
      `D1 sync did not verify cleanly after re-query. No rollback assumption was made. Backup: ${backupPath}. Result: ${resultPath}`,
    );
  }
  console.log(JSON.stringify({
    result: "applied-and-verified",
    database: cli.database,
    backupPath,
    remoteCounts: counts(remoteAfter),
    removedCandidatesPreserved: postPlan.summary.removedCandidates,
    triggers: remoteAfter.triggers,
    legacyGuardMarker: remoteAfter.legacyGuardMarker,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
