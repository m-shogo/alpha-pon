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
  buildSanrioEdinetHumanReviewTemplate,
  renderSanrioEdinetHumanReviewRecord,
} from "../edinet-sanrio-human-review-decision.js";
import { finalizeSanrioEdinetHumanReviewRecord } from "../edinet-sanrio-human-review-finalize.js";

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
    throw new Error("human review files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("acquisition directory must be a regular non-symlink directory");
  return directory;
}

function validateInspectionPath(path: string): string {
  validateAcquisitionDirectory(dirname(path));
  if (!/^revision-unmatched-anchor-inspection-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))) {
    throw new Error("inspection must be a local revision-unmatched-anchor-inspection-v1.*.json file");
  }
  assertRegularNonSymlink(path, "inspection report");
  return path;
}

function validateEditablePath(path: string): string {
  validateAcquisitionDirectory(dirname(path));
  if (!/^revision-human-review-input-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))) {
    throw new Error("editable review must be a local revision-human-review-input-v1.*.json file");
  }
  assertRegularNonSymlink(path, "editable review record");
  return path;
}

function latestInspection(): string {
  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) continue;
    const directory = resolve(root, directoryEntry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !/^revision-unmatched-anchor-inspection-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) continue;
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "inspection report");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  if (!candidates[0]) throw new Error("no Sanrio unmatched-anchor inspection found under data/edinet");
  return validateInspectionPath(candidates[0].path);
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
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

function token(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeChild(directory: string, name: string): string {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new Error("sourceInspectionFile must be a local basename");
  }
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error("source inspection escaped acquisition directory");
  return path;
}

function createTemplate(inspectionArg: string | null): void {
  const inspectionPath = inspectionArg
    ? validateInspectionPath(resolve(process.cwd(), inspectionArg))
    : latestInspection();
  const directory = validateAcquisitionDirectory(dirname(inspectionPath));
  const template = buildSanrioEdinetHumanReviewTemplate({
    inspectionReport: parseJson(inspectionPath, "inspection report"),
    sourceInspectionFile: basename(inspectionPath),
  });
  const stamp = token();
  const jsonPath = resolve(directory, `revision-human-review-input-v1.${stamp}.json`);
  const markdownPath = resolve(directory, `revision-human-review-input-v1.${stamp}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(template, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetHumanReviewRecord(template));
  console.log("Sanrio EDINET human review input prepared");
  console.log(`source inspection: ${inspectionPath}`);
  console.log(`anchors: ${template.anchorCount}`);
  console.log(`editable input: ${jsonPath}`);
  console.log(`review checklist: ${markdownPath}`);
  console.log(`recordHash: ${template.recordHash}`);
  console.log(`reviewStatus: ${template.reviewStatus}`);
  console.log(`appendAuthorized: ${template.appendAuthorized}`);
}

function finalize(editableArg: string): void {
  const editablePath = validateEditablePath(resolve(process.cwd(), editableArg));
  const directory = validateAcquisitionDirectory(dirname(editablePath));
  const edited = parseJson(editablePath, "editable review record") as Record<string, unknown>;
  const sourceName = String(edited.sourceInspectionFile ?? "").trim();
  const inspectionPath = validateInspectionPath(safeChild(directory, sourceName));
  const finalized = finalizeSanrioEdinetHumanReviewRecord({
    inspectionReport: parseJson(inspectionPath, "inspection report"),
    sourceInspectionFile: basename(inspectionPath),
    editedRecord: edited,
  });
  const stamp = token();
  const jsonPath = resolve(directory, `revision-human-review-decision-v1.${stamp}.json`);
  const markdownPath = resolve(directory, `revision-human-review-decision-v1.${stamp}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(finalized, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetHumanReviewRecord(finalized));
  console.log("Sanrio EDINET human review decision finalized");
  console.log(`editable input: ${editablePath}`);
  console.log(`source inspection: ${inspectionPath}`);
  console.log(`anchors completed: ${finalized.completedAnchorCount}/${finalized.anchorCount}`);
  console.log(`decision record: ${jsonPath}`);
  console.log(`decision review: ${markdownPath}`);
  console.log(`recordHash: ${finalized.recordHash}`);
  console.log(`reviewStatus: ${finalized.reviewStatus}`);
  console.log(`foundationPreviewEligible: ${finalized.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${finalized.appendAuthorized}`);
}

try {
  const finalizeArg = argValue("finalize");
  if (finalizeArg) finalize(finalizeArg);
  else createTemplate(argValue("inspection"));
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown human review decision error";
  console.error(`Sanrio EDINET human review decision failed: ${message}`);
  process.exitCode = 1;
}
