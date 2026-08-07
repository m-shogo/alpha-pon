import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  FOUNDATION_DECISION_PATHS,
  type FoundationDecisionIntegrationRecord,
} from "../foundation-decision-integration.js";
import { buildFoundationPilotProofRun } from "../foundation-pilot-replay-proof.js";

const MAX_STORE_BYTES = 25 * 1024 * 1024;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function requiredArg(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${field} must be a regular non-symlink file`);
  if (stat.size <= 0 || stat.size > MAX_STORE_BYTES) throw new Error(`${field} size is invalid`);
}

function parseDecisions(path: string): FoundationDecisionIntegrationRecord[] {
  assertRegularNonSymlink(path, "Foundation decision store");
  const content = readFileSync(path, "utf-8");
  if (!content.endsWith("\n")) throw new Error("Foundation decision store must end with newline");
  return content
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as FoundationDecisionIntegrationRecord;
      } catch {
        throw new Error(`Foundation decision store line ${index + 1} is invalid JSON`);
      }
    });
}

function safeToken(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/.test(value)) throw new Error(`${field} contains unsupported characters`);
  return value;
}

function writeExclusive(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function main(): void {
  if (!hasFlag("capture-proof-run")) {
    throw new Error("--capture-proof-run is required; no run observation was captured");
  }
  const decisionId = requiredArg("decision-id");
  const runId = safeToken(requiredArg("run-id"), "runId");
  const storePath = resolve(process.cwd(), FOUNDATION_DECISION_PATHS.records);
  const records = parseDecisions(storePath).filter(record => record.decisionId === decisionId);
  if (records.length !== 1) {
    throw new Error(`decisionId ${decisionId} must resolve to exactly one canonical decision record; found ${records.length}`);
  }
  const capturedAt = new Date();
  const run = buildFoundationPilotProofRun({
    runId,
    capturedAt: capturedAt.toISOString(),
    decision: records[0]!,
  });
  const reportsDir = resolve(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true, mode: 0o700 });
  const path = resolve(reportsDir, `foundation-pilot-proof-run.${runId}.${stamp(capturedAt)}.json`);
  if (dirname(path) !== reportsDir || basename(path) !== `foundation-pilot-proof-run.${runId}.${stamp(capturedAt)}.json`) {
    throw new Error("proof run output escaped reports directory");
  }
  writeExclusive(path, `${JSON.stringify(run, null, 2)}\n`);

  console.log("Foundation pilot proof run captured");
  console.log(`runId: ${run.runId}`);
  console.log(`decisionId: ${run.decisionId}`);
  console.log(`decisionContentHash: ${run.decisionContentHash}`);
  console.log(`decisionInputFingerprint: ${run.decisionInputFingerprint}`);
  console.log(`capturedAt: ${run.capturedAt}`);
  console.log(`proof run: ${path}`);
  console.log(`envelopeHash: ${run.envelopeHash}`);
  console.log(`automaticTradingAuthorized: ${run.automaticTradingAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation proof run capture error";
  console.error(`Foundation pilot proof run capture failed: ${message}`);
  process.exitCode = 1;
}
