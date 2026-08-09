import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import type { SanrioRealPilotPreflightResult } from "./edinet-sanrio-real-pilot-preflight.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_JSON_BYTES = 30 * 1024 * 1024;
type JsonObject = Record<string, unknown>;

type LocalRecord = {
  path: string;
  relativePath: string;
  record: JsonObject;
};

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function hash(value: unknown, field: string): string {
  const result = text(value);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function readSelected(root: string, relativePath: string, field: string): LocalRecord {
  const path = resolve(root, relativePath);
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`${field} escaped EDINET root`);
  }
  const linkStat = lstatSync(path);
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
  const fileStat = statSync(path);
  if (fileStat.size <= 0 || fileStat.size > MAX_JSON_BYTES) {
    throw new Error(`${field} size is invalid`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
  return {
    path,
    relativePath: rel.replace(/\\/g, "/"),
    record: object(parsed, field),
  };
}

function verifyComparison(record: JsonObject): string {
  const issuer = object(record.issuer, "configuredComparison.issuer");
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || text(issuer.issuerKey) !== "sanrio"
    || text(issuer.edinetCode) !== "E02655"
    || text(issuer.secCode) !== "81360"
    || record.comparisonStatus !== "complete_exact_normalized_comparison"
    || record.reviewStatus !== "pending_human_comparison_review"
    || record.fuzzyMatchingUsed !== false
    || record.semanticEquivalenceInferred !== false
    || record.officialPdfVisualReviewComplete !== false
    || record.automaticEquivalenceDecisionAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("configuredComparison safety boundary is invalid");
  }
  const expected = hash(record.reportHash, "configuredComparison.reportHash");
  const { reportHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) {
    throw new Error("configuredComparison.reportHash mismatch");
  }
  return expected;
}

function verifyHumanInput(
  record: JsonObject,
  inputPath: string,
  comparisonPath: string,
  comparisonHash: string,
): void {
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || record.reviewStatus !== "draft_human_input"
    || record.automaticFactPromotionAuthorized !== false
    || record.automaticImpactDecisionAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("configuredHumanReviewInput safety boundary is invalid");
  }
  if (dirname(inputPath) !== dirname(comparisonPath)) {
    throw new Error("configuredHumanReviewInput must share acquisition directory with configuredComparison");
  }
  if (text(record.sourceComparisonFile) !== basename(comparisonPath)) {
    throw new Error("configuredHumanReviewInput.sourceComparisonFile mismatch");
  }
  if (hash(record.sourceComparisonHash, "configuredHumanReviewInput.sourceComparisonHash") !== comparisonHash) {
    throw new Error("configuredHumanReviewInput.sourceComparisonHash mismatch");
  }
  const expected = hash(record.recordHash, "configuredHumanReviewInput.recordHash");
  const { recordHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) {
    throw new Error("configuredHumanReviewInput.recordHash mismatch");
  }
}

export function assertSanrioConfiguredAdvisoryIntegrity(
  result: SanrioRealPilotPreflightResult,
  edinetRoot: string,
): void {
  const selected = result.selectedFiles;
  if (!selected.configuredComparison && !selected.configuredHumanReviewInput) return;
  if (!selected.configuredComparison) {
    throw new Error("configuredHumanReviewInput selected without configuredComparison");
  }

  const root = resolve(edinetRoot);
  const comparison = readSelected(root, selected.configuredComparison, "configuredComparison");
  const comparisonHash = verifyComparison(comparison.record);

  if (selected.configuredHumanReviewInput) {
    const input = readSelected(root, selected.configuredHumanReviewInput, "configuredHumanReviewInput");
    verifyHumanInput(input.record, input.path, comparison.path, comparisonHash);
  }
}
