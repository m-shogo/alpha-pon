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
  buildSanrioParityHumanReviewTemplate,
  finalizeSanrioParityHumanReview,
  renderSanrioParityHumanReview,
} from "../edinet-sanrio-configured-parity-human-review.js";

type JsonObject = Record<string, unknown>;
const MAX_JSON_BYTES = 30 * 1024 * 1024;

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

function bounded(path: string, field: string): void {
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > MAX_JSON_BYTES) throw new Error(`${field} size is invalid`);
}

function resolveAcquisitionFile(input: string, pattern: RegExp, field: string): string {
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !pattern.test(basename(path))
  ) {
    throw new Error(`${field} must be inside data/edinet/sanrio-acquisition.* with the expected filename`);
  }
  assertDirectory(directory, `${field} directory`);
  assertRegularNonSymlink(path, field);
  bounded(path, field);
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
  bounded(path, field);
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

function templateMode(input: string): void {
  const workspacePath = resolveAcquisitionFile(
    input,
    /^legacy-configured-parity-workspace-v1\.[A-Za-z0-9_-]+\.json$/,
    "parity workspace",
  );
  const generatedAt = new Date();
  const review = buildSanrioParityHumanReviewTemplate({
    workspace: parseJson(workspacePath, "parity workspace"),
    sourceWorkspaceFile: basename(workspacePath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const directory = dirname(workspacePath);
  const jsonPath = resolve(directory, `legacy-configured-parity-review-input-v1.${token}.json`);
  const markdownPath = resolve(directory, `legacy-configured-parity-review-input-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(review, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioParityHumanReview(review));
  console.log("Sanrio legacy/configured parity human review template");
  console.log(`mappings/coverage: ${review.mappingCount}/${review.coverageCount}`);
  console.log(`input: ${jsonPath}`);
  console.log(`guide: ${markdownPath}`);
  console.log(`recordHash: ${review.recordHash}`);
  console.log(`reviewStatus: ${review.reviewStatus}`);
  console.log(`replacementAuthorized: ${review.replacementAuthorized}`);
  console.log(`appendAuthorized: ${review.appendAuthorized}`);
}

function finalizeMode(input: string): void {
  const inputPath = resolveAcquisitionFile(
    input,
    /^legacy-configured-parity-review-input-v1\.[A-Za-z0-9_-]+\.json$/,
    "parity review input",
  );
  const edited = object(parseJson(inputPath, "parity review input"), "parity review input");
  const workspacePath = directChild(dirname(inputPath), edited.sourceWorkspaceFile, "source parity workspace");
  const generatedAt = new Date();
  const record = finalizeSanrioParityHumanReview({
    workspace: parseJson(workspacePath, "source parity workspace"),
    sourceWorkspaceFile: basename(workspacePath),
    editedReviewInput: edited,
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const directory = dirname(inputPath);
  const jsonPath = resolve(directory, `legacy-configured-parity-review-record-v1.${token}.json`);
  const markdownPath = resolve(directory, `legacy-configured-parity-review-record-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioParityHumanReview(record));
  console.log("Sanrio legacy/configured parity human review finalized");
  console.log(`reviewer: ${record.reviewer}`);
  console.log(`mappings/coverage completed: ${record.completedMappingCount}/${record.mappingCount} ${record.completedCoverageCount}/${record.coverageCount}`);
  console.log(`recommendation: ${record.replacementRecommendation}`);
  console.log(`record: ${jsonPath}`);
  console.log(`review: ${markdownPath}`);
  console.log(`recordHash: ${record.recordHash}`);
  console.log(`reviewStatus: ${record.reviewStatus}`);
  console.log(`legacyEntryPointMutationAuthorized: ${record.legacyEntryPointMutationAuthorized}`);
  console.log(`replacementAuthorized: ${record.replacementAuthorized}`);
  console.log(`appendAuthorized: ${record.appendAuthorized}`);
}

try {
  const workspace = argValue("workspace")?.trim();
  const finalize = argValue("finalize")?.trim();
  if (workspace && finalize) throw new Error("use either --workspace or --finalize, not both");
  if (workspace) templateMode(workspace);
  else if (finalize) finalizeMode(finalize);
  else throw new Error("--workspace or --finalize is required");
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Sanrio parity human review error";
  console.error(`Sanrio parity human review failed: ${message}`);
  process.exitCode = 1;
}
