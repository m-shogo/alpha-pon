import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { finalizeHumanEditedEdinetFoundationMapping } from "../edinet-foundation-mapping-edit-finalizer.js";
import { renderEdinetFoundationMappingRecord } from "../edinet-foundation-mapping-template.js";

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
    throw new Error("Foundation mapping files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  return directory;
}

function validateMappingInputPath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-foundation-mapping-input-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("finalize input must be a local revision-foundation-mapping-input-v1.*.json file");
  }
  assertRegularNonSymlink(path, "Foundation mapping input");
  return path;
}

function validateImpactPath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-impact-review-final-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("impact review must be a local revision-impact-review-final-v1.*.json file");
  }
  assertRegularNonSymlink(path, "impact review final");
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
  if (!finalizeInput?.trim()) throw new Error("--finalize is required");
  const mappingInputPath = validateMappingInputPath(resolve(process.cwd(), finalizeInput.trim()));
  const directory = validateAcquisitionDirectory(dirname(mappingInputPath));
  const mappingInput = parseJson(mappingInputPath, "Foundation mapping input");
  const record = mappingInput as { sourceImpactReviewFile?: unknown };
  const sourceImpactReviewFile = typeof record.sourceImpactReviewFile === "string"
    ? record.sourceImpactReviewFile.trim()
    : "";
  if (!sourceImpactReviewFile || sourceImpactReviewFile.includes("/") || sourceImpactReviewFile.includes("\\")) {
    throw new Error("mapping input sourceImpactReviewFile is invalid");
  }
  const impactPath = validateImpactPath(resolve(directory, sourceImpactReviewFile));
  const generatedAt = new Date();
  const final = finalizeHumanEditedEdinetFoundationMapping({
    impactReview: parseJson(impactPath, "impact review final"),
    sourceImpactReviewFile: basename(impactPath),
    mappingInput,
    sourceMappingInputFile: basename(mappingInputPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `revision-foundation-preview-final-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-foundation-preview-final-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(final, null, 2)}\n`);
  writeExclusive(markdownPath, renderEdinetFoundationMappingRecord(final));
  console.log("EDINET Foundation preview mapping finalized");
  console.log(`impact review: ${impactPath}`);
  console.log(`mapping input: ${mappingInputPath}`);
  console.log(`preview record: ${jsonPath}`);
  console.log(`preview review: ${markdownPath}`);
  console.log(`previews: ${final.previewCount}`);
  console.log(`recordHash: ${final.recordHash}`);
  console.log(`previewGenerated: ${final.previewGenerated}`);
  console.log(`foundationPreviewEligible: ${final.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${final.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation mapping finalizer error";
  console.error(`EDINET Foundation mapping finalizer failed: ${message}`);
  process.exitCode = 1;
}
