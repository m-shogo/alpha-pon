import {
  closeSync,
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
  buildSanrioEdinetReviewNextBatchWorkspace,
  renderSanrioEdinetReviewNextBatchWorkspace,
} from "../edinet-sanrio-review-next-batching.js";

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

function validateTriagePath(path: string): string {
  const root = localRoot();
  const directory = dirname(path);
  if (
    dirname(directory) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !/^revision-diff-triage-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("triage must be data/edinet/sanrio-acquisition.*/revision-diff-triage-v1.*.json");
  }
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  assertRegularNonSymlink(path, "triage workspace");
  return path;
}

function resolveTriagePath(input: string | null): string {
  if (input?.trim()) return validateTriagePath(resolve(process.cwd(), input.trim()));
  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) continue;
    const directory = resolve(root, directoryEntry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !/^revision-diff-triage-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) continue;
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
  return validateTriagePath(latest.path);
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error("triage workspace is not valid JSON");
  }
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

function main(): void {
  const sourcePath = resolveTriagePath(argValue("triage"));
  const directory = dirname(sourcePath);
  const generatedAt = new Date();
  const workspace = buildSanrioEdinetReviewNextBatchWorkspace({
    triageWorkspace: parseJson(sourcePath),
    sourceTriageWorkspaceFile: basename(sourcePath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `revision-review-next-batches-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-review-next-batches-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(workspace, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetReviewNextBatchWorkspace(workspace));

  console.log("Sanrio EDINET review-next batching");
  console.log(`source triage: ${sourcePath}`);
  console.log(`source candidates: ${workspace.sourceCandidateCount}`);
  console.log(`source clusters: ${workspace.sourceClusterCount}`);
  console.log(`exception clusters: ${workspace.exceptionClusterCount}`);
  console.log(`representative clusters: ${workspace.representativeClusterCount}`);
  console.log(`initial review candidates: ${workspace.initialReviewCandidateCount}`);
  console.log(`deferred pair confirmations: ${workspace.deferredPairConfirmationCount}`);
  console.log(`estimated initial reduction: ${workspace.estimatedInitialReviewReduction}`);
  console.log(`batch workspace: ${jsonPath}`);
  console.log(`batch review: ${markdownPath}`);
  console.log(`workspaceHash: ${workspace.workspaceHash}`);
  console.log(`reviewStatus: ${workspace.reviewStatus}`);
  console.log(`appendAuthorized: ${workspace.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown review-next batching error";
  console.error(`Sanrio EDINET review-next batching failed: ${message}`);
  process.exitCode = 1;
}
