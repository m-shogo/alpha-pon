import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  DOCUMENT_REVISION_DIFF_PATHS,
  type DocumentRevisionRecord,
} from "../document-revision-diff.js";
import {
  auditFoundationPilotHashWitnessConformance,
  renderFoundationPilotHashWitnessConformance,
  type FoundationPilotProofRun,
} from "../foundation-pilot-hash-witness-conformance.js";
import type { FoundationPilotHashWitnessRecord } from "../foundation-pilot-hash-witness.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

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
  if (stat.size <= 0 || stat.size > MAX_FILE_BYTES) throw new Error(`${field} size is invalid`);
}

function reportPath(name: string, pattern: RegExp): string {
  const raw = requiredArg(name);
  const path = resolve(process.cwd(), raw);
  const reportsDir = resolve(process.cwd(), "reports");
  if (dirname(path) !== reportsDir || !pattern.test(basename(path))) {
    throw new Error(`--${name} must be the expected JSON directly under reports/`);
  }
  assertRegularNonSymlink(path, name);
  return path;
}

function parseJson<T>(path: string, field: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function parseRevisionStore(path: string): DocumentRevisionRecord[] {
  assertRegularNonSymlink(path, "document revision store");
  const content = readFileSync(path, "utf-8");
  if (!content.endsWith("\n")) throw new Error("document revision store must end with newline");
  return content
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as DocumentRevisionRecord;
      } catch {
        throw new Error(`document revision store line ${index + 1} is invalid JSON`);
      }
    });
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
  if (!hasFlag("execute-conformance-audit")) {
    throw new Error("--execute-conformance-audit is required; no conformance audit was executed");
  }
  const witnessPath = reportPath(
    "hash-witness",
    /^foundation-pilot-hash-witness-v1\.\d{8}T\d{6}Z\.json$/,
  );
  const proofPattern = /^foundation-pilot-proof-run\.[A-Za-z0-9._-]+\.\d{8}T\d{6}Z\.json$/;
  const baselinePath = reportPath("same-input-baseline", proofPattern);
  const rerunPath = reportPath("same-input-rerun", proofPattern);
  const historicalBaselinePath = reportPath("historical-baseline", proofPattern);
  const historicalPostPath = reportPath("historical-post-correction", proofPattern);
  const witness = parseJson<FoundationPilotHashWitnessRecord>(witnessPath, "hash witness");
  const sameInputBaseline = parseJson<FoundationPilotProofRun>(baselinePath, "same-input baseline");
  const sameInputRerun = parseJson<FoundationPilotProofRun>(rerunPath, "same-input rerun");
  const historicalBaseline = parseJson<FoundationPilotProofRun>(historicalBaselinePath, "historical baseline");
  const historicalPostCorrection = parseJson<FoundationPilotProofRun>(historicalPostPath, "historical post-correction");

  const correctionRevisionId = requiredArg("correction-revision-id");
  const revisions = parseRevisionStore(resolve(process.cwd(), DOCUMENT_REVISION_DIFF_PATHS.revisions));
  const correctionMatches = revisions.filter(record => record.documentRevisionId === correctionRevisionId);
  if (correctionMatches.length !== 1) {
    throw new Error(`correction revision ${correctionRevisionId} must resolve to exactly one canonical record; found ${correctionMatches.length}`);
  }
  const correctionRevision = correctionMatches[0]!;
  if (!correctionRevision.supersedesRecordId) {
    throw new Error("correction revision must contain supersedesRecordId");
  }
  const priorMatches = revisions.filter(record => record.recordId === correctionRevision.supersedesRecordId);
  if (priorMatches.length !== 1) {
    throw new Error(`prior revision ${correctionRevision.supersedesRecordId} must resolve to exactly one canonical record; found ${priorMatches.length}`);
  }

  const generatedAt = new Date();
  const audit = auditFoundationPilotHashWitnessConformance({
    witness,
    sameInputBaseline,
    sameInputRerun,
    historicalBaseline,
    historicalPostCorrection,
    priorRevision: priorMatches[0]!,
    correctionRevision,
    generatedAt: generatedAt.toISOString(),
  });
  const reportsDir = resolve(process.cwd(), "reports");
  const token = stamp(generatedAt);
  const jsonPath = resolve(reportsDir, `foundation-pilot-hash-witness-conformance-v1.${token}.json`);
  const mdPath = resolve(reportsDir, `foundation-pilot-hash-witness-conformance-v1.${token}.md`);
  if (dirname(jsonPath) !== reportsDir || dirname(mdPath) !== reportsDir) {
    throw new Error("conformance output escaped reports directory");
  }
  writeExclusive(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  writeExclusive(mdPath, renderFoundationPilotHashWitnessConformance(audit));

  console.log("Foundation pilot hash witness conformance audit");
  console.log(`sourceWitnessHash: ${audit.sourceWitnessHash}`);
  console.log(`sameInput.status: ${audit.sameInput.status}`);
  console.log(`correctionCutoff.status: ${audit.correctionCutoff.status}`);
  console.log(`conformanceStatus: ${audit.conformanceStatus}`);
  console.log(`contentHash: ${audit.contentHash}`);
  console.log(`audit JSON: ${jsonPath}`);
  console.log(`audit Markdown: ${mdPath}`);
  console.log(`realLocalExecutionConfirmed: ${audit.realLocalExecutionConfirmed}`);
  console.log(`milestoneGreenAuthorized: ${audit.milestoneGreenAuthorized}`);
  console.log(`proofPromotionAuthorized: ${audit.proofPromotionAuthorized}`);
  console.log(`automaticTradingAuthorized: ${audit.automaticTradingAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation hash witness conformance error";
  console.error(`Foundation pilot hash witness conformance failed: ${message}`);
  process.exitCode = 1;
}
