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
  buildConfiguredEdinetHumanComparisonTemplate,
  finalizeConfiguredEdinetHumanComparisonReview,
  renderConfiguredEdinetHumanComparisonRecord,
} from "../edinet-configured-human-comparison-review.js";

type JsonObject = Record<string, unknown>;
const MAX_JSON_BYTES = 25 * 1024 * 1024;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function localRoot(): string {
  return resolve(process.cwd(), "data/edinet");
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${field} must be a regular non-symlink file`);
}

function assertDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${field} must be a regular non-symlink directory`);
}

function resolveLocalFile(input: string, pattern: RegExp, field: string): string {
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !pattern.test(basename(path))
  ) {
    throw new Error(`${field} must be inside data/edinet/<issuerKey>-acquisition.* with the expected filename`);
  }
  assertDirectory(directory, "acquisition directory");
  assertRegularNonSymlink(path, field);
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > MAX_JSON_BYTES) throw new Error(`${field} size is invalid`);
  return path;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as JsonObject;
}

function localBasename(value: unknown, field: string): string {
  const result = value === null || value === undefined ? "" : String(value).trim();
  if (!result || result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function directChild(directory: string, value: unknown, field: string): string {
  const path = resolve(directory, localBasename(value, field));
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  assertRegularNonSymlink(path, field);
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

function templateMode(comparisonInput: string): void {
  const comparisonPath = resolveLocalFile(
    comparisonInput,
    /^configured-fidelity-exact-comparison-v1\.[A-Za-z0-9_-]+\.json$/,
    "comparison report",
  );
  const generatedAt = new Date();
  const template = buildConfiguredEdinetHumanComparisonTemplate({
    comparisonReport: parseJson(comparisonPath, "comparison report"),
    sourceComparisonFile: basename(comparisonPath),
    generatedAt: generatedAt.toISOString(),
  });
  const directory = dirname(comparisonPath);
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `configured-human-comparison-input-v1.${token}.json`);
  const markdownPath = resolve(directory, `configured-human-comparison-input-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(template, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetHumanComparisonRecord(template));
  console.log("Configured EDINET human comparison review template");
  console.log(`documents/anchors: ${template.documentCount}/${template.anchorCount}`);
  console.log(`input: ${jsonPath}`);
  console.log(`guide: ${markdownPath}`);
  console.log(`recordHash: ${template.recordHash}`);
  console.log(`reviewStatus: ${template.reviewStatus}`);
  console.log(`foundationPreviewEligible: ${template.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${template.appendAuthorized}`);
}

function finalizeMode(reviewInput: string): void {
  const inputPath = resolveLocalFile(
    reviewInput,
    /^configured-human-comparison-input-v1\.[A-Za-z0-9_-]+\.json$/,
    "review input",
  );
  const edited = object(parseJson(inputPath, "review input"), "review input");
  const comparisonPath = directChild(dirname(inputPath), edited.sourceComparisonFile, "source comparison report");
  const generatedAt = new Date();
  const record = finalizeConfiguredEdinetHumanComparisonReview({
    comparisonReport: parseJson(comparisonPath, "source comparison report"),
    sourceComparisonFile: basename(comparisonPath),
    editedReviewInput: edited,
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(dirname(inputPath), `configured-human-comparison-record-v1.${token}.json`);
  const markdownPath = resolve(dirname(inputPath), `configured-human-comparison-record-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetHumanComparisonRecord(record));
  console.log("Configured EDINET human comparison review finalized");
  console.log(`reviewer: ${record.reviewer}`);
  console.log(`documents/anchors/completed: ${record.documentCount}/${record.anchorCount}/${record.completedAnchorCount}`);
  console.log(`record: ${jsonPath}`);
  console.log(`review: ${markdownPath}`);
  console.log(`recordHash: ${record.recordHash}`);
  console.log(`reviewStatus: ${record.reviewStatus}`);
  console.log(`automaticFactPromotionAuthorized: ${record.automaticFactPromotionAuthorized}`);
  console.log(`foundationPreviewEligible: ${record.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${record.appendAuthorized}`);
}

try {
  const comparison = argValue("comparison")?.trim();
  const finalize = argValue("finalize")?.trim();
  if (comparison && finalize) throw new Error("use either --comparison or --finalize, not both");
  if (comparison) templateMode(comparison);
  else if (finalize) finalizeMode(finalize);
  else throw new Error("--comparison or --finalize is required");
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown human comparison review error";
  console.error(`Configured EDINET human comparison review failed: ${message}`);
  process.exitCode = 1;
}
