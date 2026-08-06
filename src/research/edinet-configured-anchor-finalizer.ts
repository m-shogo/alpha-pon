import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_ANCHORS_PER_DOCUMENT = 40;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetAnchorFinal = {
  anchorId: string;
  reason: string;
  structured: {
    entryPath: string;
    lineNumber: number;
    text: string;
    textHash: string;
    entryTextHash: string;
  };
  pdf: {
    pageNumber: number;
    lineNumber: number;
    text: string;
    textHash: string;
  };
  expectedRelation: "exact_normalized_match" | "visual_layout_variance_review";
  lineageVerified: true;
};

export type ConfiguredEdinetAnchorFinalDocument = {
  pairId: string;
  pairHash: string;
  extractionHash: string;
  docID: string;
  structuredTextFile: string;
  structuredTextFileSha256: string;
  pdfLayoutTextFile: string;
  pdfLayoutTextFileSha256: string;
  anchorCount: number;
  anchors: ConfiguredEdinetAnchorFinal[];
  status: "complete_human_input";
  anchorSetHash: string;
};

export type ConfiguredEdinetAnchorFinalRecord = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  sourceExtractionBundleFile: string;
  sourceExtractionBundleHash: string;
  sourceAnchorInputFile: string;
  sourceAnchorInputHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string;
  documentCount: number;
  anchorCount: number;
  reviewStatus: "complete_anchor_input";
  comparisonStatus: "not_started";
  documents: ConfiguredEdinetAnchorFinalDocument[];
  globalBlockers: string[];
  automaticComparisonAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  recordHash: string;
};

export type ConfiguredEdinetAnchorSourceFiles = {
  structuredFiles: Record<string, unknown>;
  pdfFiles: Record<string, string>;
};

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

function hash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function docID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function textDigest(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function verifyExtractionBundle(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("extractionBundle schema/source is unsupported");
  }
  if (
    record.extractionStatus !== "complete"
    || record.anchorInputStatus !== "pending_human_input"
    || record.comparisonStatus !== "not_started"
    || record.reviewStatus !== "pending_anchor_input"
    || record.automaticAnchorGenerationAuthorized !== false
    || record.automaticComparisonAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("extractionBundle safety boundary is invalid");
  }
  const expected = hash(record.extractionBundleHash, "extractionBundle.extractionBundleHash");
  const { extractionBundleHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("extractionBundle.extractionBundleHash mismatch");
  return expected;
}

function rehashEditedTemplate(value: unknown): { record: JsonObject; inputHash: string } {
  const edited = object(value, "anchorInput");
  const { recordHash: _staleHash, ...withoutHash } = edited;
  const inputHash = digest(withoutHash);
  return { record: { ...withoutHash, recordHash: inputHash }, inputHash };
}

function verifyTemplateBoundary(record: JsonObject): void {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("anchorInput schema/source is unsupported");
  }
  if (
    record.reviewStatus !== "draft_human_input"
    || record.automaticAnchorGenerationAuthorized !== false
    || record.automaticComparisonAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("anchorInput safety boundary is invalid");
  }
}

function sourceDocuments(bundle: JsonObject): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const [index, value] of array(bundle.documents, "extractionBundle.documents").entries()) {
    const document = object(value, `extractionBundle.documents[${index}]`);
    const id = docID(document.docID, `extractionBundle.documents[${index}].docID`);
    if (result.has(id)) throw new Error(`extractionBundle has duplicate document ${id}`);
    result.set(id, document);
  }
  if (result.size === 0) throw new Error("extractionBundle has no documents");
  return result;
}

function verifyStructuredArchive(
  fileName: string,
  expectedFileHash: string,
  sourceFiles: ConfiguredEdinetAnchorSourceFiles,
): Map<string, JsonObject> {
  const value = sourceFiles.structuredFiles[fileName];
  if (value === undefined) throw new Error(`missing structured source file ${fileName}`);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (textDigest(serialized) !== expectedFileHash) {
    throw new Error(`structured source file hash mismatch: ${fileName}`);
  }
  const archive = object(value, `structured source ${fileName}`);
  if (archive.schemaVersion !== 1 || archive.source !== "edinet") {
    throw new Error(`structured source schema/source is invalid: ${fileName}`);
  }
  const expectedArchiveHash = hash(archive.archiveHash, `structured source ${fileName}.archiveHash`);
  const { archiveHash: _ignored, ...withoutHash } = archive;
  if (digest(withoutHash) !== expectedArchiveHash) {
    throw new Error(`structured source archiveHash mismatch: ${fileName}`);
  }
  const entries = new Map<string, JsonObject>();
  for (const [index, entryValue] of array(archive.entries, `structured source ${fileName}.entries`).entries()) {
    const entry = object(entryValue, `structured source ${fileName}.entries[${index}]`);
    const path = required(entry.path, `structured source ${fileName}.entries[${index}].path`);
    if (entries.has(path)) throw new Error(`duplicate structured entry ${path}`);
    const entryText = required(entry.text, `structured source ${fileName}.entries[${index}].text`);
    if (textDigest(entryText) !== hash(entry.textHash, `structured source ${fileName}.entries[${index}].textHash`)) {
      throw new Error(`structured entry textHash mismatch: ${path}`);
    }
    entries.set(path, entry);
  }
  if (entries.size === 0) throw new Error(`structured source has no entries: ${fileName}`);
  return entries;
}

function verifyPdfText(
  fileName: string,
  expectedFileHash: string,
  sourceFiles: ConfiguredEdinetAnchorSourceFiles,
): string {
  const value = sourceFiles.pdfFiles[fileName];
  if (value === undefined) throw new Error(`missing PDF layout source file ${fileName}`);
  const serialized = value.endsWith("\n") ? value : `${value}\n`;
  if (textDigest(serialized) !== expectedFileHash) {
    throw new Error(`PDF layout source file hash mismatch: ${fileName}`);
  }
  const normalized = serialized.slice(0, -1);
  if (!normalized.trim()) throw new Error(`PDF layout source is empty: ${fileName}`);
  return normalized;
}

function exactLine(lines: string[], lineNumber: number, field: string): string {
  if (lineNumber > lines.length) throw new Error(`${field} is out of range`);
  const line = lines[lineNumber - 1]!;
  if (!line.trim()) throw new Error(`${field} points to an empty line`);
  return line;
}

function parseAnchor(
  value: unknown,
  field: string,
  structuredEntries: Map<string, JsonObject>,
  pdfText: string,
): ConfiguredEdinetAnchorFinal {
  const anchor = object(value, field);
  const anchorId = required(anchor.anchorId, `${field}.anchorId`);
  const reason = required(anchor.reason, `${field}.reason`);
  const expectedRelation = required(anchor.expectedRelation, `${field}.expectedRelation`);
  if (expectedRelation !== "exact_normalized_match" && expectedRelation !== "visual_layout_variance_review") {
    throw new Error(`${field}.expectedRelation is invalid`);
  }

  const structured = object(anchor.structured, `${field}.structured`);
  const entryPath = required(structured.entryPath, `${field}.structured.entryPath`);
  const entry = structuredEntries.get(entryPath);
  if (!entry) throw new Error(`${field}.structured.entryPath is not present in extracted source`);
  const structuredLineNumber = positiveInteger(
    structured.lineNumber,
    `${field}.structured.lineNumber`,
  );
  const entryText = required(entry.text, `${field}.structured.entry.text`);
  const structuredLine = exactLine(
    entryText.split("\n"),
    structuredLineNumber,
    `${field}.structured.lineNumber`,
  );
  const suppliedStructuredText = required(structured.text, `${field}.structured.text`);
  if (suppliedStructuredText !== structuredLine) {
    throw new Error(`${field}.structured.text does not match extracted line`);
  }
  if (hash(structured.textHash, `${field}.structured.textHash`) !== textDigest(structuredLine)) {
    throw new Error(`${field}.structured.textHash mismatch`);
  }

  const pdf = object(anchor.pdf, `${field}.pdf`);
  const pageNumber = positiveInteger(pdf.pageNumber, `${field}.pdf.pageNumber`);
  const pages = pdfText.split("\f");
  if (pageNumber > pages.length) throw new Error(`${field}.pdf.pageNumber is out of range`);
  const pdfLineNumber = positiveInteger(pdf.lineNumber, `${field}.pdf.lineNumber`);
  const pdfLine = exactLine(
    pages[pageNumber - 1]!.split("\n"),
    pdfLineNumber,
    `${field}.pdf.lineNumber`,
  );
  const suppliedPdfText = required(pdf.text, `${field}.pdf.text`);
  if (suppliedPdfText !== pdfLine) {
    throw new Error(`${field}.pdf.text does not match extracted line`);
  }
  if (hash(pdf.textHash, `${field}.pdf.textHash`) !== textDigest(pdfLine)) {
    throw new Error(`${field}.pdf.textHash mismatch`);
  }

  return {
    anchorId,
    reason,
    structured: {
      entryPath,
      lineNumber: structuredLineNumber,
      text: structuredLine,
      textHash: textDigest(structuredLine),
      entryTextHash: hash(entry.textHash, `${field}.structured.entryTextHash`),
    },
    pdf: {
      pageNumber,
      lineNumber: pdfLineNumber,
      text: pdfLine,
      textHash: textDigest(pdfLine),
    },
    expectedRelation,
    lineageVerified: true,
  };
}

function immutableDocumentSource(document: JsonObject): unknown {
  return {
    pairId: document.pairId,
    pairHash: document.pairHash,
    extractionHash: document.extractionHash,
    docID: document.docID,
    structuredTextFile: document.structuredTextFile,
    structuredTextFileSha256: document.structuredTextFileSha256,
    pdfLayoutTextFile: document.pdfLayoutTextFile,
    pdfLayoutTextFileSha256: document.pdfLayoutTextFileSha256,
    minimumAnchorCount: document.minimumAnchorCount,
    maximumAnchorCount: document.maximumAnchorCount,
  };
}

export function finalizeConfiguredEdinetAnchorInput(input: {
  extractionBundle: unknown;
  sourceExtractionBundleFile: string;
  editedAnchorInput: unknown;
  sourceAnchorInputFile: string;
  sourceFiles: ConfiguredEdinetAnchorSourceFiles;
  generatedAt?: string;
}): ConfiguredEdinetAnchorFinalRecord {
  const bundle = object(input.extractionBundle, "extractionBundle");
  const sourceExtractionBundleHash = verifyExtractionBundle(bundle);
  const sourceExtractionBundleFile = localBasename(
    input.sourceExtractionBundleFile,
    "sourceExtractionBundleFile",
  );
  const sourceAnchorInputFile = localBasename(input.sourceAnchorInputFile, "sourceAnchorInputFile");
  const edited = rehashEditedTemplate(input.editedAnchorInput);
  verifyTemplateBoundary(edited.record);
  if (text(edited.record.sourceExtractionBundleHash) !== sourceExtractionBundleHash) {
    throw new Error("anchorInput sourceExtractionBundleHash mismatch");
  }
  if (text(edited.record.sourceExtractionBundleFile) !== sourceExtractionBundleFile) {
    throw new Error("anchorInput sourceExtractionBundleFile mismatch");
  }
  const reviewer = required(edited.record.reviewer, "anchorInput.reviewer");
  const reviewedAt = timestamp(edited.record.reviewedAt, "anchorInput.reviewedAt");
  const bundleDocuments = sourceDocuments(bundle);
  const editedDocuments = array(edited.record.documents, "anchorInput.documents");
  if (editedDocuments.length !== bundleDocuments.size) {
    throw new Error("anchorInput document count mismatch");
  }
  const seenDocuments = new Set<string>();
  const seenAnchorIds = new Set<string>();
  const documents = editedDocuments.map((value, index) => {
    const document = object(value, `anchorInput.documents[${index}]`);
    const id = docID(document.docID, `anchorInput.documents[${index}].docID`);
    if (seenDocuments.has(id)) throw new Error(`duplicate anchor document ${id}`);
    seenDocuments.add(id);
    const source = bundleDocuments.get(id);
    if (!source) throw new Error(`anchorInput contains unknown document ${id}`);
    const proposedImmutable = immutableDocumentSource(document);
    const expectedImmutable = {
      pairId: source.pairId,
      pairHash: source.pairHash,
      extractionHash: source.extractionHash,
      docID: source.docID,
      structuredTextFile: source.structuredTextFile,
      structuredTextFileSha256: source.structuredTextFileSha256,
      pdfLayoutTextFile: source.pdfLayoutTextFile,
      pdfLayoutTextFileSha256: source.pdfLayoutTextFileSha256,
      minimumAnchorCount: 1,
      maximumAnchorCount: MAX_ANCHORS_PER_DOCUMENT,
    };
    if (JSON.stringify(canonical(proposedImmutable)) !== JSON.stringify(canonical(expectedImmutable))) {
      throw new Error(`anchorInput document ${id} source fields changed`);
    }
    if (document.status !== "complete_human_input") {
      throw new Error(`anchorInput document ${id} status must be complete_human_input`);
    }
    const rawAnchors = array(document.anchors, `anchorInput document ${id}.anchors`);
    if (rawAnchors.length < 1 || rawAnchors.length > MAX_ANCHORS_PER_DOCUMENT) {
      throw new Error(`anchorInput document ${id} requires 1-${MAX_ANCHORS_PER_DOCUMENT} anchors`);
    }
    if (positiveInteger(document.anchorCount, `anchorInput document ${id}.anchorCount`) !== rawAnchors.length) {
      throw new Error(`anchorInput document ${id} anchorCount mismatch`);
    }
    const structuredFile = localBasename(
      source.structuredTextFile,
      `extractionBundle document ${id}.structuredTextFile`,
    );
    const pdfFile = localBasename(
      source.pdfLayoutTextFile,
      `extractionBundle document ${id}.pdfLayoutTextFile`,
    );
    const structuredEntries = verifyStructuredArchive(
      structuredFile,
      hash(source.structuredTextFileSha256, `extractionBundle document ${id}.structuredTextFileSha256`),
      input.sourceFiles,
    );
    const pdfText = verifyPdfText(
      pdfFile,
      hash(source.pdfLayoutTextFileSha256, `extractionBundle document ${id}.pdfLayoutTextFileSha256`),
      input.sourceFiles,
    );
    const locators = new Set<string>();
    const anchors = rawAnchors.map((anchorValue, anchorIndex) => {
      const anchor = parseAnchor(
        anchorValue,
        `anchorInput document ${id}.anchors[${anchorIndex}]`,
        structuredEntries,
        pdfText,
      );
      if (seenAnchorIds.has(anchor.anchorId)) throw new Error(`duplicate anchorId ${anchor.anchorId}`);
      seenAnchorIds.add(anchor.anchorId);
      const locator = `${anchor.structured.entryPath}:${anchor.structured.lineNumber}|${anchor.pdf.pageNumber}:${anchor.pdf.lineNumber}`;
      if (locators.has(locator)) throw new Error(`duplicate anchor locator in document ${id}`);
      locators.add(locator);
      return anchor;
    }).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
    const base = {
      pairId: required(source.pairId, `extractionBundle document ${id}.pairId`),
      pairHash: hash(source.pairHash, `extractionBundle document ${id}.pairHash`),
      extractionHash: hash(source.extractionHash, `extractionBundle document ${id}.extractionHash`),
      docID: id,
      structuredTextFile: structuredFile,
      structuredTextFileSha256: hash(
        source.structuredTextFileSha256,
        `extractionBundle document ${id}.structuredTextFileSha256`,
      ),
      pdfLayoutTextFile: pdfFile,
      pdfLayoutTextFileSha256: hash(
        source.pdfLayoutTextFileSha256,
        `extractionBundle document ${id}.pdfLayoutTextFileSha256`,
      ),
      anchorCount: anchors.length,
      anchors,
      status: "complete_human_input" as const,
    };
    return { ...base, anchorSetHash: digest(base) };
  }).sort((left, right) => left.docID.localeCompare(right.docID));
  if (seenDocuments.size !== bundleDocuments.size) throw new Error("anchorInput did not cover every document");
  const issuer = object(bundle.issuer, "extractionBundle.issuer");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: hash(bundle.registryHash, "extractionBundle.registryHash"),
    issuer: {
      issuerKey: required(issuer.issuerKey, "extractionBundle.issuer.issuerKey"),
      name: required(issuer.name, "extractionBundle.issuer.name"),
      edinetCode: required(issuer.edinetCode, "extractionBundle.issuer.edinetCode"),
      secCode: required(issuer.secCode, "extractionBundle.issuer.secCode"),
      boundaryHash: hash(issuer.boundaryHash, "extractionBundle.issuer.boundaryHash"),
    },
    sourceExtractionBundleFile,
    sourceExtractionBundleHash,
    sourceAnchorInputFile,
    sourceAnchorInputHash: edited.inputHash,
    generatedAt,
    reviewer,
    reviewedAt,
    documentCount: documents.length,
    anchorCount: documents.reduce((sum, document) => sum + document.anchorCount, 0),
    reviewStatus: "complete_anchor_input" as const,
    comparisonStatus: "not_started" as const,
    documents,
    globalBlockers: [
      "exact_normalized_comparison_not_started",
      "official_pdf_visual_review_not_completed",
      "equivalence_and_impact_decisions_not_recorded",
      "materiality_and_direction_not_recorded",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    automaticComparisonAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, recordHash: digest(base) };
}

export function renderConfiguredEdinetAnchorFinalRecord(
  record: ConfiguredEdinetAnchorFinalRecord,
): string {
  const lines = [
    `# ${record.issuer.name} EDINET finalized human anchors`,
    "",
    `- generatedAt: ${record.generatedAt}`,
    `- reviewer: ${record.reviewer}`,
    `- reviewedAt: ${record.reviewedAt}`,
    `- sourceExtractionBundleFile: ${record.sourceExtractionBundleFile}`,
    `- sourceExtractionBundleHash: ${record.sourceExtractionBundleHash}`,
    `- sourceAnchorInputFile: ${record.sourceAnchorInputFile}`,
    `- sourceAnchorInputHash: ${record.sourceAnchorInputHash}`,
    `- documents/anchors: ${record.documentCount}/${record.anchorCount}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- comparisonStatus: ${record.comparisonStatus}`,
    `- recordHash: ${record.recordHash}`,
    "- automaticComparisonAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "All anchor lineages were verified against the extracted structured and PDF-layout files.",
    "No normalized comparison or equivalence decision has been executed.",
    "",
  ];
  for (const document of record.documents) {
    lines.push(
      `## ${document.docID}`,
      "",
      `- anchorCount: ${document.anchorCount}`,
      `- anchorSetHash: ${document.anchorSetHash}`,
      `- structuredTextFile: ${document.structuredTextFile}`,
      `- pdfLayoutTextFile: ${document.pdfLayoutTextFile}`,
      "",
    );
    for (const anchor of document.anchors) {
      lines.push(
        `### ${anchor.anchorId}`,
        "",
        `- reason: ${anchor.reason}`,
        `- structured: ${anchor.structured.entryPath} L${anchor.structured.lineNumber}`,
        `- structuredTextHash: ${anchor.structured.textHash}`,
        `- PDF: page ${anchor.pdf.pageNumber} L${anchor.pdf.lineNumber}`,
        `- pdfTextHash: ${anchor.pdf.textHash}`,
        `- expectedRelation: ${anchor.expectedRelation}`,
        "- lineageVerified: true",
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
