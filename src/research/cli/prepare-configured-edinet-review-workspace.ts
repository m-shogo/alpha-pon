import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildConfiguredEdinetReviewWorkspace,
  renderConfiguredEdinetReviewWorkspace,
  type ConfiguredEdinetVerifiedFile,
} from "../edinet-configured-review-workspace.js";

const MAX_METADATA_BYTES = 2 * 1024 * 1024;
type JsonObject = Record<string, unknown>;

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
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function assertDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${field} must be a regular non-symlink directory`);
  }
}

function manifestPath(): string {
  const input = argValue("manifest")?.trim();
  if (!input) throw new Error("--manifest is required");
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || basename(path) !== "acquisition-manifest.json"
  ) {
    throw new Error("manifest must be data/edinet/<issuerKey>-acquisition.*/acquisition-manifest.json");
  }
  assertDirectory(directory, "acquisition directory");
  assertRegularNonSymlink(path, "acquisition manifest");
  return path;
}

function registryPath(): string {
  const input = argValue("registry")?.trim() || "config/research/edinet-issuer-registry.v1.json";
  const path = resolve(process.cwd(), input);
  const root = resolve(process.cwd(), "config/research");
  if (!path.startsWith(`${root}/`) || !path.endsWith(".json")) {
    throw new Error("registry must be a JSON file under config/research");
  }
  assertRegularNonSymlink(path, "registry");
  return path;
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function directChild(directory: string, file: string, field: string): string {
  const name = localBasename(file, field);
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  assertRegularNonSymlink(path, field);
  return path;
}

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function metadataMatches(input: {
  metadata: JsonObject;
  manifest: JsonObject;
  success: JsonObject;
  task: JsonObject;
}): void {
  const issuer = object(input.manifest.issuer, "manifest.issuer");
  const expected: Record<string, unknown> = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: input.manifest.registryHash,
    issuerKey: issuer.issuerKey,
    boundaryHash: issuer.boundaryHash,
    sourceReviewPlanFile: input.manifest.sourceReviewPlanFile,
    sourceReviewPlanHash: input.manifest.sourceReviewPlanHash,
    acquisitionPlanHash: input.manifest.acquisitionPlanHash,
    docID: input.task.docID,
    documentType: input.task.documentType,
    format: input.task.format,
    reason: input.task.reason,
    sourceDocID: input.task.sourceDocID,
    parentOutsidePlan: false,
    byteLength: input.success.byteLength,
    sha256: input.success.sha256,
    retrievedAt: input.success.retrievedAt,
    executionMode: "explicit_local_command",
    storageBoundary: "local_only",
    appendAuthorized: false,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (JSON.stringify(input.metadata[field]) !== JSON.stringify(value)) {
      throw new Error(`metadata field ${field} does not match manifest lineage`);
    }
  }
  const sourceEndpoint = required(input.metadata.sourceEndpoint, "metadata.sourceEndpoint");
  if (sourceEndpoint.includes("Subscription-Key") || sourceEndpoint.includes("subscription-key")) {
    throw new Error("metadata sourceEndpoint contains a credential query parameter");
  }
}

async function verifyFiles(
  directory: string,
  manifest: JsonObject,
): Promise<ConfiguredEdinetVerifiedFile[]> {
  const results: ConfiguredEdinetVerifiedFile[] = [];
  for (const [index, value] of array(manifest.succeeded, "manifest.succeeded").entries()) {
    const success = object(value, `manifest.succeeded[${index}]`);
    const task = object(success.task, `manifest.succeeded[${index}].task`);
    const binaryPath = directChild(directory, success.binaryFile, `manifest.succeeded[${index}].binaryFile`);
    const metadataPath = directChild(directory, success.metadataFile, `manifest.succeeded[${index}].metadataFile`);
    const binaryStat = statSync(binaryPath);
    const expectedLength = Number(success.byteLength);
    if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0 || binaryStat.size !== expectedLength) {
      throw new Error(`binary byte length mismatch for ${basename(binaryPath)}`);
    }
    const binarySha256 = await sha256File(binaryPath);
    if (binarySha256 !== text(success.sha256)) {
      throw new Error(`binary SHA-256 mismatch for ${basename(binaryPath)}`);
    }
    const metadataStat = statSync(metadataPath);
    if (metadataStat.size <= 0 || metadataStat.size > MAX_METADATA_BYTES) {
      throw new Error(`metadata size is invalid for ${basename(metadataPath)}`);
    }
    const metadataBytes = readFileSync(metadataPath);
    let metadata: JsonObject;
    try {
      metadata = object(JSON.parse(metadataBytes.toString("utf-8")) as unknown, "metadata");
    } catch {
      throw new Error(`metadata is not valid JSON for ${basename(metadataPath)}`);
    }
    metadataMatches({ metadata, manifest, success, task });
    results.push({
      binaryFile: basename(binaryPath),
      metadataFile: basename(metadataPath),
      binarySha256,
      binaryByteLength: binaryStat.size,
      metadataSha256: sha256Bytes(metadataBytes),
      metadataByteLength: metadataStat.size,
    });
  }
  return results;
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

function mainPaths(manifest: JsonObject, directory: string): {
  reviewPlanPath: string;
  acquisitionPlanPath: string;
} {
  const reviewPlanFile = localBasename(manifest.sourceReviewPlanFile, "manifest.sourceReviewPlanFile");
  const reviewPlanPath = resolve(localRoot(), reviewPlanFile);
  if (dirname(reviewPlanPath) !== localRoot()) throw new Error("review plan escaped EDINET root");
  assertRegularNonSymlink(reviewPlanPath, "source review plan");
  const acquisitionPlanPath = directChild(directory, "acquisition-plan.json", "acquisition plan");
  return { reviewPlanPath, acquisitionPlanPath };
}

async function main(): Promise<void> {
  const sourceManifestPath = manifestPath();
  const directory = dirname(sourceManifestPath);
  const sourceRegistryPath = registryPath();
  const manifest = object(parseJson(sourceManifestPath, "acquisition manifest"), "acquisition manifest");
  const paths = mainPaths(manifest, directory);
  const verifiedFiles = await verifyFiles(directory, manifest);
  const workspace = buildConfiguredEdinetReviewWorkspace({
    registry: parseJson(sourceRegistryPath, "registry"),
    reviewPlan: parseJson(paths.reviewPlanPath, "source review plan"),
    acquisitionPlan: parseJson(paths.acquisitionPlanPath, "acquisition plan"),
    acquisitionManifest: manifest,
    verifiedFiles,
    sourceReviewPlanFile: basename(paths.reviewPlanPath),
    sourceAcquisitionPlanFile: basename(paths.acquisitionPlanPath),
    acquisitionManifestFile: basename(sourceManifestPath),
  });
  const jsonPath = resolve(directory, "configured-review-workspace-v2.json");
  const markdownPath = resolve(directory, "configured-review-workspace-v2.md");
  writeExclusive(jsonPath, `${JSON.stringify(workspace, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetReviewWorkspace(workspace));

  console.log("Configured EDINET review workspace v2");
  console.log(`issuer: ${workspace.issuer.issuerKey} (${workspace.issuer.edinetCode}/${workspace.issuer.secCode})`);
  console.log(`manifest: ${sourceManifestPath}`);
  console.log(`documents/groups/acquisitions: ${workspace.documentCount}/${workspace.groupCount}/${workspace.acquisitionCount}`);
  console.log(`type 1/type 2 verified: ${workspace.structuredDocumentCount}/${workspace.officialPdfCount}`);
  console.log(`workspace: ${jsonPath}`);
  console.log(`review guide: ${markdownPath}`);
  console.log(`workspaceHash: ${workspace.workspaceHash}`);
  console.log(`reviewStatus: ${workspace.reviewStatus}`);
  console.log(`foundationPreviewEligible: ${workspace.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${workspace.appendAuthorized}`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown configured review workspace error";
  console.error(`Configured EDINET review workspace failed: ${message}`);
  process.exitCode = 1;
});
