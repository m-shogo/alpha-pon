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
  buildSanrioEdinetUnmatchedAnchorReport,
  renderSanrioEdinetUnmatchedAnchorReport,
  type SanrioEdinetPdfInspectionInput,
} from "../edinet-sanrio-unmatched-anchor-inspection.js";

const MAX_PDF_BYTES = 80 * 1024 * 1024;
const MAX_TEXT_BYTES = 30 * 1024 * 1024;

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

function validateAcquisitionDirectory(directory: string): string {
  const root = localRoot();
  if (
    dirname(directory) !== root
    || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
  ) {
    throw new Error("inspection files must be under data/edinet/sanrio-acquisition.*");
  }
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("acquisition directory must be a regular non-symlink directory");
  }
  return directory;
}

function validateFidelityPath(path: string): string {
  const directory = validateAcquisitionDirectory(dirname(path));
  if (
    dirname(path) !== directory
    || !/^revision-source-fidelity-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("fidelity report must be a local revision-source-fidelity-v1.*.json file");
  }
  assertRegularNonSymlink(path, "fidelity report");
  return path;
}

function resolveFidelityPath(input: string | null): string {
  if (input?.trim()) return validateFidelityPath(resolve(process.cwd(), input.trim()));
  const root = localRoot();
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const directoryEntry of readdirSync(root, { withFileTypes: true })) {
    if (!directoryEntry.isDirectory() || !/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(directoryEntry.name)) {
      continue;
    }
    const directory = resolve(root, directoryEntry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const fileEntry of readdirSync(directory, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !/^revision-source-fidelity-v1\.[A-Za-z0-9_-]+\.json$/.test(fileEntry.name)) {
        continue;
      }
      const path = resolve(directory, fileEntry.name);
      try {
        assertRegularNonSymlink(path, "fidelity report");
      } catch {
        continue;
      }
      candidates.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  const latest = candidates[0];
  if (!latest) throw new Error("no Sanrio fidelity report found under data/edinet");
  return validateFidelityPath(latest.path);
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error("fidelity report is not valid JSON");
  }
}

function asRecord(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
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
  assertRegularNonSymlink(path, "PDF artifact");
  const stat = statSync(path);
  if (stat.size <= 0 || stat.size > MAX_PDF_BYTES) {
    throw new Error(`PDF size is outside the allowed range: ${basename(path)}`);
  }
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function extractPdfText(path: string): string {
  try {
    return execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf-8",
      maxBuffer: MAX_TEXT_BYTES,
      timeout: 60_000,
    });
  } catch (error) {
    throw new Error(`pdftotext failed for ${basename(path)}: ${String(error)}`);
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

function pdfMetadata(report: unknown): Map<string, { binaryFile: string; sha256: string }> {
  const record = asRecord(report, "fidelityReport");
  const result = new Map<string, { binaryFile: string; sha256: string }>();
  for (const [candidateIndex, candidateValue] of asArray(record.candidates, "fidelityReport.candidates").entries()) {
    const candidate = asRecord(candidateValue, `fidelityReport.candidates[${candidateIndex}]`);
    const anchorResults = asArray(candidate.anchorResults, `fidelityReport.candidates[${candidateIndex}].anchorResults`);
    const hasUnmatched = anchorResults.some((anchorValue, anchorIndex) => {
      const anchor = asRecord(
        anchorValue,
        `fidelityReport.candidates[${candidateIndex}].anchorResults[${anchorIndex}]`,
      );
      return anchor.matched === false;
    });
    if (!hasUnmatched) continue;
    const docID = asString(candidate.toDocID);
    const next = {
      binaryFile: asString(candidate.pdfBinaryFile),
      sha256: asString(candidate.pdfSha256),
    };
    const existing = result.get(docID);
    if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
      throw new Error(`conflicting PDF metadata for ${docID}`);
    }
    result.set(docID, next);
  }
  return result;
}

function main(): void {
  const fidelityPath = resolveFidelityPath(argValue("fidelity"));
  const directory = validateAcquisitionDirectory(dirname(fidelityPath));
  const fidelityReport = parseJson(fidelityPath);
  const metadata = pdfMetadata(fidelityReport);
  if (metadata.size === 0) throw new Error("fidelity report has no unmatched anchors");

  const pdfInputs: SanrioEdinetPdfInspectionInput[] = [];
  for (const [docID, item] of [...metadata.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const pdfPath = safeChild(directory, item.binaryFile, `PDF ${docID}`);
    const actualHash = sha256File(pdfPath);
    if (actualHash !== item.sha256) throw new Error(`PDF SHA-256 mismatch for ${docID}`);
    pdfInputs.push({
      docID,
      pdfBinaryFile: item.binaryFile,
      pdfText: extractPdfText(pdfPath),
    });
  }

  const report = buildSanrioEdinetUnmatchedAnchorReport({
    fidelityReport,
    sourceFidelityReportFile: basename(fidelityPath),
    pdfInputs,
  });
  const token = timestampToken();
  const jsonPath = resolve(directory, `revision-unmatched-anchor-inspection-v1.${token}.json`);
  const markdownPath = resolve(directory, `revision-unmatched-anchor-inspection-v1.${token}.md`);
  writeExclusive(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeExclusive(markdownPath, renderSanrioEdinetUnmatchedAnchorReport(report));

  console.log("Sanrio EDINET unmatched PDF anchor inspection");
  console.log(`source fidelity report: ${fidelityPath}`);
  console.log(`candidates: ${report.candidateCount}`);
  console.log(`unmatched anchors: ${report.unmatchedAnchorCount}`);
  console.log(`diagnostic PDF contexts: ${report.contextCandidateCount}`);
  console.log(`inspection report: ${jsonPath}`);
  console.log(`inspection review: ${markdownPath}`);
  console.log(`reportHash: ${report.reportHash}`);
  console.log(`reviewStatus: ${report.reviewStatus}`);
  console.log(`appendAuthorized: ${report.appendAuthorized}`);
}

main();
