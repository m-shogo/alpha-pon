import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  buildSanrioEdinetPdfFidelityPlan,
  buildSanrioEdinetPdfFidelityReport,
  renderSanrioEdinetPdfFidelityReport,
  type SanrioEdinetPdfTextInput,
} from "../edinet-sanrio-pdf-fidelity-review.js";

const MAX_PDF_BYTES = 80 * 1024 * 1024;
const MAX_PDF_TEXT_BYTES = 30 * 1024 * 1024;

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

function validateAcquisitionDirectory(directory: string): string {
  const root = localRoot();
  if (
    dirname(directory) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
  ) {
    throw new Error("fidelity review files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  return directory;
}

function validateFocusedBundlePath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-focused-review-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("focused bundle must be a local revision-focused-review-v1.*.json file");
  }
  assertRegularNonSymlink(path, "focused bundle");
  return path;
}

function resolveFocusedBundlePath(input: string | null): string {
  if (input?.trim()) return validateFocusedBundlePath(resolve(process.cwd(), input.trim()));
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
      if (!fileEntry.isFile() || !/^revision-focused-review-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) {
        continue;
      }
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "focused bundle");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio focused review bundle found under data/edinet");
  return validateFocusedBundlePath(latest.path);
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

function safeChild(directory: string, name: string, field: string): string {
  const value = asString(name);
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  const path = resolve(directory, value);
  if (dirname(path) !== directory) throw new Error(`${field} escaped acquisition directory`);
  return path;
}

function sha256File(path: string): string {
  assertRegularNonSymlink(path, "binary artifact");
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > MAX_PDF_BYTES) {
    throw new Error(`PDF size is outside the allowed range: ${basename(path)}`);
  }
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pdftotextAvailable(): boolean {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function extractPdfText(path: string): string | null {
  try {
    return execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf-8",
      maxBuffer: MAX_PDF_TEXT_BYTES,
      timeout: 60_000,
    });
  } catch (error) {
    console.warn(`warning: pdftotext failed for ${basename(path)}: ${String(error)}`);
    return null;
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

function timestampToken(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function reviewWorkspacePath(directory: string): string {
  const path = resolve(directory, "review-workspace.json");
  assertRegularNonSymlink(path, "review workspace");
  return path;
}

function uniquePdfMetadata(reviewWorkspace: unknown): Map<string, { binaryFile: string; sha256: string }> {
  const record = asRecord(reviewWorkspace, "reviewWorkspace");
  const result = new Map<string, { binaryFile: string; sha256: string }>();
  for (const [groupIndex, groupValue] of asArray(record.groups, "reviewWorkspace.groups").entries()) {
    const group = asRecord(groupValue, `reviewWorkspace.groups[${groupIndex}]`);
    for (const [docIndex, docValue] of asArray(group.documents, `reviewWorkspace.groups[${groupIndex}].documents`).entries()) {
      const doc = asRecord(docValue, `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}]`);
      const docID = asString(doc.docID);
      for (const [acquisitionIndex, acquisitionValue] of asArray(
        doc.acquisitions,
        `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}].acquisitions`,
      ).entries()) {
        const acquisition = asRecord(
          acquisitionValue,
          `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}].acquisitions[${acquisitionIndex}]`,
        );
        if (asString(acquisition.documentType) !== "2" || asString(acquisition.format) !== "pdf") continue;
        result.set(docID, {
          binaryFile: asString(acquisition.binaryFile),
          sha256: asString(acquisition.sha256),
        });
      }
    }
  }
  return result;
}

function main(): void {
  const focusedPath = resolveFocusedBundlePath(argValue("focused"));
  const directory = validateAcquisitionDirectory(dirname(focusedPath));
  const workspacePath = reviewWorkspacePath(directory);
  const focusedBundle = parseJson(focusedPath, "focused bundle");
  const reviewWorkspace = parseJson(workspacePath, "review workspace");
  const plan = buildSanrioEdinetPdfFidelityPlan({
    focusedBundle,
    sourceFocusedBundleFile: basename(focusedPath),
    reviewWorkspace,
    sourceReviewWorkspaceFile: basename(workspacePath),
  });

  const metadata = uniquePdfMetadata(reviewWorkspace);
  const available = pdftotextAvailable();
  if (!available) {
    console.warn("warning: pdftotext is unavailable; PDF hashes are verified and manual visual review remains required");
    console.warn("hint: macOS can install it with `brew install poppler`");
  }

  const inputs: SanrioEdinetPdfTextInput[] = [];
  for (const docID of [...new Set(plan.candidates.map(candidate => candidate.toDocID))].sort()) {
    const item = metadata.get(docID);
    if (!item) throw new Error(`PDF metadata missing for ${docID}`);
    const pdfPath = safeChild(directory, item.binaryFile, `PDF ${docID}`);
    const actualHash = sha256File(pdfPath);
    if (actualHash !== item.sha256) throw new Error(`PDF SHA-256 mismatch for ${docID}`);
    const text = available ? extractPdfText(pdfPath) : null;
    inputs.push({
      docID,
      pdfBinaryFile: item.binaryFile,
      extractionMethod: text === null ? "unavailable" : "pdftotext_layout",
      text,
    });
  }

  const report = buildSanrioEdinetPdfFidelityReport({ plan, pdfTexts: inputs });
  const token = timestampToken();
  const jsonPath = resolve(directory, `revision-source-fidelity-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-source-fidelity-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetPdfFidelityReport(report));

  console.log("Sanrio EDINET API/PDF source fidelity review");
  console.log(`source focused bundle: ${focusedPath}`);
  console.log(`candidates: ${report.candidateCount}`);
  console.log(`official PDFs: ${report.uniquePdfCount}`);
  console.log(`PDFs text-extracted: ${report.extractedPdfCount}`);
  console.log(`exact anchor coverage candidates: ${report.exactCoverageCandidateCount}`);
  console.log(`partial anchor coverage candidates: ${report.partialCoverageCandidateCount}`);
  console.log(`extraction unavailable candidates: ${report.unavailableCandidateCount}`);
  console.log(`matched anchors: ${report.matchedAnchorCount}`);
  console.log(`unmatched anchors: ${report.unmatchedAnchorCount}`);
  console.log(`fidelity report: ${jsonPath}`);
  console.log(`fidelity review: ${markdownPath}`);
  console.log(`fidelityReportHash: ${report.fidelityReportHash}`);
  console.log(`reviewStatus: ${report.reviewStatus}`);
  console.log(`appendAuthorized: ${report.appendAuthorized}`);
}

main();
