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
  buildEdinetFoundationMappingTemplate,
  finalizeEdinetFoundationMapping,
  renderEdinetFoundationMappingRecord,
} from "../edinet-foundation-mapping-template.js";

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

function resolveImpactPath(input: string | null): string {
  if (input?.trim()) return validateImpactPath(resolve(process.cwd(), input.trim()));
  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) continue;
    const directory = resolve(root, directoryEntry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !/^revision-impact-review-final-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) continue;
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "impact review final");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no complete Sanrio impact review final found under data/edinet");
  return validateImpactPath(latest.path);
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
  const generatedAt = new Date();

  if (finalizeInput?.trim()) {
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
    const final = finalizeEdinetFoundationMapping({
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
    return;
  }

  const impactPath = resolveImpactPath(argValue("impact"));
  const directory = validateAcquisitionDirectory(dirname(impactPath));
  const template = buildEdinetFoundationMappingTemplate({
    impactReview: parseJson(impactPath, "impact review final"),
    sourceImpactReviewFile: basename(impactPath),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `revision-foundation-mapping-input-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-foundation-mapping-input-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(template, null, 2)}\n`);
  writeExclusive(markdownPath, renderEdinetFoundationMappingRecord(template));
  console.log("EDINET Foundation mapping template");
  console.log(`impact review: ${impactPath}`);
  console.log(`mappings: ${template.mappingCount}`);
  console.log(`mapping input: ${jsonPath}`);
  console.log(`mapping guide: ${markdownPath}`);
  console.log(`recordHash: ${template.recordHash}`);
  console.log(`reviewStatus: ${template.reviewStatus}`);
  console.log(`foundationPreviewEligible: ${template.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${template.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation mapping error";
  console.error(`EDINET Foundation mapping failed: ${message}`);
  process.exitCode = 1;
}
