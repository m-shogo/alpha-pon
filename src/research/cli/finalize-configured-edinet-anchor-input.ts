import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  finalizeConfiguredEdinetAnchorInput,
  renderConfiguredEdinetAnchorFinalRecord,
  type ConfiguredEdinetAnchorSourceFiles,
} from "../edinet-configured-anchor-finalizer.js";

const MAX_STRUCTURED_TEXT_FILE_BYTES = 60 * 1024 * 1024;
const MAX_PDF_LAYOUT_FILE_BYTES = 50 * 1024 * 1024;
type JsonObject = Record<string, unknown>;

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

function assertDirectory(path: string, field: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${field} must be a regular non-symlink directory`);
  }
}

function anchorInputPath(): string {
  const input = argValue("anchor-input")?.trim();
  if (!input) throw new Error("--anchor-input is required");
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !/^configured-fidelity-anchor-input-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("anchor input must be data/edinet/<issuerKey>-acquisition.*/configured-fidelity-anchor-input-v1.*.json");
  }
  assertDirectory(directory, "acquisition directory");
  assertRegularNonSymlink(path, "anchor input");
  return path;
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function localBasename(value: unknown, field: string): string {
  const result = text(value);
  if (!result || result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function directChild(directory: string, value: unknown, field: string): string {
  const name = localBasename(value, field);
  const path = resolve(directory, name);
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  assertRegularNonSymlink(path, field);
  return path;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function readBoundedJson(path: string, field: string, maxBytes: number): unknown {
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > maxBytes) throw new Error(`${field} size is invalid`);
  return parseJson(path, field);
}

function readBoundedText(path: string, field: string, maxBytes: number): string {
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > maxBytes) throw new Error(`${field} size is invalid`);
  return readFileSync(path, "utf-8");
}

function sourceFiles(directory: string, bundle: JsonObject): ConfiguredEdinetAnchorSourceFiles {
  const structuredFiles: Record<string, unknown> = {};
  const pdfFiles: Record<string, string> = {};
  for (const [index, value] of array(bundle.documents, "extraction bundle documents").entries()) {
    const document = object(value, `extraction bundle documents[${index}]`);
    const structuredName = localBasename(
      document.structuredTextFile,
      `extraction bundle documents[${index}].structuredTextFile`,
    );
    const pdfName = localBasename(
      document.pdfLayoutTextFile,
      `extraction bundle documents[${index}].pdfLayoutTextFile`,
    );
    if (structuredFiles[structuredName] !== undefined) {
      throw new Error(`duplicate structured source file ${structuredName}`);
    }
    if (pdfFiles[pdfName] !== undefined) {
      throw new Error(`duplicate PDF layout source file ${pdfName}`);
    }
    structuredFiles[structuredName] = readBoundedJson(
      directChild(directory, structuredName, "structured source file"),
      `structured source file ${structuredName}`,
      MAX_STRUCTURED_TEXT_FILE_BYTES,
    );
    pdfFiles[pdfName] = readBoundedText(
      directChild(directory, pdfName, "PDF layout source file"),
      `PDF layout source file ${pdfName}`,
      MAX_PDF_LAYOUT_FILE_BYTES,
    );
  }
  return { structuredFiles, pdfFiles };
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

function main(): void {
  const sourceAnchorPath = anchorInputPath();
  const directory = dirname(sourceAnchorPath);
  const editedAnchorInput = parseJson(sourceAnchorPath, "anchor input");
  const edited = object(editedAnchorInput, "anchor input");
  const extractionPath = directChild(
    directory,
    edited.sourceExtractionBundleFile,
    "source extraction bundle",
  );
  const extractionBundle = object(
    readBoundedJson(extractionPath, "source extraction bundle", MAX_STRUCTURED_TEXT_FILE_BYTES),
    "source extraction bundle",
  );
  const generatedAt = new Date();
  const final = finalizeConfiguredEdinetAnchorInput({
    extractionBundle,
    sourceExtractionBundleFile: basename(extractionPath),
    editedAnchorInput,
    sourceAnchorInputFile: basename(sourceAnchorPath),
    sourceFiles: sourceFiles(directory, extractionBundle),
    generatedAt: generatedAt.toISOString(),
  });
  const token = stamp(generatedAt);
  const jsonPath = resolve(directory, `configured-fidelity-anchor-final-v1.${token}.json`);
  const markdownPath = resolve(directory, `configured-fidelity-anchor-final-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(final, null, 2)}\n`);
  writeExclusive(markdownPath, renderConfiguredEdinetAnchorFinalRecord(final));

  console.log("Configured EDINET human anchor finalizer");
  console.log(`issuer: ${final.issuer.issuerKey} (${final.issuer.edinetCode}/${final.issuer.secCode})`);
  console.log(`documents/anchors: ${final.documentCount}/${final.anchorCount}`);
  console.log(`reviewer: ${final.reviewer}`);
  console.log(`reviewedAt: ${final.reviewedAt}`);
  console.log(`final record: ${jsonPath}`);
  console.log(`final review: ${markdownPath}`);
  console.log(`sourceAnchorInputHash: ${final.sourceAnchorInputHash}`);
  console.log(`recordHash: ${final.recordHash}`);
  console.log(`reviewStatus: ${final.reviewStatus}`);
  console.log(`comparisonStatus: ${final.comparisonStatus}`);
  console.log(`automaticComparisonAuthorized: ${final.automaticComparisonAuthorized}`);
  console.log(`foundationPreviewEligible: ${final.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${final.appendAuthorized}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown configured anchor finalizer error";
  console.error(`Configured EDINET anchor finalizer failed: ${message}`);
  process.exitCode = 1;
}
