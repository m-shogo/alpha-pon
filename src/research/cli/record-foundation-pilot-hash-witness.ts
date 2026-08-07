import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  buildFoundationPilotHashWitness,
  renderFoundationPilotHashWitness,
} from "../foundation-pilot-hash-witness.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredArg(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function reportsDir(): string {
  const path = resolve(process.cwd(), "reports");
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("reports must be a regular non-symlink directory");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      mkdirSync(path, { mode: 0o700 });
    } else {
      throw error;
    }
  }
  return path;
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
  if (!hasFlag("execute-hash-witness")) {
    throw new Error("--execute-hash-witness is required; no witness was recorded");
  }
  const generatedAt = new Date();
  const record = buildFoundationPilotHashWitness({
    target: {
      candidateId: requiredArg("candidate-id"),
      listedSecurityEntityId: requiredArg("listed-security-entity-id"),
      issuerEntityId: requiredArg("issuer-entity-id"),
      informationCutoff: requiredArg("information-cutoff"),
    },
    generatedAt: generatedAt.toISOString(),
    witnessedBy: requiredArg("witnessed-by"),
    witnessedAt: requiredArg("witnessed-at"),
    sameInputReplay: {
      baselineRunId: requiredArg("baseline-run-id"),
      rerunRunId: requiredArg("rerun-run-id"),
      baselineInputFingerprintHash: requiredArg("baseline-input-fingerprint-hash"),
      rerunInputFingerprintHash: requiredArg("rerun-input-fingerprint-hash"),
      baselineResultHash: requiredArg("baseline-result-hash"),
      rerunResultHash: requiredArg("rerun-result-hash"),
    },
    correctionCutoff: {
      historicalCutoff: requiredArg("historical-cutoff"),
      beforeCorrectionRunId: requiredArg("before-correction-run-id"),
      afterCorrectionRunId: requiredArg("after-correction-run-id"),
      beforeHistoricalResultHash: requiredArg("before-historical-result-hash"),
      afterHistoricalResultHash: requiredArg("after-historical-result-hash"),
      beforeCurrentRevisionHeadHash: requiredArg("before-current-revision-head-hash"),
      afterCurrentRevisionHeadHash: requiredArg("after-current-revision-head-hash"),
    },
  });

  const outputDir = reportsDir();
  const token = stamp(generatedAt);
  const jsonPath = resolve(outputDir, `foundation-pilot-hash-witness-v1.${token}.json`);
  const markdownPath = resolve(outputDir, `foundation-pilot-hash-witness-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeExclusive(markdownPath, renderFoundationPilotHashWitness(record));

  console.log("Foundation pilot hash witness");
  console.log(`same input replay: ${record.sameInputReplay.status}`);
  console.log(`correction cutoff: ${record.correctionCutoff.status}`);
  console.log(`witness status: ${record.witnessStatus}`);
  console.log(`json: ${jsonPath}`);
  console.log(`markdown: ${markdownPath}`);
  console.log(`contentHash: ${record.contentHash}`);
  console.log("realEvidenceProven: false");
  console.log("milestoneGreenAuthorized: false");
  console.log("automaticTradingAuthorized: false");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation pilot hash witness error";
  console.error(`Foundation pilot hash witness failed: ${message}`);
  process.exitCode = 1;
}
