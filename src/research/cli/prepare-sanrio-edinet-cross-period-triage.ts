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
  buildSanrioEdinetCrossPeriodTriage,
  renderSanrioEdinetCrossPeriodTriage,
} from "../edinet-sanrio-cross-period-triage.js";

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

function validateDiffWorkspacePath(path: string): string {
  const root = localRoot();
  const parent = dirname(path);
  if (
    dirname(parent) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(parent))
    || !/^revision-diff-workspace-v2\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error(
      "diff workspace must be data/edinet/sanrio-acquisition.*/revision-diff-workspace-v2.*.json",
    );
  }
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  assertRegularNonSymlink(path, "revision diff workspace v2");
  return path;
}

function resolveDiffWorkspacePath(input: string | null): string {
  if (input?.trim()) return validateDiffWorkspacePath(resolve(process.cwd(), input.trim()));

  const root = localRoot();
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(entry.name))
    .flatMap(entry => {
      const directory = resolve(root, entry.name);
      const directoryStat = lstatSync(directory);
      if (directoryStat.isSymbolicLink()) return [];
      return readdirSync(directory, { withFileTypes: true })
        .filter(file => file.isFile() && /^revision-diff-workspace-v2\.[A-Za-z0-9_-]+\.json$/.test(file.name))
        .map(file => {
          const path = resolve(directory, file.name);
          try {
            assertRegularNonSymlink(path, "revision diff workspace v2");
          } catch {
            return null;
          }
          return { path, mtimeMs: statSync(path).mtimeMs };
        })
        .filter((value): value is { path: string; mtimeMs: number } => value !== null);
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));

  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio revision diff workspace v2 found under data/edinet");
  return validateDiffWorkspacePath(latest.path);
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
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

function main(): void {
  const sourcePath = resolveDiffWorkspacePath(argValue("diff-workspace"));
  const acquisitionDirectory = dirname(sourcePath);
  const sourceWorkspace = parseJson(sourcePath, "revision diff workspace v2");
  const generatedAt = new Date();
  const triage = buildSanrioEdinetCrossPeriodTriage({
    diffWorkspace: sourceWorkspace,
    sourceDiffWorkspaceFile: basename(sourcePath),
    generatedAt: generatedAt.toISOString(),
  });

  const stamp = safeStamp(generatedAt);
  const jsonName = `revision-diff-triage-v1.${stamp}.json`;
  const markdownName = `revision-diff-triage-v1.${stamp}.md`;
  writeExclusiveDurable(
    resolve(acquisitionDirectory, jsonName),
    `${JSON.stringify(triage, null, 2)}\n`,
  );
  writeExclusiveDurable(
    resolve(acquisitionDirectory, markdownName),
    renderSanrioEdinetCrossPeriodTriage(triage),
  );

  console.log("Sanrio EDINET cross-period correction triage");
  console.log(`source diff workspace: data/edinet/${basename(acquisitionDirectory)}/${basename(sourcePath)}`);
  console.log(`pairs: ${triage.pairCount}`);
  console.log(`source candidates: ${triage.sourceCandidateCount}`);
  console.log(`logical role clusters: ${triage.clusterCount}`);
  console.log(`common across all pairs: ${triage.allPairsCommonClusterCount}`);
  console.log(`pair-specific or partial: ${triage.pairSpecificOrPartialClusterCount}`);
  console.log(`review first candidates: ${triage.reviewFirstCandidateCount}`);
  console.log(`review next candidates: ${triage.reviewNextCandidateCount}`);
  console.log(`triage workspace: data/edinet/${basename(acquisitionDirectory)}/${jsonName}`);
  console.log(`triage review: data/edinet/${basename(acquisitionDirectory)}/${markdownName}`);
  console.log(`triageWorkspaceHash: ${triage.triageWorkspaceHash}`);
  console.log("reviewStatus: pending_human_review");
  console.log("appendAuthorized: false");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown cross-period triage error";
  console.error(`Sanrio EDINET cross-period triage failed: ${message}`);
  process.exitCode = 1;
}
