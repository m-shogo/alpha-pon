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
  buildSanrioEdinetReviewNextContentBundle,
  buildSanrioEdinetReviewNextContentPlan,
  renderSanrioEdinetReviewNextContentBundle,
  type SanrioEdinetReviewNextContentInput,
} from "../edinet-sanrio-review-next-content-bundle.js";
import { normalizeEdinetPublicDocument } from "../edinet-sanrio-revision-diff-workspace.js";

const MAX_LIST_BYTES = 5 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 100 * 1024 * 1024;
const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

type JsonObject = Record<string, unknown>;
type StructuredArchive = { binaryFile: string; sha256: string };

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

function validateAcquisitionDirectory(directory: string): string {
  const root = localRoot();
  if (dirname(directory) !== root || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))) {
    throw new Error("content files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  return directory;
}

function validateBatchPath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-review-next-batches-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("batch workspace must be a local revision-review-next-batches-v1.*.json file");
  }
  assertRegularNonSymlink(path, "batch workspace");
  return path;
}

function resolveBatchPath(input: string | null): string {
  if (input?.trim()) return validateBatchPath(resolve(process.cwd(), input.trim()));
  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) continue;
    const directory = resolve(root, directoryEntry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !/^revision-review-next-batches-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) continue;
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "batch workspace");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio review-next batch workspace found under data/edinet");
  return validateBatchPath(latest.path);
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as JsonObject;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = str(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function verifyReviewWorkspace(workspace: unknown): Map<string, StructuredArchive> {
  const record = obj(workspace, "reviewWorkspace");
  if (record.schemaVersion !== 1 || record.source !== "edinet") throw new Error("reviewWorkspace schema/source is unsupported");
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("reviewWorkspace safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "reviewWorkspace.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("reviewWorkspace issuer is not Sanrio");
  }
  const expected = requireHash(record.workspaceHash, "reviewWorkspace.workspaceHash");
  const { workspaceHash: _ignored, ...withoutHash } = record;
  const actual = createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex");
  if (actual !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");

  const result = new Map<string, StructuredArchive>();
  for (const [groupIndex, groupValue] of arr(record.groups, "reviewWorkspace.groups").entries()) {
    const group = obj(groupValue, `reviewWorkspace.groups[${groupIndex}]`);
    for (const [documentIndex, documentValue] of arr(
      group.documents,
      `reviewWorkspace.groups[${groupIndex}].documents`,
    ).entries()) {
      const document = obj(
        documentValue,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}]`,
      );
      const docID = requireDocID(document.docID, `reviewWorkspace document ${documentIndex}.docID`);
      for (const [acquisitionIndex, acquisitionValue] of arr(
        document.acquisitions,
        `reviewWorkspace document ${documentIndex}.acquisitions`,
      ).entries()) {
        const acquisition = obj(acquisitionValue, `reviewWorkspace acquisition ${acquisitionIndex}`);
        if (str(acquisition.documentType) !== "1" || str(acquisition.format) !== "zip") continue;
        const next = {
          binaryFile: localBasename(acquisition.binaryFile, `structured ZIP ${docID}.binaryFile`),
          sha256: requireHash(acquisition.sha256, `structured ZIP ${docID}.sha256`),
        };
        const existing = result.get(docID);
        if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
          throw new Error(`conflicting structured ZIP metadata for ${docID}`);
        }
        result.set(docID, next);
      }
    }
  }
  return result;
}

function safeChild(directory: string, name: string, field: string): string {
  const child = localBasename(name, field);
  const path = resolve(directory, child);
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

function requireUnzip(): void {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("the local unzip command is required for review-next content extraction");
  }
}

function listEntries(path: string): Set<string> {
  let output: string;
  try {
    output = execFileSync("unzip", ["-Z1", path], { encoding: "utf-8", maxBuffer: MAX_LIST_BYTES });
  } catch {
    throw new Error(`unable to list ZIP archive ${basename(path)}`);
  }
  const entries = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry.startsWith("/") || entry.includes("\\") || entry.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error(`ZIP archive contains unsafe entry path: ${entry}`);
    }
  }
  return new Set(entries);
}

function readEntry(path: string, entry: string): Buffer {
  try {
    return execFileSync("unzip", ["-p", path, entry], { encoding: "buffer", maxBuffer: MAX_ENTRY_BYTES });
  } catch {
    throw new Error(`unable to read ZIP entry ${entry} from ${basename(path)}`);
  }
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

async function main(): Promise<void> {
  requireUnzip();
  const batchPath = resolveBatchPath(argValue("batch"));
  const directory = validateAcquisitionDirectory(dirname(batchPath));
  const plan = buildSanrioEdinetReviewNextContentPlan({
    batchWorkspace: parseJson(batchPath, "batch workspace"),
    sourceBatchWorkspaceFile: basename(batchPath),
  });
  const reviewWorkspacePath = resolve(directory, "review-workspace.json");
  assertRegularNonSymlink(reviewWorkspacePath, "review workspace");
  const archives = verifyReviewWorkspace(parseJson(reviewWorkspacePath, "review workspace"));
  const verified = new Map<string, { path: string; entries: Set<string> }>();
  let totalExtractedBytes = 0;

  async function archiveFor(docID: string): Promise<{ path: string; entries: Set<string> }> {
    const cached = verified.get(docID);
    if (cached) return cached;
    const metadata = archives.get(docID);
    if (!metadata) throw new Error(`${docID} has no verified type=1 structured ZIP`);
    const path = safeChild(directory, metadata.binaryFile, `${docID} structured ZIP`);
    if (await sha256File(path) !== metadata.sha256) throw new Error(`${docID} structured ZIP SHA-256 mismatch`);
    const item = { path, entries: listEntries(path) };
    verified.set(docID, item);
    return item;
  }

  async function extract(docID: string, entry: string | null): Promise<string | null> {
    if (entry === null) return null;
    const archive = await archiveFor(docID);
    if (!archive.entries.has(entry)) throw new Error(`${docID} structured ZIP is missing ${entry}`);
    const bytes = readEntry(archive.path, entry);
    totalExtractedBytes += bytes.byteLength;
    if (totalExtractedBytes > MAX_TOTAL_EXTRACTED_BYTES) {
      throw new Error("review-next content extraction exceeds total byte limit");
    }
    const normalized = normalizeEdinetPublicDocument(entry, bytes.toString("utf-8"));
    if (!normalized) throw new Error(`${docID} ${entry} normalized to empty text`);
    return normalized;
  }

  const contents: SanrioEdinetReviewNextContentInput[] = [];
  for (const candidate of plan.candidates) {
    contents.push({
      candidateId: candidate.candidateId,
      beforeText: await extract(candidate.fromDocID, candidate.beforePath),
      afterText: await extract(candidate.toDocID, candidate.afterPath),
    });
  }

  const generatedAt = new Date();
  const bundle = buildSanrioEdinetReviewNextContentBundle({
    plan,
    contents,
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `revision-review-next-content-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-review-next-content-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetReviewNextContentBundle(bundle));

  console.log("Sanrio EDINET review-next content bundle");
  console.log(`source batch: ${batchPath}`);
  console.log(`candidates: ${bundle.candidateCount}`);
  console.log(`numeric lines: ${bundle.numericLineCount}`);
  console.log(`footnote lines: ${bundle.footnoteLineCount}`);
  console.log(`accounting keyword lines: ${bundle.accountingKeywordLineCount}`);
  console.log(`content bundle: ${jsonPath}`);
  console.log(`content review: ${markdownPath}`);
  console.log(`bundleHash: ${bundle.bundleHash}`);
  console.log(`reviewStatus: ${bundle.reviewStatus}`);
  console.log(`appendAuthorized: ${bundle.appendAuthorized}`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown review-next content extraction error";
  console.error(`Sanrio EDINET review-next content extraction failed: ${message}`);
  process.exitCode = 1;
});
