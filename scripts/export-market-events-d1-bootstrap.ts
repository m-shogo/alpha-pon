import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildD1BootstrapExport } from "../src/market-events/d1-bootstrap-export.js";
import {
  DEFAULT_MARKET_EVENT_DB_PATH,
  auditMarketEventDatabase,
  openMarketEventDatabase,
} from "../src/market-events/sqlite-store.js";

type Flags = Map<string, string | boolean>;

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

function stringFlag(flags: Flags, key: string, fallback: string): string {
  const value = flags.get(key);
  if (value === undefined) return fallback;
  if (value === true) throw new Error(`--${key} requires a value`);
  return value;
}

function writeAtomically(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, content, "utf8");
  renameSync(temporaryPath, path);
}

const flags = parseFlags(process.argv.slice(2));
const dbPath = stringFlag(flags, "db", DEFAULT_MARKET_EVENT_DB_PATH);
const outputPath = stringFlag(flags, "out", "data/exports/market-events-d1-bootstrap.sql");
const write = flags.get("write") === true || flags.get("write") === "true";

if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
const db = openMarketEventDatabase({ path: dbPath, readonly: true });
try {
  const audit = auditMarketEventDatabase(db, dbPath);
  if (audit.status !== "ok") {
    throw new Error(`Database audit failed; bootstrap export blocked: ${JSON.stringify(audit)}`);
  }
  const result = buildD1BootstrapExport(db, { sourceDatabase: dbPath });
  if (write) writeAtomically(outputPath, result.sql);
  console.log(JSON.stringify({
    mode: write ? "write" : "dry-run",
    databasePath: dbPath,
    outputPath,
    sha256: result.sha256,
    bytes: Buffer.byteLength(result.sql),
    rowCounts: result.rowCounts,
  }, null, 2));
} finally {
  db.close();
}
