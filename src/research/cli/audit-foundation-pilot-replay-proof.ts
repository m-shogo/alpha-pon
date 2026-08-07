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
  auditFoundationPilotReplayProof,
  renderFoundationPilotReplayProofAudit,
  type FoundationPilotProofRun,
} from "../foundation-pilot-replay-proof.js";

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

function proofRunPath(name: string): string {
  const raw = requiredArg(name);
  const path = resolve(process.cwd(), raw);
  const reportsDir = resolve(process.cwd(), "reports");
  if (
    dirname(path) !== reportsDir
    || !/^foundation-pilot-proof-run\.[A-Za-z0-9._-]+\.\d{8}T\d{6}Z\.json$/.test(basename(path))
  ) {
    throw new Error(`--${name} must be a proof-run JSON directly under reports/`);
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
  if (!hasFlag("execute-proof-audit")) {
    throw new Error("--execute-proof-audit is required; no proof audit was executed");
  }
  const baselinePath = proofRunPath("same-input-baseline");
  const rerunPath = proofRunPath("same-input-rerun");
  const historicalBaselinePath = proofRunPath("historical-baseline");
  const historicalPostPath = proofRunPath("historical-post-correction");
  const sameInputBaseline = parseJson<FoundationPilotProofRun>(baselinePath, "same-input baseline");
  const sameInputRerun = parseJson<FoundationPilotProofRun>(rerunPath, "same-input rerun");
  const historicalBaseline = parseJson<FoundationPilotProofRun>(historicalBaselinePath, "historical baseline");
  const historicalPostCorrection = parseJson<FoundationPilotProofRun>(historicalPostPath, "historical post-correction");
  const correctionRevisionId = requiredArg("correction-revision-id");
  const issuerEntityId = requiredArg("issuer-entity-id");
  const revisionStorePath = resolve(process.cwd(), DOCUMENT_REVISION_DIFF_PATHS.revisions);
  const witnesses = parseRevisionStore(revisionStorePath).filter(record => record.documentRevisionId === correctionRevisionId);
  if (witnesses.length !== 1) {
    throw new Error(`correction revision ${correctionRevisionId} must resolve to exactly one canonical record; found ${witnesses.length}`);
  }
  const generatedAt = new Date();
  const audit = auditFoundationPilotReplayProof({
    target: {
      candidateId: sameInputBaseline.decision.candidateId,
      listedSecurityEntityId: sameInputBaseline.decision.listedSecurityEntityId,
      issuerEntityId,
      informationCutoff: sameInputBaseline.decision.informationCutoff,
    },
    sameInputBaseline,
    sameInputRerun,
    historicalBaseline,
    historicalPostCorrection,
    correctionWitness: witnesses[0]!,
    generatedAt: generatedAt.toISOString(),
  });
  const reportsDir = resolve(process.cwd(), "reports");
  const token = stamp(generatedAt);
  const jsonPath = resolve(reportsDir, `foundation-pilot-replay-proof-audit.${token}.json`);
  const mdPath = resolve(reportsDir, `foundation-pilot-replay-proof-audit.${token}.md`);
  if (dirname(jsonPath) !== reportsDir || dirname(mdPath) !== reportsDir) throw new Error("proof audit output escaped reports directory");
  writeExclusive(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  writeExclusive(mdPath, renderFoundationPilotReplayProofAudit(audit));

  console.log("Foundation pilot replay proof audit");
  console.log(`sameInput.machineStatus: ${audit.sameInput.machineStatus}`);
  console.log(`correctionCutoff.machineStatus: ${audit.correctionCutoff.machineStatus}`);
  console.log(`machineProofStatus: ${audit.machineProofStatus}`);
  console.log(`proofHash: ${audit.proofHash}`);
  console.log(`audit JSON: ${jsonPath}`);
  console.log(`audit Markdown: ${mdPath}`);
  console.log(`realLocalExecutionConfirmed: ${audit.realLocalExecutionConfirmed}`);
  console.log(`deterministicReplayProven: ${audit.deterministicReplayProven}`);
  console.log(`correctionCutoffImmutabilityProven: ${audit.correctionCutoffImmutabilityProven}`);
  console.log(`milestoneGreenAuthorized: ${audit.milestoneGreenAuthorized}`);
  console.log(`automaticTradingAuthorized: ${audit.automaticTradingAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation replay proof audit error";
  console.error(`Foundation pilot replay proof audit failed: ${message}`);
  process.exitCode = 1;
}
