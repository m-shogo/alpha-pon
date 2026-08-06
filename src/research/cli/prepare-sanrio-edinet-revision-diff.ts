import { execFileSync } from "node:child_process";
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
  buildSanrioEdinetRevisionDiffPlan,
  buildSanrioEdinetRevisionDiffWorkspace,
  compareSanrioEdinetRevisionEntries,
  isEdinetPublicDocumentEntry,
  renderSanrioEdinetRevisionDiffReview,
  type SanrioEdinetArchiveEntry,
  type SanrioEdinetRevisionPairPlan,
} from "../edinet-sanrio-revision-diff-workspace.js";

const MAX_LIST_BYTES = 5 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_TEXT_BYTES = 100 * 1024 * 1024;
const MAX_PUBLIC_DOCUMENT_ENTRIES = 500;

type UnknownRecord = Record<string, unknown>;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function root(): string {
  return resolve(process.cwd(), "data/edinet");
}

function regularFile(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function validateWorkspacePath(path: string): string {
  const parent = dirname(path);
  if (
    dirname(parent) !== root()
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(parent))
    || basename(path) !== "review-workspace.json"
  ) {
    throw new Error("workspace must be data/edinet/sanrio-acquisition.*/review-workspace.json");
  }
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  regularFile(path, "review workspace");
  return path;
}

function workspacePath(input: string | null): string {
  if (input?.trim()) return validateWorkspacePath(resolve(process.cwd(), input.trim()));
  const candidates = readdirSync(root(), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(entry.name))
    .map(entry => {
      const directory = resolve(root(), entry.name);
      if (lstatSync(directory).isSymbolicLink()) return null;
      const path = resolve(directory, "review-workspace.json");
      try {
        regularFile(path, "review workspace");
      } catch {
        return null;
      }
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .filter((value): value is { path: string; mtimeMs: number } => value !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio review workspace found under data/edinet");
  return validateWorkspacePath(latest.path);
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error("review workspace is not valid JSON");
  }
}

function record(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function verifyReviewWorkspaceHash(value: unknown): void {
  const workspace = record(value, "reviewWorkspace");
  const expected = typeof workspace.workspaceHash === "string" ? workspace.workspaceHash.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error("reviewWorkspace.workspaceHash must be SHA-256");
  }
  const { workspaceHash: _workspaceHash, ...withoutHash } = workspace;
  const actual = createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex");
  if (actual !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");
}

function safeChild(directory: string, name: string, field: string): string {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  regularFile(path, field);
  return path;
}

async function fileHash(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function requireUnzip(): void {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("the local unzip command is required for EDINET type=1 ZIP comparison");
  }
}

function archivePaths(path: string): string[] {
  let output: string;
  try {
    output = execFileSync("unzip", ["-Z1", path], {
      encoding: "utf-8",
      maxBuffer: MAX_LIST_BYTES,
    });
  } catch {
    throw new Error(`unable to list ZIP archive ${basename(path)}`);
  }
  const entries = output.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  for (const entry of entries) {
    if (
      entry.startsWith("/")
      || entry.includes("\\")
      || entry.split("/").some(segment => segment === "" || segment === "." || segment === "..")
    ) {
      throw new Error(`ZIP archive contains an unsafe entry path: ${entry}`);
    }
  }
  return entries;
}

function archiveEntry(path: string, entry: string): Buffer {
  try {
    return execFileSync("unzip", ["-p", path, entry], {
      encoding: "buffer",
      maxBuffer: MAX_ENTRY_BYTES,
    });
  } catch {
    throw new Error(`unable to read ZIP entry ${entry} from ${basename(path)}`);
  }
}

function publicDocuments(path: string): SanrioEdinetArchiveEntry[] {
  const selected = archivePaths(path).filter(isEdinetPublicDocumentEntry).sort();
  if (selected.length === 0) throw new Error(`${basename(path)} has no EDINET PublicDoc text entries`);
  if (selected.length > MAX_PUBLIC_DOCUMENT_ENTRIES) {
    throw new Error(`${basename(path)} exceeds PublicDoc entry limit`);
  }
  let totalBytes = 0;
  return selected.map(entry => {
    const bytes = archiveEntry(path, entry);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_TEXT_BYTES) {
      throw new Error(`${basename(path)} exceeds total PublicDoc text limit`);
    }
    return { path: entry, content: bytes.toString("utf-8") };
  });
}

async function comparePair(pair: SanrioEdinetRevisionPairPlan, directory: string) {
  const before = safeChild(directory, pair.fromZipFile, `${pair.fromDocID} ZIP`);
  const after = safeChild(directory, pair.toZipFile, `${pair.toDocID} ZIP`);
  if (await fileHash(before) !== pair.fromZipSha256) {
    throw new Error(`${pair.fromDocID} ZIP SHA-256 mismatch`);
  }
  if (await fileHash(after) !== pair.toZipSha256) {
    throw new Error(`${pair.toDocID} ZIP SHA-256 mismatch`);
  }
  return compareSanrioEdinetRevisionEntries({
    pair,
    beforeEntries: publicDocuments(before),
    afterEntries: publicDocuments(after),
  });
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

async function main(): Promise<void> {
  requireUnzip();
  const sourcePath = workspacePath(argValue("workspace"));
  const directory = dirname(sourcePath);
  const source = parseJson(sourcePath);
  verifyReviewWorkspaceHash(source);
  const plan = buildSanrioEdinetRevisionDiffPlan(source);

  console.log("Sanrio EDINET correction diff extraction");
  console.log(`workspace: data/edinet/${basename(directory)}/review-workspace.json`);
  console.log(`correction pairs: ${plan.pairs.length}`);
  console.log("comparison source: verified type=1 structured ZIP PublicDoc entries");

  const pairs = [];
  for (let index = 0; index < plan.pairs.length; index++) {
    const pair = plan.pairs[index]!;
    process.stdout.write(`[${index + 1}/${plan.pairs.length}] ${pair.fromDocID} -> ${pair.toDocID} ... `);
    const result = await comparePair(pair, directory);
    pairs.push(result);
    console.log(`modified=${result.modifiedEntryCount} added=${result.addedEntryCount} removed=${result.removedEntryCount}`);
  }

  const generatedAt = new Date();
  const workspace = buildSanrioEdinetRevisionDiffWorkspace({
    plan,
    pairs,
    generatedAt: generatedAt.toISOString(),
  });
  const suffix = stamp(generatedAt);
  const jsonName = `revision-diff-workspace.${suffix}.json`;
  const markdownName = `revision-diff-review.${suffix}.md`;
  writeExclusive(resolve(directory, jsonName), `${JSON.stringify(workspace, null, 2)}\n`);
  writeExclusive(resolve(directory, markdownName), renderSanrioEdinetRevisionDiffReview(workspace));

  console.log("");
  console.log(`pairs: ${workspace.pairCount}`);
  console.log(`changed PublicDoc entries: ${workspace.changedEntryCount}`);
  console.log(`diff workspace: data/edinet/${basename(directory)}/${jsonName}`);
  console.log(`review checklist: data/edinet/${basename(directory)}/${markdownName}`);
  console.log(`diffWorkspaceHash: ${workspace.diffWorkspaceHash}`);
  console.log("reviewStatus: pending_human_review");
  console.log("appendAuthorized: false");
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown revision diff workspace error";
  console.error(`Sanrio EDINET revision diff failed: ${message}`);
  process.exitCode = 1;
});
