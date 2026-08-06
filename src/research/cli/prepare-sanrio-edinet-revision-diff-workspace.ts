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

function localRoot(): string {
  return resolve(process.cwd(), "data/edinet");
}

function assertRegularNonSymlink(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
}

function validateReviewWorkspacePath(path: string): string {
  const root = localRoot();
  const parent = dirname(path);
  if (
    dirname(parent) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(parent))
    || basename(path) !== "review-workspace.json"
  ) {
    throw new Error("workspace must be data/edinet/sanrio-acquisition.*/review-workspace.json");
  }
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  assertRegularNonSymlink(path, "review workspace");
  return path;
}

function resolveReviewWorkspacePath(input: string | null): string {
  if (input?.trim()) return validateReviewWorkspacePath(resolve(process.cwd(), input.trim()));

  const root = localRoot();
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(entry.name))
    .map(entry => {
      const directory = resolve(root, entry.name);
      const directoryStat = lstatSync(directory);
      if (directoryStat.isSymbolicLink()) return null;
      const workspace = resolve(directory, "review-workspace.json");
      try {
        assertRegularNonSymlink(workspace, "review workspace");
      } catch {
        return null;
      }
      return { workspace, mtimeMs: statSync(workspace).mtimeMs };
    })
    .filter((value): value is { workspace: string; mtimeMs: number } => value !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.workspace.localeCompare(left.workspace));

  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio review workspace found under data/edinet");
  return validateReviewWorkspacePath(latest.workspace);
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

function requireHash(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function verifyWorkspaceHash(workspace: unknown): void {
  const record = asRecord(workspace, "reviewWorkspace");
  const expected = requireHash(record.workspaceHash, "reviewWorkspace.workspaceHash");
  const { workspaceHash: _workspaceHash, ...withoutHash } = record;
  const actual = createHash("sha256")
    .update(JSON.stringify(canonicalize(withoutHash)))
    .digest("hex");
  if (actual !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");
}

function safeChild(directory: string, name: string, field: string): string {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
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

async function verifyArchive(path: string, expectedHash: string, field: string): Promise<void> {
  const actual = await sha256File(path);
  if (actual !== expectedHash) throw new Error(`${field} SHA-256 mismatch`);
}

function requireUnzip(): void {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("the local unzip command is required for EDINET type=1 ZIP comparison");
  }
}

function listArchiveEntries(path: string): string[] {
  let output: string;
  try {
    output = execFileSync("unzip", ["-Z1", path], {
      encoding: "utf-8",
      maxBuffer: MAX_LIST_BYTES,
    });
  } catch {
    throw new Error(`unable to list ZIP archive ${basename(path)}`);
  }
  const entries = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
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

function readArchiveEntry(path: string, entry: string): Buffer {
  try {
    return execFileSync("unzip", ["-p", path, entry], {
      encoding: "buffer",
      maxBuffer: MAX_ENTRY_BYTES,
    });
  } catch {
    throw new Error(`unable to read ZIP entry ${entry} from ${basename(path)}`);
  }
}

function readPublicDocuments(path: string): SanrioEdinetArchiveEntry[] {
  const selected = listArchiveEntries(path).filter(isEdinetPublicDocumentEntry).sort();
  if (selected.length === 0) throw new Error(`${basename(path)} has no EDINET PublicDoc text entries`);
  if (selected.length > MAX_PUBLIC_DOCUMENT_ENTRIES) {
    throw new Error(`${basename(path)} exceeds PublicDoc entry limit`);
  }

  let totalBytes = 0;
  return selected.map(entry => {
    const bytes = readArchiveEntry(path, entry);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_TEXT_BYTES) {
      throw new Error(`${basename(path)} exceeds total PublicDoc text limit`);
    }
    return { path: entry, content: bytes.toString("utf-8") };
  });
}

function safeStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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

async function comparePair(
  pair: SanrioEdinetRevisionPairPlan,
  acquisitionDirectory: string,
) {
  const beforeZip = safeChild(acquisitionDirectory, pair.fromZipFile, `${pair.fromDocID} ZIP`);
  const afterZip = safeChild(acquisitionDirectory, pair.toZipFile, `${pair.toDocID} ZIP`);
  await verifyArchive(beforeZip, pair.fromZipSha256, `${pair.fromDocID} ZIP`);
  await verifyArchive(afterZip, pair.toZipSha256, `${pair.toDocID} ZIP`);
  return compareSanrioEdinetRevisionEntries({
    pair,
    beforeEntries: readPublicDocuments(beforeZip),
    afterEntries: readPublicDocuments(afterZip),
  });
}

async function main(): Promise<void> {
  requireUnzip();
  const workspacePath = resolveReviewWorkspacePath(argValue("workspace"));
  const acquisitionDirectory = dirname(workspacePath);
  const reviewWorkspace = parseJson(workspacePath, "review workspace");
  verifyWorkspaceHash(reviewWorkspace);
  const plan = buildSanrioEdinetRevisionDiffPlan(reviewWorkspace);

  console.log("Sanrio EDINET correction diff extraction");
  console.log(`workspace: data/edinet/${basename(acquisitionDirectory)}/review-workspace.json`);
  console.log(`correction pairs: ${plan.pairs.length}`);
  console.log("comparison source: verified type=1 structured ZIP PublicDoc entries");

  const pairResults = [];
  for (let index = 0; index < plan.pairs.length; index++) {
    const pair = plan.pairs[index]!;
    process.stdout.write(`[${index + 1}/${plan.pairs.length}] ${pair.fromDocID} -> ${pair.toDocID} ... `);
    const result = await comparePair(pair, acquisitionDirectory);
    pairResults.push(result);
    console.log(
      `modified=${result.modifiedEntryCount} added=${result.addedEntryCount} removed=${result.removedEntryCount}`,
    );
  }

  const generatedAt = new Date();
  const workspace = buildSanrioEdinetRevisionDiffWorkspace({
    plan,
    pairs: pairResults,
    generatedAt: generatedAt.toISOString(),
  });
  const stamp = safeStamp(generatedAt);
  const jsonName = `revision-diff-workspace.${stamp}.json`;
  const markdownName = `revision-diff-review.${stamp}.md`;
  writeExclusiveDurable(
    resolve(acquisitionDirectory, jsonName),
    `${JSON.stringify(workspace, null, 2)}\n`,
  );
  writeExclusiveDurable(
    resolve(acquisitionDirectory, markdownName),
    renderSanrioEdinetRevisionDiffReview(workspace),
  );

  console.log("");
  console.log(`pairs: ${workspace.pairCount}`);
  console.log(`changed PublicDoc entries: ${workspace.changedEntryCount}`);
  console.log(`diff workspace: data/edinet/${basename(acquisitionDirectory)}/${jsonName}`);
  console.log(`review checklist: data/edinet/${basename(acquisitionDirectory)}/${markdownName}`);
  console.log(`diffWorkspaceHash: ${workspace.diffWorkspaceHash}`);
  console.log("reviewStatus: pending_human_review");
  console.log("appendAuthorized: false");
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown revision diff workspace error";
  console.error(`Sanrio EDINET revision diff failed: ${message}`);
  process.exitCode = 1;
});
