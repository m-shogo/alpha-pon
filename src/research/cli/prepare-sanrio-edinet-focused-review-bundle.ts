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
  buildSanrioEdinetFocusedReviewBundle,
  buildSanrioEdinetFocusedReviewPlan,
  renderSanrioEdinetFocusedReviewBundle,
  type SanrioEdinetFocusedReviewContent,
  type SanrioEdinetFocusedReviewPlanCandidate,
} from "../edinet-sanrio-focused-review-bundle.js";
import { normalizeEdinetPublicDocument } from "../edinet-sanrio-revision-diff-workspace.js";

const MAX_LIST_BYTES = 5 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_EXTRACTED_BYTES = 30 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

type UnknownRecord = Record<string, unknown>;

type StructuredArchive = {
  binaryFile: string;
  sha256: string;
};

type ReviewDocument = {
  docID: string;
  structuredArchive: StructuredArchive;
};

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

function validateAcquisitionDirectory(directory: string): string {
  const root = localRoot();
  if (
    dirname(directory) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
  ) {
    throw new Error("focused review files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  return directory;
}

function validateTriageWorkspacePath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-diff-triage-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("triage must be a local revision-diff-triage-v1.*.json file");
  }
  assertRegularNonSymlink(path, "triage workspace");
  return path;
}

function resolveTriageWorkspacePath(input: string | null): string {
  if (input?.trim()) return validateTriageWorkspacePath(resolve(process.cwd(), input.trim()));

  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) {
      continue;
    }
    const directory = resolve(root, directoryEntry.name);
    const directoryStat = lstatSync(directory);
    if (directoryStat.isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (
        !fileEntry.isFile()
        || !/^revision-diff-triage-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)
      ) {
        continue;
      }
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "triage workspace");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio cross-period triage workspace found under data/edinet");
  return validateTriageWorkspacePath(latest.path);
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

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requireString(value: unknown, field: string): string {
  const result = asString(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!HASH_PATTERN.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!DOC_ID_PATTERN.test(result)) throw new Error(`${field} is not a valid EDINET docID`);
  return result;
}

function requireLocalBasename(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function verifyReviewWorkspaceHash(workspace: unknown): void {
  const record = asRecord(workspace, "reviewWorkspace");
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("reviewWorkspace schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("reviewWorkspace safety boundary is invalid");
  }
  const issuer = asRecord(record.issuer, "reviewWorkspace.issuer");
  if (asString(issuer.edinetCode) !== "E02655" || asString(issuer.secCode) !== "81360") {
    throw new Error("reviewWorkspace issuer is not Sanrio");
  }
  const expected = requireHash(record.workspaceHash, "reviewWorkspace.workspaceHash");
  const { workspaceHash: _workspaceHash, ...withoutHash } = record;
  const actual = createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex");
  if (actual !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");
}

function parseReviewDocuments(workspace: unknown): Map<string, ReviewDocument> {
  verifyReviewWorkspaceHash(workspace);
  const record = asRecord(workspace, "reviewWorkspace");
  const documents = new Map<string, ReviewDocument>();
  for (const [groupIndex, rawGroup] of asArray(record.groups, "reviewWorkspace.groups").entries()) {
    const group = asRecord(rawGroup, `reviewWorkspace.groups[${groupIndex}]`);
    for (const [documentIndex, rawDocument] of asArray(
      group.documents,
      `reviewWorkspace.groups[${groupIndex}].documents`,
    ).entries()) {
      const document = asRecord(
        rawDocument,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}]`,
      );
      const docID = requireDocID(
        document.docID,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].docID`,
      );
      const acquisitions = asArray(
        document.acquisitions,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions`,
      ).map((rawAcquisition, acquisitionIndex) => {
        const acquisition = asRecord(
          rawAcquisition,
          `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions[${acquisitionIndex}]`,
        );
        return {
          documentType: requireString(
            acquisition.documentType,
            `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions[${acquisitionIndex}].documentType`,
          ),
          format: requireString(
            acquisition.format,
            `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions[${acquisitionIndex}].format`,
          ),
          binaryFile: requireLocalBasename(
            acquisition.binaryFile,
            `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions[${acquisitionIndex}].binaryFile`,
          ),
          sha256: requireHash(
            acquisition.sha256,
            `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions[${acquisitionIndex}].sha256`,
          ),
        };
      });
      const structured = acquisitions.filter(
        acquisition => acquisition.documentType === "1" && acquisition.format === "zip",
      );
      if (structured.length !== 1) continue;
      const next: ReviewDocument = {
        docID,
        structuredArchive: {
          binaryFile: structured[0]!.binaryFile,
          sha256: structured[0]!.sha256,
        },
      };
      const existing = documents.get(docID);
      if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
        throw new Error(`conflicting structured acquisition for ${docID}`);
      }
      documents.set(docID, next);
    }
  }
  return documents;
}

function safeChild(directory: string, name: string, field: string): string {
  const basenameOnly = requireLocalBasename(name, field);
  const path = resolve(directory, basenameOnly);
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
    throw new Error("the local unzip command is required for focused EDINET review");
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
      || entry.split("/").some(segment => !segment || segment === "." || segment === "..")
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

async function main(): Promise<void> {
  requireUnzip();
  const triagePath = resolveTriageWorkspacePath(argValue("triage"));
  const acquisitionDirectory = validateAcquisitionDirectory(dirname(triagePath));
  const triageWorkspace = parseJson(triagePath, "triage workspace");
  const plan = buildSanrioEdinetFocusedReviewPlan({
    triageWorkspace,
    sourceTriageWorkspaceFile: basename(triagePath),
  });

  const reviewWorkspacePath = resolve(acquisitionDirectory, "review-workspace.json");
  assertRegularNonSymlink(reviewWorkspacePath, "review workspace");
  const reviewDocuments = parseReviewDocuments(parseJson(reviewWorkspacePath, "review workspace"));

  const verifiedArchives = new Map<string, { path: string; entries: Set<string> }>();
  let totalExtractedBytes = 0;

  async function archiveFor(docID: string): Promise<{ path: string; entries: Set<string> }> {
    const cached = verifiedArchives.get(docID);
    if (cached) return cached;
    const document = reviewDocuments.get(docID);
    if (!document) throw new Error(`${docID} has no verified type=1 structured ZIP`);
    const path = safeChild(
      acquisitionDirectory,
      document.structuredArchive.binaryFile,
      `${docID} structured ZIP`,
    );
    const actualHash = await sha256File(path);
    if (actualHash !== document.structuredArchive.sha256) {
      throw new Error(`${docID} structured ZIP SHA-256 mismatch`);
    }
    const result = { path, entries: new Set(listArchiveEntries(path)) };
    verifiedArchives.set(docID, result);
    return result;
  }

  async function extractText(docID: string, entry: string | null): Promise<string | null> {
    if (entry === null) return null;
    const archive = await archiveFor(docID);
    if (!archive.entries.has(entry)) {
      throw new Error(`${docID} structured ZIP is missing ${entry}`);
    }
    const bytes = readArchiveEntry(archive.path, entry);
    totalExtractedBytes += bytes.byteLength;
    if (totalExtractedBytes > MAX_TOTAL_EXTRACTED_BYTES) {
      throw new Error("focused review extraction exceeds total byte limit");
    }
    const normalized = normalizeEdinetPublicDocument(entry, bytes.toString("utf-8"));
    if (!normalized) throw new Error(`${docID} ${entry} normalized to empty text`);
    return normalized;
  }

  const contents: SanrioEdinetFocusedReviewContent[] = [];
  let extractedBeforeEntries = 0;
  let extractedAfterEntries = 0;
  for (const candidate of plan.candidates) {
    const beforeText = await extractText(candidate.fromDocID, candidate.beforePath);
    const afterText = await extractText(candidate.toDocID, candidate.afterPath);
    if (beforeText !== null) extractedBeforeEntries += 1;
    if (afterText !== null) extractedAfterEntries += 1;
    contents.push({ candidateId: candidate.candidateId, beforeText, afterText });
  }

  const generatedAt = new Date();
  const bundle = buildSanrioEdinetFocusedReviewBundle({
    plan,
    contents,
    generatedAt: generatedAt.toISOString(),
  });
  const stamp = safeStamp(generatedAt);
  const jsonName = `revision-focused-review-v1.${stamp}.json`;
  const markdownName = `revision-focused-review-v1.${stamp}.md`;
  writeExclusiveDurable(resolve(acquisitionDirectory, jsonName), `${JSON.stringify(bundle, null, 2)}\n`);
  writeExclusiveDurable(
    resolve(acquisitionDirectory, markdownName),
    renderSanrioEdinetFocusedReviewBundle(bundle),
  );

  console.log("Sanrio EDINET focused correction review bundle");
  console.log(`source triage: data/edinet/${basename(acquisitionDirectory)}/${basename(triagePath)}`);
  console.log(`review-first clusters: ${bundle.clusterCount}`);
  console.log(`review-first candidates: ${bundle.candidateCount}`);
  console.log(`extracted before entries: ${extractedBeforeEntries}`);
  console.log(`extracted after entries: ${extractedAfterEntries}`);
  console.log(`focus lines: ${bundle.focusLineCount}`);
  console.log(`focused bundle: data/edinet/${basename(acquisitionDirectory)}/${jsonName}`);
  console.log(`focused review: data/edinet/${basename(acquisitionDirectory)}/${markdownName}`);
  console.log(`focusedBundleHash: ${bundle.focusedBundleHash}`);
  console.log("reviewStatus: pending_human_review");
  console.log("appendAuthorized: false");
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown focused review bundle error";
  console.error(`Sanrio EDINET focused review failed: ${message}`);
  process.exitCode = 1;
});
