import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildSanrioEdinetReviewWorkspace,
  renderSanrioEdinetReviewChecklist,
  type SanrioEdinetReviewWorkspace,
} from "../edinet-sanrio-review-workspace.js";

type UnknownRecord = Record<string, unknown>;

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

function validateManifestPath(path: string): string {
  const root = localRoot();
  const parent = dirname(path);
  if (
    dirname(parent) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(parent))
    || basename(path) !== "acquisition-manifest.json"
  ) {
    throw new Error("manifest must be data/edinet/sanrio-acquisition.*/acquisition-manifest.json");
  }
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  assertRegularNonSymlink(path, "acquisition manifest");
  return path;
}

function resolveManifestPath(input: string | null): string {
  if (input?.trim()) return validateManifestPath(resolve(process.cwd(), input.trim()));

  const root = localRoot();
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(entry.name))
    .map(entry => {
      const directory = resolve(root, entry.name);
      const stat = lstatSync(directory);
      if (stat.isSymbolicLink()) return null;
      const manifest = resolve(directory, "acquisition-manifest.json");
      try {
        assertRegularNonSymlink(manifest, "acquisition manifest");
      } catch {
        return null;
      }
      return { manifest, mtimeMs: statSync(manifest).mtimeMs };
    })
    .filter((value): value is { manifest: string; mtimeMs: number } => value !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.manifest.localeCompare(a.manifest));

  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio acquisition manifest found under data/edinet");
  return validateManifestPath(latest.manifest);
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function sourceInventoryName(manifest: unknown): string {
  const record = asRecord(manifest, "acquisitionManifest");
  const name = typeof record.sourceInventory === "string" ? record.sourceInventory.trim() : "";
  if (!name || name.includes("/") || name.includes("\\") || !name.endsWith(".json")) {
    throw new Error("acquisitionManifest.sourceInventory must be a local JSON basename");
  }
  return name;
}

function resolveInventoryPath(name: string): string {
  const path = resolve(localRoot(), name);
  if (dirname(path) !== localRoot()) {
    throw new Error("source inventory must be a direct child of data/edinet");
  }
  assertRegularNonSymlink(path, "source inventory");
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

function safeChild(directory: string, name: string, field: string): string {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`${field} must be a local basename`);
  }
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  assertRegularNonSymlink(path, field);
  return path;
}

async function verifyWorkspaceFiles(
  workspace: SanrioEdinetReviewWorkspace,
  acquisitionDirectory: string,
): Promise<void> {
  let verified = 0;
  for (const group of workspace.groups) {
    for (const document of group.documents) {
      for (const acquisition of document.acquisitions) {
        const binaryPath = safeChild(
          acquisitionDirectory,
          acquisition.binaryFile,
          `${document.docID} binary`,
        );
        const metadataPath = safeChild(
          acquisitionDirectory,
          acquisition.metadataFile,
          `${document.docID} metadata`,
        );
        const stat = statSync(binaryPath);
        if (stat.size !== acquisition.byteLength) {
          throw new Error(`${document.docID} type=${acquisition.documentType} byteLength mismatch`);
        }
        const hash = await sha256File(binaryPath);
        if (hash !== acquisition.sha256) {
          throw new Error(`${document.docID} type=${acquisition.documentType} SHA-256 mismatch`);
        }

        const metadata = asRecord(parseJson(metadataPath, "acquisition metadata"), "metadata");
        if (
          metadata.docID !== document.docID
          || String(metadata.documentType) !== acquisition.documentType
          || metadata.sha256 !== acquisition.sha256
          || metadata.byteLength !== acquisition.byteLength
          || metadata.storageBoundary !== "local_only"
          || metadata.appendAuthorized !== false
        ) {
          throw new Error(`${document.docID} type=${acquisition.documentType} metadata mismatch`);
        }
        verified += 1;
      }
    }
  }
  if (verified !== workspace.acquisitionCount) {
    throw new Error("verified acquisition count does not match workspace acquisitionCount");
  }
}

function writeExclusiveDurable(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

async function main(): Promise<void> {
  const manifestPath = resolveManifestPath(argValue("manifest"));
  const acquisitionDirectory = dirname(manifestPath);
  const manifest = parseJson(manifestPath, "acquisition manifest");
  const inventoryPath = resolveInventoryPath(sourceInventoryName(manifest));
  const inventory = parseJson(inventoryPath, "source inventory");

  const workspace = buildSanrioEdinetReviewWorkspace({
    inventory,
    acquisitionManifest: manifest,
    acquisitionManifestFile: basename(manifestPath),
  });
  await verifyWorkspaceFiles(workspace, acquisitionDirectory);

  const workspacePath = resolve(acquisitionDirectory, "review-workspace.json");
  const checklistPath = resolve(acquisitionDirectory, "review-checklist.md");
  writeExclusiveDurable(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`);
  writeExclusiveDurable(checklistPath, renderSanrioEdinetReviewChecklist(workspace));

  console.log("Sanrio EDINET human review workspace prepared");
  console.log(`manifest: data/edinet/${basename(acquisitionDirectory)}/acquisition-manifest.json`);
  console.log(`verified acquisitions: ${workspace.acquisitionCount}`);
  console.log(`documents: ${workspace.documentCount}`);
  console.log(`review groups: ${workspace.groups.length}`);
  console.log(`workspace: data/edinet/${basename(acquisitionDirectory)}/review-workspace.json`);
  console.log(`checklist: data/edinet/${basename(acquisitionDirectory)}/review-checklist.md`);
  console.log(`workspaceHash: ${workspace.workspaceHash}`);
  console.log("reviewStatus: pending_human_review");
  console.log("appendAuthorized: false");
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown review workspace error";
  console.error(`Sanrio EDINET review workspace failed: ${message}`);
  process.exitCode = 1;
});
