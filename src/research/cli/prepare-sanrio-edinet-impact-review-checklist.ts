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
  buildSanrioEdinetImpactChecklistTemplate,
  finalizeSanrioEdinetImpactChecklist,
  renderSanrioEdinetImpactChecklist,
} from "../edinet-sanrio-impact-review-checklist.js";

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
    throw new Error("impact checklist files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  return directory;
}

function validateContentPath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-review-next-content-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("content bundle must be a local revision-review-next-content-v1.*.json file");
  }
  assertRegularNonSymlink(path, "content bundle");
  return path;
}

function resolveContentPath(input: string | null): string {
  if (input?.trim()) return validateContentPath(resolve(process.cwd(), input.trim()));
  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) continue;
    const directory = resolve(root, directoryEntry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !/^revision-review-next-content-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) continue;
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "content bundle");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio review-next content bundle found under data/edinet");
  return validateContentPath(latest.path);
}

function validateInputPath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-impact-review-input-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("finalize input must be a local revision-impact-review-input-v1.*.json file");
  }
  assertRegularNonSymlink(path, "impact review input");
  return path;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
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
  const finalizeInput = argValue("finalize");
  const contentArgument = argValue("content");
  const generatedAt = new Date();

  if (finalizeInput?.trim()) {
    const inputPath = validateInputPath(resolve(process.cwd(), finalizeInput.trim()));
    const directory = validateAcquisitionDirectory(dirname(inputPath));
    const editedRecord = parseJson(inputPath, "impact review input");
    const edited = editedRecord as { sourceContentBundleFile?: unknown };
    const sourceFile = typeof edited.sourceContentBundleFile === "string" ? edited.sourceContentBundleFile.trim() : "";
    if (!sourceFile || sourceFile.includes("/") || sourceFile.includes("\\")) {
      throw new Error("impact review input sourceContentBundleFile is invalid");
    }
    const contentPath = validateContentPath(resolve(directory, sourceFile));
    const record = finalizeSanrioEdinetImpactChecklist({
      contentBundle: parseJson(contentPath, "content bundle"),
      sourceContentBundleFile: basename(contentPath),
      editedRecord,
      reviewedAt: generatedAt.toISOString(),
    });
    const token = stamp(generatedAt);
    const jsonPath = resolve(directory, `revision-impact-review-final-v1.${token}.json`);
    const markdownPath = resolve(directory, `revision-impact-review-final-v1.${token}.md`);
    writeExclusive(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
    writeExclusive(markdownPath, renderSanrioEdinetImpactChecklist(record));
    console.log("Sanrio EDINET impact review checklist finalized");
    console.log(`source content bundle: ${contentPath}`);
    console.log(`review input: ${inputPath}`);
    console.log(`final record: ${jsonPath}`);
    console.log(`final review: ${markdownPath}`);
    console.log(`completed candidates: ${record.completedCandidateCount}/${record.candidateCount}`);
    console.log(`recordHash: ${record.recordHash}`);
    console.log(`foundationPreviewEligible: ${record.foundationPreviewEligible}`);
    console.log(`appendAuthorized: ${record.appendAuthorized}`);
    return;
  }

  const contentPath = resolveContentPath(contentArgument);
  const directory = validateAcquisitionDirectory(dirname(contentPath));
  const record = buildSanrioEdinetImpactChecklistTemplate({
    contentBundle: parseJson(contentPath, "content bundle"),
    sourceContentBundleFile: basename(contentPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `revision-impact-review-input-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-impact-review-input-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetImpactChecklist(record));
  console.log("Sanrio EDINET impact review checklist template");
  console.log(`source content bundle: ${contentPath}`);
  console.log(`candidates: ${record.candidateCount}`);
  console.log(`review input: ${jsonPath}`);
  console.log(`review guide: ${markdownPath}`);
  console.log(`recordHash: ${record.recordHash}`);
  console.log(`reviewStatus: ${record.reviewStatus}`);
  console.log(`foundationPreviewEligible: ${record.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${record.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown impact checklist error";
  console.error(`Sanrio EDINET impact checklist failed: ${message}`);
  process.exitCode = 1;
}
