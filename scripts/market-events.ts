import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEventId, type MarketEventPriority } from "../src/market-events/contracts.js";
import {
  buildMarketEventBundle,
  type MarketEventRegistrationInput,
  type MarketEventRegistrationContext,
} from "../src/market-events/registration.js";
import {
  DEFAULT_MARKET_EVENT_DB_PATH,
  auditMarketEventDatabase,
  getNextRevisionContext,
  listMarketEvents,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";
import {
  DEFAULT_MARKET_EVENT_ICS_PATH,
  DEFAULT_MARKET_EVENT_JSON_PATH,
  buildMarketEventGeneratedData,
  writeMarketEventArtifacts,
} from "../src/market-events/projection.js";

type ParsedArguments = {
  command: string;
  flags: Map<string, string | boolean>;
};

function parseArguments(argv: string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return { command, flags };
}

function stringFlag(flags: ParsedArguments["flags"], key: string, fallback?: string): string | undefined {
  const value = flags.get(key);
  if (value === undefined) return fallback;
  if (value === true) throw new Error(`--${key} requires a value`);
  return value;
}

function booleanFlag(flags: ParsedArguments["flags"], key: string): boolean {
  return flags.get(key) === true || flags.get(key) === "true";
}

function numberFlag(flags: ParsedArguments["flags"], key: string, fallback: number): number {
  const value = stringFlag(flags, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${key} must be a positive integer`);
  return parsed;
}

function databasePath(flags: ParsedArguments["flags"]): string {
  return stringFlag(flags, "db", DEFAULT_MARKET_EVENT_DB_PATH) as string;
}

function readRegistrationInputs(path: string): MarketEventRegistrationInput[] {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Input file not found: ${resolved}`);
  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  const inputs = Array.isArray(parsed) ? parsed : [parsed];
  if (inputs.length === 0) throw new Error("Input file contains no events");
  return inputs as MarketEventRegistrationInput[];
}

function help(): void {
  console.log(`Alpha Pon market event CLI

Commands:
  init --write [--db path]
  add --file event.json [--write] [--db path]
  list [--db path] [--from ISO] [--to ISO] [--priority S0,S1] [--limit 100]
  generate --write [--db path] [--json path] [--ics path]
  audit [--db path]

Safety:
  init/add/generate are dry-run unless --write is supplied.
  No command sends notifications, creates Cloudflare resources, or modifies Google Calendar.
`);
}

function dryRunContexts(inputs: MarketEventRegistrationInput[]): Map<string, MarketEventRegistrationContext> {
  const contexts = new Map<string, MarketEventRegistrationContext>();
  for (const input of inputs) {
    const eventId = buildEventId(input);
    const existing = contexts.get(eventId);
    contexts.set(eventId, existing
      ? {
          revisionNumber: existing.revisionNumber + 1,
          previousRevisionId: existing.previousRevisionId,
          existingCreatedAt: existing.existingCreatedAt,
        }
      : { revisionNumber: 1, previousRevisionId: null, existingCreatedAt: null });
  }
  return contexts;
}

function commandInit(args: ParsedArguments): void {
  const path = databasePath(args.flags);
  if (!booleanFlag(args.flags, "write")) {
    console.log(JSON.stringify({ mode: "dry-run", command: "init", databasePath: path }, null, 2));
    return;
  }
  const db = openMarketEventDatabase({ path });
  try {
    console.log(JSON.stringify({ mode: "write", command: "init", databasePath: path, audit: auditMarketEventDatabase(db, path) }, null, 2));
  } finally {
    db.close();
  }
}

function commandAdd(args: ParsedArguments): void {
  const file = stringFlag(args.flags, "file");
  if (!file) throw new Error("add requires --file");
  const inputs = readRegistrationInputs(file);
  const path = databasePath(args.flags);
  const write = booleanFlag(args.flags, "write");

  if (!write) {
    const contexts = dryRunContexts(inputs);
    const bundles = inputs.map(input => {
      const eventId = buildEventId(input);
      const context = contexts.get(eventId);
      if (!context) throw new Error(`Missing dry-run context for ${eventId}`);
      const bundle = buildMarketEventBundle(input, context);
      context.previousRevisionId = bundle.revision.revisionId;
      return bundle;
    });
    console.log(JSON.stringify({
      mode: "dry-run",
      command: "add",
      databasePath: path,
      count: bundles.length,
      events: bundles.map(bundle => ({
        eventId: bundle.event.eventId,
        revisionId: bundle.revision.revisionId,
        title: bundle.event.title,
        status: bundle.event.status,
        priority: bundle.event.priority,
        sourceCount: bundle.sources.length,
        deliveryCount: bundle.deliveries.length,
      })),
    }, null, 2));
    return;
  }

  const db = openMarketEventDatabase({ path });
  try {
    const registered = [];
    for (const input of inputs) {
      const eventId = buildEventId(input);
      const context = getNextRevisionContext(db, eventId);
      const bundle = buildMarketEventBundle(input, context);
      registerMarketEventBundle(db, bundle);
      registered.push({ eventId, revisionId: bundle.revision.revisionId, revisionNumber: bundle.revision.revisionNumber });
    }
    console.log(JSON.stringify({
      mode: "write",
      command: "add",
      databasePath: path,
      registered,
      audit: auditMarketEventDatabase(db, path),
    }, null, 2));
  } finally {
    db.close();
  }
}

function commandList(args: ParsedArguments): void {
  const path = databasePath(args.flags);
  if (!existsSync(path)) throw new Error(`Database not found: ${path}. Run init --write first.`);
  const db = openMarketEventDatabase({ path, readonly: true });
  try {
    const priorities = stringFlag(args.flags, "priority")?.split(",").map(value => value.trim()).filter(Boolean) as MarketEventPriority[] | undefined;
    const events = listMarketEvents(db, {
      from: stringFlag(args.flags, "from"),
      to: stringFlag(args.flags, "to"),
      priorities,
      includeCancelled: booleanFlag(args.flags, "include-cancelled"),
      limit: numberFlag(args.flags, "limit", 100),
    });
    console.log(JSON.stringify({ databasePath: path, count: events.length, events }, null, 2));
  } finally {
    db.close();
  }
}

function commandGenerate(args: ParsedArguments): void {
  const path = databasePath(args.flags);
  if (!existsSync(path)) throw new Error(`Database not found: ${path}. Run init --write first.`);
  const db = openMarketEventDatabase({ path, readonly: true });
  try {
    const jsonPath = stringFlag(args.flags, "json", DEFAULT_MARKET_EVENT_JSON_PATH) as string;
    const icsPath = stringFlag(args.flags, "ics", DEFAULT_MARKET_EVENT_ICS_PATH) as string;
    if (!booleanFlag(args.flags, "write")) {
      const result = buildMarketEventGeneratedData(db, { databasePath: path });
      console.log(JSON.stringify({
        mode: "dry-run",
        command: "generate",
        databasePath: path,
        jsonPath,
        icsPath,
        summary: result.data.summary,
        icsBytes: Buffer.byteLength(result.ics),
      }, null, 2));
      return;
    }
    const data = writeMarketEventArtifacts(db, { jsonPath, icsPath, databasePath: path });
    console.log(JSON.stringify({
      mode: "write",
      command: "generate",
      databasePath: path,
      jsonPath,
      icsPath,
      summary: data.summary,
    }, null, 2));
  } finally {
    db.close();
  }
}

function commandAudit(args: ParsedArguments): void {
  const path = databasePath(args.flags);
  if (!existsSync(path)) throw new Error(`Database not found: ${path}. Run init --write first.`);
  const db = openMarketEventDatabase({ path, readonly: true });
  try {
    const report = auditMarketEventDatabase(db, path);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "ok") process.exitCode = 2;
  } finally {
    db.close();
  }
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  switch (args.command) {
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    case "init":
      commandInit(args);
      return;
    case "add":
      commandAdd(args);
      return;
    case "list":
      commandList(args);
      return;
    case "generate":
      commandGenerate(args);
      return;
    case "audit":
      commandAudit(args);
      return;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
