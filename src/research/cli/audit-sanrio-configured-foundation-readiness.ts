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
  renderSanrioConfiguredFoundationReadinessAudit,
} from "../edinet-sanrio-foundation-readiness-audit.js";
import {
  auditSanrioConfiguredFoundationReadinessWithConfiguredDecisionConformance,
} from "../edinet-sanrio-foundation-readiness-configured-decision.js";

type JsonObject = Record<string, unknown>;
const MAX_JSON_BYTES = 30 * 1024 * 1024;

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

function resolveParityReview(input: string): string {
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !/^legacy-configured-parity-review-record-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error(
      "parity review must be data/edinet/sanrio-acquisition.*/legacy-configured-parity-review-record-v1.*.json",
    );
  }
  assertDirectory(directory, "parity review directory");
  assertRegularNonSymlink(path, "parity review");
  bounded(path, "parity review");
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

function edinetRelativeFile(value: unknown, expectedDirectory: string, pattern: RegExp, field: string): string {
  const relative = value === null || value === undefined ? "" : String(value).trim().replace(/\\/g, "/");
  if (!relative || relative.startsWith("/") || relative.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`${field} must be a safe data/edinet-relative path`);
  }
  const path = resolve(localRoot(), relative);
  if (dirname(path) !== expectedDirectory || !pattern.test(basename(path))) {
    throw new Error(`${field} does not resolve to the expected acquisition file`);
  }
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

function main(): void {
  const parityInput = argValue("parity-review")?.trim();
  if (!parityInput) throw new Error("--parity-review is required");
  if (!hasFlag("execute-readiness-audit")) {
    throw new Error("--execute-readiness-audit is required; no audit was executed");
  }
  const parityReviewPath = resolveParityReview(parityInput);
  const directory = dirname(parityReviewPath);
  const parityReview = object(parseJson(parityReviewPath, "parity review"), "parity review");
  const workspacePath = directChild(directory, parityReview.sourceWorkspaceFile, "source parity workspace");
  const workspace = object(parseJson(workspacePath, "source parity workspace"), "source parity workspace");
  const configuredReviewPath = edinetRelativeFile(
    workspace.sourceConfiguredReviewPath,
    directory,
    /^configured-human-comparison-record-v1\.[A-Za-z0-9_-]+\.json$/,
    "source configured review",
  );
  const generatedAt = new Date();
  const audit = auditSanrioConfiguredFoundationReadinessWithConfiguredDecisionConformance({
    parityReview,
    sourceParityReviewFile: basename(parityReviewPath),
    parityWorkspace: workspace,
    sourceParityWorkspaceFile: basename(workspacePath),
    configuredReview: parseJson(configuredReviewPath, "source configured review"),
    sourceConfiguredReviewFile: basename(configuredReviewPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `configured-foundation-readiness-audit-v1.${token}.json`);
  const markdownPath = resolve(directory, `configured-foundation-readiness-audit-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(audit, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioConfiguredFoundationReadinessAudit(audit));

  console.log("Sanrio configured Foundation readiness audit");
  console.log(`documents/anchors: ${audit.documentCount}/${audit.anchorCount}`);
  console.log(`missing Foundation fields: ${audit.missingFieldCount}`);
  console.log(`audit: ${jsonPath}`);
  console.log(`review: ${markdownPath}`);
  console.log(`auditHash: ${audit.auditHash}`);
  console.log(`readinessStatus: ${audit.readinessStatus}`);
  console.log(`foundationMappingGateReady: ${audit.foundationMappingGateReady}`);
  console.log(`automaticFieldSynthesisAuthorized: ${audit.automaticFieldSynthesisAuthorized}`);
  console.log(`replacementAuthorized: ${audit.replacementAuthorized}`);
  console.log(`foundationPreviewEligible: ${audit.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${audit.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation readiness audit error";
  console.error(`Sanrio configured Foundation readiness audit failed: ${message}`);
  process.exitCode = 1;
}
