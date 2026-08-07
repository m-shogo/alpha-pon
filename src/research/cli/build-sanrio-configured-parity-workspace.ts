import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import {
  buildSanrioLegacyConfiguredParityWorkspace,
  renderSanrioLegacyConfiguredParityWorkspace,
} from "../edinet-sanrio-configured-parity-workspace.js";
import {
  canonicalSanrioLegacyHumanReviewFilenameKind,
  SANRIO_LEGACY_HUMAN_REVIEW_FILENAME_PATTERN,
} from "../edinet-sanrio-parity-local-paths.js";

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

function resolveInventoryAudit(input: string): string {
  const path = resolve(process.cwd(), input);
  if (
    dirname(path) !== localRoot()
    || !/^sanrio-edinet-inventory-compatibility-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("inventory audit must be data/edinet/sanrio-edinet-inventory-compatibility-v1.*.json");
  }
  assertDirectory(localRoot(), "data/edinet");
  assertRegularNonSymlink(path, "inventory audit");
  bounded(path, "inventory audit");
  return path;
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

function relativeToEdinet(path: string): string {
  const result = relative(localRoot(), path).replace(/\\/g, "/");
  if (!result || result.startsWith("../") || result.includes("/../")) throw new Error("path escaped data/edinet");
  return result;
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
  const inventoryInput = argValue("inventory-audit")?.trim();
  const legacyInput = argValue("legacy-review")?.trim();
  const configuredInput = argValue("configured-review")?.trim();
  if (!inventoryInput || !legacyInput || !configuredInput) {
    throw new Error("--inventory-audit, --legacy-review and --configured-review are required");
  }
  const inventoryPath = resolveInventoryAudit(inventoryInput);
  const legacyPath = resolveAcquisitionFile(
    legacyInput,
    SANRIO_LEGACY_HUMAN_REVIEW_FILENAME_PATTERN,
    "legacy review",
  );
  const configuredPath = resolveAcquisitionFile(
    configuredInput,
    /^configured-human-comparison-record-v1\.[A-Za-z0-9_-]+\.json$/,
    "configured review",
  );
  const legacyFilenameKind = canonicalSanrioLegacyHumanReviewFilenameKind(basename(legacyPath));
  if (!legacyFilenameKind) throw new Error("legacy review filename kind is unsupported");

  const generatedAt = new Date();
  const workspace = buildSanrioLegacyConfiguredParityWorkspace({
    inventoryAudit: parseJson(inventoryPath, "inventory audit"),
    sourceInventoryAuditFile: basename(inventoryPath),
    legacyReview: parseJson(legacyPath, "legacy review"),
    sourceLegacyReviewPath: relativeToEdinet(legacyPath),
    configuredReview: parseJson(configuredPath, "configured review"),
    sourceConfiguredReviewPath: relativeToEdinet(configuredPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const outputDirectory = dirname(configuredPath);
  const jsonPath = resolve(outputDirectory, `legacy-configured-parity-workspace-v1.${token}.json`);
  const markdownPath = resolve(outputDirectory, `legacy-configured-parity-workspace-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(workspace, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioLegacyConfiguredParityWorkspace(workspace));

  console.log("Sanrio legacy/configured EDINET parity workspace");
  console.log(`legacy review filename kind: ${legacyFilenameKind}`);
  console.log(`shared documents: ${workspace.sharedDocumentCount}`);
  console.log(`legacy/configured anchors: ${workspace.legacyAnchorCount}/${workspace.configuredAnchorCount}`);
  console.log(`legacy exact hash matches: ${workspace.legacyAnchorsWithExactHashMatch}`);
  console.log(`configured exact hash matches: ${workspace.configuredAnchorsWithExactHashMatch}`);
  console.log(`workspace: ${jsonPath}`);
  console.log(`review: ${markdownPath}`);
  console.log(`workspaceHash: ${workspace.workspaceHash}`);
  console.log(`machineStatus: ${workspace.machineStatus}`);
  console.log(`semanticEquivalenceInferred: ${workspace.semanticEquivalenceInferred}`);
  console.log(`replacementAuthorized: ${workspace.replacementAuthorized}`);
  console.log(`appendAuthorized: ${workspace.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Sanrio parity workspace error";
  console.error(`Sanrio configured parity workspace failed: ${message}`);
  process.exitCode = 1;
}
