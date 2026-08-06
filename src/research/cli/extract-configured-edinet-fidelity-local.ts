import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import {
  buildConfiguredEdinetAnchorInputTemplate,
  buildConfiguredEdinetFidelityExtractionBundle,
  renderConfiguredEdinetAnchorInputTemplate,
  type ConfiguredEdinetExtractedDocumentInput,
  type ConfiguredEdinetFidelityExtractionBundle,
} from "../edinet-configured-fidelity-extraction.js";
import {
  buildConfiguredStructuredTextArchive,
  countPdfPages,
  countTextLines,
  hasPdfMagic,
  hasZipMagic,
  normalizePdfLayoutText,
} from "../edinet-configured-fidelity-local-extraction.js";
import {
  isEdinetPublicDocumentEntry,
  normalizeEdinetPublicDocument,
} from "../edinet-sanrio-revision-diff-workspace.js";

const MAX_ZIP_LIST_BYTES = 5 * 1024 * 1024;
const MAX_STRUCTURED_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_STRUCTURED_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_PDF_TEXT_BYTES = 50 * 1024 * 1024;
const MAX_PUBLIC_DOCUMENT_ENTRIES = 500;
type JsonObject = Record<string, unknown>;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
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

function planPath(): string {
  const input = argValue("fidelity-plan")?.trim();
  if (!input) throw new Error("--fidelity-plan is required");
  const path = resolve(process.cwd(), input);
  const directory = dirname(path);
  if (
    dirname(directory) !== localRoot()
    || !/^[a-z0-9][a-z0-9_-]{1,63}-acquisition\.[A-Za-z0-9_-]+$/.test(basename(directory))
    || !/^configured-source-fidelity-plan-v1\.[A-Za-z0-9_-]+\.json$/.test(basename(path))
  ) {
    throw new Error("fidelity plan must be data/edinet/<issuerKey>-acquisition.*/configured-source-fidelity-plan-v1.*.json");
  }
  assertDirectory(directory, "acquisition directory");
  assertRegularNonSymlink(path, "fidelity plan");
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

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function parseJson(path: string, field: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

function directChild(directory: string, file: unknown, field: string): string {
  const name = localBasename(file, field);
  const path = resolve(directory, name);
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

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function readMagic(path: string, bytes: number): Uint8Array {
  const content = readFileSync(path);
  return content.subarray(0, Math.min(bytes, content.byteLength));
}

function requireCommands(): void {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("local unzip command is required");
  }
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("local pdftotext command is required");
  }
}

function safeZipEntries(path: string): string[] {
  let output: string;
  try {
    output = execFileSync("unzip", ["-Z1", path], {
      encoding: "utf-8",
      maxBuffer: MAX_ZIP_LIST_BYTES,
    });
  } catch {
    throw new Error(`unable to list ZIP archive ${basename(path)}`);
  }
  const entries = output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  for (const entry of entries) {
    if (
      entry.startsWith("/")
      || entry.includes("\\")
      || entry.split("/").some(part => !part || part === "." || part === "..")
    ) {
      throw new Error(`ZIP archive contains unsafe entry path: ${entry}`);
    }
  }
  const publicEntries = entries.filter(isEdinetPublicDocumentEntry).sort();
  if (publicEntries.length === 0) throw new Error(`ZIP archive has no supported PublicDoc entries: ${basename(path)}`);
  if (publicEntries.length > MAX_PUBLIC_DOCUMENT_ENTRIES) {
    throw new Error(`ZIP archive exceeds PublicDoc entry limit: ${basename(path)}`);
  }
  return publicEntries;
}

function extractStructuredEntries(path: string): Array<{ path: string; text: string }> {
  const results: Array<{ path: string; text: string }> = [];
  let totalBytes = 0;
  for (const entry of safeZipEntries(path)) {
    let bytes: Buffer;
    try {
      bytes = execFileSync("unzip", ["-p", path, entry], {
        encoding: "buffer",
        maxBuffer: MAX_STRUCTURED_ENTRY_BYTES,
      });
    } catch {
      throw new Error(`unable to read ZIP entry ${entry}`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_STRUCTURED_TOTAL_BYTES) {
      throw new Error("structured extraction exceeds total byte limit");
    }
    const normalized = normalizeEdinetPublicDocument(entry, bytes.toString("utf-8"));
    if (!normalized) continue;
    results.push({ path: entry, text: normalized });
  }
  if (results.length === 0) throw new Error(`structured extraction produced no visible text: ${basename(path)}`);
  return results;
}

function extractPdfLayout(path: string): string {
  let output: string;
  try {
    output = execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf-8",
      maxBuffer: MAX_PDF_TEXT_BYTES,
    });
  } catch {
    throw new Error(`pdftotext failed for ${basename(path)}`);
  }
  const normalized = normalizePdfLayoutText(output);
  if (!normalized) throw new Error(`PDF extraction produced no text: ${basename(path)}`);
  return normalized;
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

function renderExtractionBundle(bundle: ConfiguredEdinetFidelityExtractionBundle): string {
  const lines = [
    `# ${bundle.issuer.name} EDINET fidelity extraction bundle`,
    "",
    `- generatedAt: ${bundle.generatedAt}`,
    `- sourceFidelityPlanFile: ${bundle.sourceFidelityPlanFile}`,
    `- sourceFidelityPlanHash: ${bundle.sourceFidelityPlanHash}`,
    `- documents: ${bundle.documentCount}`,
    `- structured entries/lines: ${bundle.structuredEntryCount}/${bundle.structuredLineCount}`,
    `- PDF lines/pages: ${bundle.pdfLineCount}/${bundle.pdfPageCount}`,
    `- extractionStatus: ${bundle.extractionStatus}`,
    `- anchorInputStatus: ${bundle.anchorInputStatus}`,
    `- comparisonStatus: ${bundle.comparisonStatus}`,
    `- reviewStatus: ${bundle.reviewStatus}`,
    `- extractionBundleHash: ${bundle.extractionBundleHash}`,
    "- automaticAnchorGenerationAuthorized: false",
    "- automaticComparisonAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "Extraction success does not confirm semantic equivalence or any filing fact.",
    "",
  ];
  for (const document of bundle.documents) {
    lines.push(
      `## ${document.docID}`,
      "",
      `- pairId: ${document.pairId}`,
      `- extractionHash: ${document.extractionHash}`,
      `- structuredTextFile: ${document.structuredTextFile}`,
      `- structuredTextFileSha256: ${document.structuredTextFileSha256}`,
      `- structured entries/lines: ${document.structuredEntryCount}/${document.structuredLineCount}`,
      `- pdfLayoutTextFile: ${document.pdfLayoutTextFile}`,
      `- pdfLayoutTextFileSha256: ${document.pdfLayoutTextFileSha256}`,
      `- PDF lines/pages: ${document.pdfLineCount}/${document.pdfPageCount}`,
      "- anchors: 0",
      "- comparisonStatus: not_started",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const sourcePlanPath = planPath();
  const directory = dirname(sourcePlanPath);
  const plan = object(parseJson(sourcePlanPath, "fidelity plan"), "fidelity plan");
  if (!hasFlag("execute-local-extraction")) {
    throw new Error("explicit --execute-local-extraction flag is required; source binaries were not read");
  }
  requireCommands();
  const generatedAt = new Date();
  const extractedDocuments: ConfiguredEdinetExtractedDocumentInput[] = [];

  for (const [index, value] of array(plan.documents, "fidelity plan documents").entries()) {
    const document = object(value, `fidelity plan documents[${index}]`);
    const docID = required(document.docID, `fidelity plan documents[${index}].docID`);
    const structured = object(document.structuredSource, `fidelity plan ${docID}.structuredSource`);
    const pdf = object(document.officialPdf, `fidelity plan ${docID}.officialPdf`);
    const structuredPath = directChild(directory, structured.binaryFile, `${docID} structured source`);
    const pdfPath = directChild(directory, pdf.binaryFile, `${docID} official PDF`);
    const structuredStat = statSync(structuredPath);
    const pdfStat = statSync(pdfPath);
    if (structuredStat.size !== Number(structured.binaryByteLength)) {
      throw new Error(`${docID} structured source byte length mismatch`);
    }
    if (pdfStat.size !== Number(pdf.binaryByteLength)) {
      throw new Error(`${docID} official PDF byte length mismatch`);
    }
    if (await sha256File(structuredPath) !== text(structured.binarySha256)) {
      throw new Error(`${docID} structured source SHA-256 mismatch`);
    }
    if (await sha256File(pdfPath) !== text(pdf.binarySha256)) {
      throw new Error(`${docID} official PDF SHA-256 mismatch`);
    }
    if (!hasZipMagic(readMagic(structuredPath, 4))) {
      throw new Error(`${docID} structured source does not have ZIP magic`);
    }
    if (!hasPdfMagic(readMagic(pdfPath, 5))) {
      throw new Error(`${docID} official source does not have PDF magic`);
    }

    const archive = buildConfiguredStructuredTextArchive({
      docID,
      sourceBinarySha256: required(structured.binarySha256, `${docID} structured SHA`),
      generatedAt: generatedAt.toISOString(),
      entries: extractStructuredEntries(structuredPath),
    });
    const structuredFile = `${docID}.configured-structured-visible-text-v1.json`;
    const structuredContent = `${JSON.stringify(archive, null, 2)}\n`;
    writeExclusive(resolve(directory, structuredFile), structuredContent);

    const pdfText = extractPdfLayout(pdfPath);
    const pdfFile = `${docID}.configured-pdf-layout-v1.txt`;
    const pdfContent = `${pdfText}\n`;
    writeExclusive(resolve(directory, pdfFile), pdfContent);

    extractedDocuments.push({
      pairId: required(document.pairId, `${docID} pairId`),
      pairHash: required(document.pairHash, `${docID} pairHash`),
      docID,
      structuredBinarySha256: required(structured.binarySha256, `${docID} structured SHA`),
      pdfBinarySha256: required(pdf.binarySha256, `${docID} PDF SHA`),
      structuredTextFile: structuredFile,
      structuredTextFileSha256: sha256Text(structuredContent),
      structuredTextFileByteLength: Buffer.byteLength(structuredContent, "utf-8"),
      structuredEntries: archive.entries.map(entry => ({
        path: entry.path,
        textHash: entry.textHash,
        lineCount: entry.lineCount,
        byteLength: entry.byteLength,
      })),
      pdfLayoutTextFile: pdfFile,
      pdfLayoutTextFileSha256: sha256Text(pdfContent),
      pdfLayoutTextFileByteLength: Buffer.byteLength(pdfContent, "utf-8"),
      pdfLineCount: countTextLines(pdfText),
      pdfPageCount: countPdfPages(pdfText),
    });
  }

  const token = stamp(generatedAt);
  const extractionFile = `configured-fidelity-extraction-v1.${token}.json`;
  const bundle = buildConfiguredEdinetFidelityExtractionBundle({
    fidelityPlan: plan,
    sourceFidelityPlanFile: basename(sourcePlanPath),
    extractedDocuments,
    generatedAt: generatedAt.toISOString(),
  });
  const extractionContent = `${JSON.stringify(bundle, null, 2)}\n`;
  writeExclusive(resolve(directory, extractionFile), extractionContent);
  writeExclusive(
    resolve(directory, `configured-fidelity-extraction-v1.${token}.md`),
    renderExtractionBundle(bundle),
  );

  const anchorTemplate = buildConfiguredEdinetAnchorInputTemplate({
    extractionBundle: bundle,
    sourceExtractionBundleFile: extractionFile,
    generatedAt: generatedAt.toISOString(),
  });
  writeExclusive(
    resolve(directory, `configured-fidelity-anchor-input-v1.${token}.json`),
    `${JSON.stringify(anchorTemplate, null, 2)}\n`,
  );
  writeExclusive(
    resolve(directory, `configured-fidelity-anchor-input-v1.${token}.md`),
    renderConfiguredEdinetAnchorInputTemplate(anchorTemplate),
  );

  console.log("Configured EDINET explicit local fidelity extraction");
  console.log(`issuer: ${bundle.issuer.issuerKey} (${bundle.issuer.edinetCode}/${bundle.issuer.secCode})`);
  console.log(`documents: ${bundle.documentCount}`);
  console.log(`structured entries/lines: ${bundle.structuredEntryCount}/${bundle.structuredLineCount}`);
  console.log(`PDF lines/pages: ${bundle.pdfLineCount}/${bundle.pdfPageCount}`);
  console.log(`extraction bundle: ${resolve(directory, extractionFile)}`);
  console.log(`anchor input: ${resolve(directory, `configured-fidelity-anchor-input-v1.${token}.json`)}`);
  console.log(`extractionBundleHash: ${bundle.extractionBundleHash}`);
  console.log(`anchorTemplateHash: ${anchorTemplate.recordHash}`);
  console.log(`reviewStatus: ${bundle.reviewStatus}`);
  console.log(`automaticAnchorGenerationAuthorized: ${bundle.automaticAnchorGenerationAuthorized}`);
  console.log(`automaticComparisonAuthorized: ${bundle.automaticComparisonAuthorized}`);
  console.log(`foundationPreviewEligible: ${bundle.foundationPreviewEligible}`);
  console.log(`appendAuthorized: ${bundle.appendAuthorized}`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : "unknown configured fidelity extraction error";
  console.error(`Configured EDINET fidelity extraction failed: ${message}`);
  process.exitCode = 1;
});
