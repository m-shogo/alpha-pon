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
import type { FoundationPilotHashWitnessConformanceAudit } from "../foundation-pilot-hash-witness-conformance.js";
import {
  buildFoundationPilotHumanReplayProofTemplate,
  finalizeFoundationPilotHumanReplayProof,
  renderFoundationPilotHumanReplayProof,
  type FoundationPilotHumanReplayProofRecord,
} from "../foundation-pilot-human-replay-proof.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REPORTS_DIR = resolve(process.cwd(), "reports");

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${field} must be a regular non-symlink file`);
  if (stat.size <= 0 || stat.size > MAX_FILE_BYTES) throw new Error(`${field} size is invalid`);
}

function directReportPath(raw: string, pattern: RegExp, field: string): string {
  const path = resolve(process.cwd(), raw);
  if (dirname(path) !== REPORTS_DIR || !pattern.test(basename(path))) {
    throw new Error(`${field} must be the expected JSON directly under reports/`);
  }
  assertRegularNonSymlink(path, field);
  return path;
}

function parseJson<T>(path: string, field: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
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

function writePair(prefix: string, date: Date, record: FoundationPilotHumanReplayProofRecord): void {
  const token = stamp(date);
  const jsonPath = resolve(REPORTS_DIR, `${prefix}.${token}.json`);
  const mdPath = resolve(REPORTS_DIR, `${prefix}.${token}.md`);
  if (dirname(jsonPath) !== REPORTS_DIR || dirname(mdPath) !== REPORTS_DIR) {
    throw new Error("human proof output escaped reports directory");
  }
  writeExclusive(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeExclusive(mdPath, renderFoundationPilotHumanReplayProof(record));
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
}

function templateMode(rawConformance: string): void {
  const conformancePath = directReportPath(
    rawConformance,
    /^foundation-pilot-hash-witness-conformance-v1\.\d{8}T\d{6}Z\.json$/,
    "conformance audit",
  );
  const conformance = parseJson<FoundationPilotHashWitnessConformanceAudit>(conformancePath, "conformance audit");
  const generatedAt = new Date();
  const template = buildFoundationPilotHumanReplayProofTemplate({
    conformance,
    sourceConformanceFile: basename(conformancePath),
    generatedAt: generatedAt.toISOString(),
  });
  console.log("Foundation pilot human replay proof template");
  console.log(`sourceConformanceHash: ${template.sourceConformanceHash}`);
  console.log(`reviewStatus: ${template.reviewStatus}`);
  console.log(`realLocalExecutionConfirmed: ${template.realLocalExecutionConfirmed}`);
  console.log(`milestoneGreenAuthorized: ${template.milestoneGreenAuthorized}`);
  writePair("foundation-pilot-human-replay-proof-input-v1", generatedAt, template);
}

function finalizeMode(rawInput: string): void {
  const inputPath = directReportPath(
    rawInput,
    /^foundation-pilot-human-replay-proof-input-v1\.\d{8}T\d{6}Z\.json$/,
    "human proof input",
  );
  const edited = parseJson<FoundationPilotHumanReplayProofRecord>(inputPath, "human proof input");
  const conformancePath = directReportPath(
    `reports/${edited.sourceConformanceFile}`,
    /^foundation-pilot-hash-witness-conformance-v1\.\d{8}T\d{6}Z\.json$/,
    "source conformance audit",
  );
  const conformance = parseJson<FoundationPilotHashWitnessConformanceAudit>(conformancePath, "source conformance audit");
  const generatedAt = new Date();
  const record = finalizeFoundationPilotHumanReplayProof({
    conformance,
    sourceConformanceFile: basename(conformancePath),
    editedReviewInput: edited,
    generatedAt: generatedAt.toISOString(),
  });
  console.log("Foundation pilot human replay proof finalized");
  console.log(`reviewer: ${record.reviewer}`);
  console.log(`reviewedAt: ${record.reviewedAt}`);
  console.log(`reviewStatus: ${record.reviewStatus}`);
  console.log(`realLocalExecutionConfirmed: ${record.realLocalExecutionConfirmed}`);
  console.log(`deterministicReplayProven: ${record.deterministicReplayProven}`);
  console.log(`correctionCutoffImmutabilityProven: ${record.correctionCutoffImmutabilityProven}`);
  console.log(`realEvidenceProven: ${record.realEvidenceProven}`);
  console.log(`milestoneGreenAuthorized: ${record.milestoneGreenAuthorized}`);
  console.log(`automaticTradingAuthorized: ${record.automaticTradingAuthorized}`);
  writePair("foundation-pilot-human-replay-proof-record-v1", generatedAt, record);
}

function main(): void {
  const finalInput = argValue("finalize")?.trim();
  const conformance = argValue("conformance")?.trim();
  if (finalInput && conformance) throw new Error("use either --conformance or --finalize, not both");
  if (finalInput) return finalizeMode(finalInput);
  if (conformance) return templateMode(conformance);
  throw new Error("--conformance or --finalize is required");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation human replay proof error";
  console.error(`Foundation pilot human replay proof failed: ${message}`);
  process.exitCode = 1;
}
