import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetReviewImpact = "yes" | "no" | "unknown";
export type ConfiguredEdinetReviewMateriality = "material" | "not_material" | "unknown";
export type ConfiguredEdinetReviewDirection = "positive" | "negative" | "neutral" | "unknown";
export type ConfiguredEdinetVisualDecision =
  | "pending_human_review"
  | "visually_equivalent"
  | "visually_different"
  | "insufficient_visual_evidence";
export type ConfiguredEdinetEquivalenceDecision =
  | "pending_human_review"
  | "equivalent"
  | "substantively_different"
  | "insufficient_evidence";

export type ConfiguredEdinetReviewAmount = {
  amountText: string;
  currency: string;
  period: string;
  recipient: string;
  payer: string;
  sourcePage: number;
};

type AnchorSource = {
  anchorId: string;
  sourceResultHash: string;
  sourceComparisonResult:
    | "exact_normalized_match"
    | "not_exact_normalized_match_pending_visual_review";
  expectedRelation: "exact_normalized_match" | "visual_layout_variance_review";
  rawExactMatch: boolean;
  normalizedExactMatch: boolean;
  structured: {
    entryPath: string;
    lineNumber: number;
    textHash: string;
    normalizedTextHash: string;
    normalizedLength: number;
  };
  pdf: {
    pageNumber: number;
    lineNumber: number;
    textHash: string;
    normalizedTextHash: string;
    normalizedLength: number;
  };
};

export type ConfiguredEdinetHumanComparisonAnchor = AnchorSource & {
  visualConfirmation: boolean;
  visualDecision: ConfiguredEdinetVisualDecision;
  equivalenceDecision: ConfiguredEdinetEquivalenceDecision;
  confirmedFacts: string[];
  previouslyKnownFacts: string[];
  assumptions: string[];
  opinions: string[];
  exactAmounts: ConfiguredEdinetReviewAmount[];
  accountingImpact: ConfiguredEdinetReviewImpact;
  internalControlImpact: ConfiguredEdinetReviewImpact;
  auditOpinionImpact: ConfiguredEdinetReviewImpact;
  materiality: ConfiguredEdinetReviewMateriality;
  direction: ConfiguredEdinetReviewDirection;
  reviewNotes: string;
  completed: boolean;
  decisionHash: string;
};

export type ConfiguredEdinetHumanComparisonDocument = {
  pairId: string;
  pairHash: string;
  extractionHash: string;
  docID: string;
  sourceDocumentResultHash: string;
  anchorCount: number;
  completedAnchorCount: number;
  anchors: ConfiguredEdinetHumanComparisonAnchor[];
  documentDecisionHash: string;
};

export type ConfiguredEdinetHumanComparisonRecord = {
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
  sourceComparisonFile: string;
  sourceComparisonHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string | null;
  reviewStatus: "draft_human_input" | "complete_human_comparison_review";
  documentCount: number;
  anchorCount: number;
  completedAnchorCount: number;
  documents: ConfiguredEdinetHumanComparisonDocument[];
  globalBlockers: string[];
  automaticFactPromotionAuthorized: false;
  automaticImpactDecisionAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  recordHash: string;
};

type SourceDocument = {
  pairId: string;
  pairHash: string;
  extractionHash: string;
  docID: string;
  sourceDocumentResultHash: string;
  anchors: AnchorSource[];
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

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
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

function stringArray(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => required(item, `${field}[${index}]`));
}

function parseImpact(value: unknown, field: string): ConfiguredEdinetReviewImpact {
  const result = required(value, field);
  if (result !== "yes" && result !== "no" && result !== "unknown") throw new Error(`${field} is invalid`);
  return result;
}

function parseMateriality(value: unknown, field: string): ConfiguredEdinetReviewMateriality {
  const result = required(value, field);
  if (result !== "material" && result !== "not_material" && result !== "unknown") {
    throw new Error(`${field} is invalid`);
  }
  return result;
}

function parseDirection(value: unknown, field: string): ConfiguredEdinetReviewDirection {
  const result = required(value, field);
  if (result !== "positive" && result !== "negative" && result !== "neutral" && result !== "unknown") {
    throw new Error(`${field} is invalid`);
  }
  return result;
}

function parseVisualDecision(value: unknown, field: string): ConfiguredEdinetVisualDecision {
  const result = required(value, field);
  if (!["pending_human_review", "visually_equivalent", "visually_different", "insufficient_visual_evidence"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as ConfiguredEdinetVisualDecision;
}

function parseEquivalenceDecision(value: unknown, field: string): ConfiguredEdinetEquivalenceDecision {
  const result = required(value, field);
  if (!["pending_human_review", "equivalent", "substantively_different", "insufficient_evidence"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as ConfiguredEdinetEquivalenceDecision;
}

function parseAmounts(value: unknown, field: string): ConfiguredEdinetReviewAmount[] {
  return array(value, field).map((item, index) => {
    const amount = object(item, `${field}[${index}]`);
    return {
      amountText: required(amount.amountText, `${field}[${index}].amountText`),
      currency: required(amount.currency, `${field}[${index}].currency`),
      period: required(amount.period, `${field}[${index}].period`),
      recipient: required(amount.recipient, `${field}[${index}].recipient`),
      payer: required(amount.payer, `${field}[${index}].payer`),
      sourcePage: positiveInteger(amount.sourcePage, `${field}[${index}].sourcePage`),
    };
  });
}

function verifyComparisonReport(report: JsonObject): string {
  if (report.schemaVersion !== 1 || report.source !== "edinet") {
    throw new Error("comparisonReport schema/source is unsupported");
  }
  if (
    report.comparisonStatus !== "complete_exact_normalized_comparison"
    || report.reviewStatus !== "pending_human_comparison_review"
    || report.fuzzyMatchingUsed !== false
    || report.semanticEquivalenceInferred !== false
    || report.officialPdfVisualReviewComplete !== false
    || report.automaticEquivalenceDecisionAuthorized !== false
    || report.foundationPreviewEligible !== false
    || report.appendAuthorized !== false
  ) {
    throw new Error("comparisonReport safety boundary is invalid");
  }
  const expected = hash(report.reportHash, "comparisonReport.reportHash");
  const { reportHash: _ignored, ...withoutHash } = report;
  if (digest(withoutHash) !== expected) throw new Error("comparisonReport.reportHash mismatch");
  return expected;
}

function parseComparisonResult(value: unknown, field: string): AnchorSource["sourceComparisonResult"] {
  const result = required(value, field);
  if (result !== "exact_normalized_match" && result !== "not_exact_normalized_match_pending_visual_review") {
    throw new Error(`${field} is invalid`);
  }
  return result;
}

function parseExpectedRelation(value: unknown, field: string): AnchorSource["expectedRelation"] {
  const result = required(value, field);
  if (result !== "exact_normalized_match" && result !== "visual_layout_variance_review") {
    throw new Error(`${field} is invalid`);
  }
  return result;
}

function parseAnchorSource(input: {
  anchor: JsonObject;
  field: string;
  resultField: "comparisonResult" | "sourceComparisonResult";
  hashField: "resultHash" | "sourceResultHash";
}): AnchorSource {
  const { anchor, field } = input;
  const structured = object(anchor.structured, `${field}.structured`);
  const pdf = object(anchor.pdf, `${field}.pdf`);
  if (typeof anchor.rawExactMatch !== "boolean" || typeof anchor.normalizedExactMatch !== "boolean") {
    throw new Error(`${field} exact-match flags are invalid`);
  }
  return {
    anchorId: required(anchor.anchorId, `${field}.anchorId`),
    sourceResultHash: hash(anchor[input.hashField], `${field}.${input.hashField}`),
    sourceComparisonResult: parseComparisonResult(anchor[input.resultField], `${field}.${input.resultField}`),
    expectedRelation: parseExpectedRelation(anchor.expectedRelation, `${field}.expectedRelation`),
    rawExactMatch: anchor.rawExactMatch,
    normalizedExactMatch: anchor.normalizedExactMatch,
    structured: {
      entryPath: required(structured.entryPath, `${field}.structured.entryPath`),
      lineNumber: positiveInteger(structured.lineNumber, `${field}.structured.lineNumber`),
      textHash: hash(structured.textHash, `${field}.structured.textHash`),
      normalizedTextHash: hash(structured.normalizedTextHash, `${field}.structured.normalizedTextHash`),
      normalizedLength: positiveInteger(structured.normalizedLength, `${field}.structured.normalizedLength`),
    },
    pdf: {
      pageNumber: positiveInteger(pdf.pageNumber, `${field}.pdf.pageNumber`),
      lineNumber: positiveInteger(pdf.lineNumber, `${field}.pdf.lineNumber`),
      textHash: hash(pdf.textHash, `${field}.pdf.textHash`),
      normalizedTextHash: hash(pdf.normalizedTextHash, `${field}.pdf.normalizedTextHash`),
      normalizedLength: positiveInteger(pdf.normalizedLength, `${field}.pdf.normalizedLength`),
    },
  };
}

function sourceDocuments(report: JsonObject): SourceDocument[] {
  const seenDocs = new Set<string>();
  const seenAnchors = new Set<string>();
  const documents = array(report.documents, "comparisonReport.documents").map((value, documentIndex) => {
    const document = object(value, `comparisonReport.documents[${documentIndex}]`);
    const documentHash = hash(document.documentResultHash, `comparisonReport.documents[${documentIndex}].documentResultHash`);
    const { documentResultHash: _ignored, ...withoutHash } = document;
    if (digest(withoutHash) !== documentHash) {
      throw new Error(`comparisonReport.documents[${documentIndex}].documentResultHash mismatch`);
    }
    const id = docID(document.docID, `comparisonReport.documents[${documentIndex}].docID`);
    if (seenDocs.has(id)) throw new Error(`comparisonReport has duplicate document ${id}`);
    seenDocs.add(id);
    const anchors = array(document.anchors, `comparisonReport.documents[${documentIndex}].anchors`).map((value2, anchorIndex) => {
      const anchor = object(value2, `comparisonReport.documents[${documentIndex}].anchors[${anchorIndex}]`);
      const resultHash = hash(anchor.resultHash, `comparisonReport.documents[${documentIndex}].anchors[${anchorIndex}].resultHash`);
      const { resultHash: _ignoredAnchorHash, ...anchorWithoutHash } = anchor;
      if (digest(anchorWithoutHash) !== resultHash) {
        throw new Error(`comparisonReport.documents[${documentIndex}].anchors[${anchorIndex}].resultHash mismatch`);
      }
      const source = parseAnchorSource({
        anchor,
        field: `comparisonReport.documents[${documentIndex}].anchors[${anchorIndex}]`,
        resultField: "comparisonResult",
        hashField: "resultHash",
      });
      if (seenAnchors.has(source.anchorId)) throw new Error(`comparisonReport has duplicate anchor ${source.anchorId}`);
      seenAnchors.add(source.anchorId);
      return source;
    }).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
    if (anchors.length !== positiveInteger(document.anchorCount, `comparisonReport.documents[${documentIndex}].anchorCount`)) {
      throw new Error(`comparisonReport.documents[${documentIndex}].anchorCount mismatch`);
    }
    return {
      pairId: required(document.pairId, `comparisonReport.documents[${documentIndex}].pairId`),
      pairHash: hash(document.pairHash, `comparisonReport.documents[${documentIndex}].pairHash`),
      extractionHash: hash(document.extractionHash, `comparisonReport.documents[${documentIndex}].extractionHash`),
      docID: id,
      sourceDocumentResultHash: documentHash,
      anchors,
    };
  }).sort((left, right) => left.docID.localeCompare(right.docID));
  if (documents.length !== positiveInteger(report.documentCount, "comparisonReport.documentCount")) {
    throw new Error("comparisonReport.documentCount mismatch");
  }
  if (documents.reduce((sum, document) => sum + document.anchors.length, 0)
    !== positiveInteger(report.anchorCount, "comparisonReport.anchorCount")) {
    throw new Error("comparisonReport.anchorCount mismatch");
  }
  return documents;
}

function issuerFromReport(report: JsonObject): ConfiguredEdinetHumanComparisonRecord["issuer"] {
  const issuer = object(report.issuer, "comparisonReport.issuer");
  return {
    issuerKey: required(issuer.issuerKey, "comparisonReport.issuer.issuerKey"),
    name: required(issuer.name, "comparisonReport.issuer.name"),
    edinetCode: required(issuer.edinetCode, "comparisonReport.issuer.edinetCode"),
    secCode: required(issuer.secCode, "comparisonReport.issuer.secCode"),
    boundaryHash: hash(issuer.boundaryHash, "comparisonReport.issuer.boundaryHash"),
  };
}

export function buildConfiguredEdinetHumanComparisonTemplate(input: {
  comparisonReport: unknown;
  sourceComparisonFile: string;
  generatedAt?: string;
}): ConfiguredEdinetHumanComparisonRecord {
  const report = object(input.comparisonReport, "comparisonReport");
  const sourceComparisonHash = verifyComparisonReport(report);
  const sourceComparisonFile = localJsonBasename(input.sourceComparisonFile, "sourceComparisonFile");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const documents = sourceDocuments(report).map(source => {
    const anchors = source.anchors.map(anchorSource => {
      const base: Omit<ConfiguredEdinetHumanComparisonAnchor, "decisionHash"> = {
        ...anchorSource,
        visualConfirmation: false,
        visualDecision: "pending_human_review",
        equivalenceDecision: "pending_human_review",
        confirmedFacts: [],
        previouslyKnownFacts: [],
        assumptions: [],
        opinions: [],
        exactAmounts: [],
        accountingImpact: "unknown",
        internalControlImpact: "unknown",
        auditOpinionImpact: "unknown",
        materiality: "unknown",
        direction: "unknown",
        reviewNotes: "",
        completed: false,
      };
      return { ...base, decisionHash: digest(base) };
    });
    const base = {
      pairId: source.pairId,
      pairHash: source.pairHash,
      extractionHash: source.extractionHash,
      docID: source.docID,
      sourceDocumentResultHash: source.sourceDocumentResultHash,
      anchorCount: anchors.length,
      completedAnchorCount: 0,
      anchors,
    };
    return { ...base, documentDecisionHash: digest(base) };
  });
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: hash(report.registryHash, "comparisonReport.registryHash"),
    issuer: issuerFromReport(report),
    sourceComparisonFile,
    sourceComparisonHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    reviewStatus: "draft_human_input" as const,
    documentCount: documents.length,
    anchorCount: documents.reduce((sum, document) => sum + document.anchorCount, 0),
    completedAnchorCount: 0,
    documents,
    globalBlockers: [
      "human_reviewer_identity_required",
      "official_pdf_visual_confirmation_required_for_every_anchor",
      "all_visual_and_equivalence_decisions_required",
      "fact_known_assumption_opinion_separation_required",
      "impact_materiality_direction_decisions_must_be_explicit",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    automaticFactPromotionAuthorized: false as const,
    automaticImpactDecisionAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, recordHash: digest(base) };
}

function assertDecisionConsistency(
  visual: ConfiguredEdinetVisualDecision,
  equivalence: ConfiguredEdinetEquivalenceDecision,
  field: string,
): void {
  if (visual === "pending_human_review" || equivalence === "pending_human_review") {
    throw new Error(`${field} decisions must not remain pending`);
  }
  const expected: Record<Exclude<ConfiguredEdinetVisualDecision, "pending_human_review">, ConfiguredEdinetEquivalenceDecision> = {
    visually_equivalent: "equivalent",
    visually_different: "substantively_different",
    insufficient_visual_evidence: "insufficient_evidence",
  };
  if (expected[visual] !== equivalence) throw new Error(`${field} visual/equivalence decisions are inconsistent`);
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function finalizeConfiguredEdinetHumanComparisonReview(input: {
  comparisonReport: unknown;
  sourceComparisonFile: string;
  editedReviewInput: unknown;
  generatedAt?: string;
}): ConfiguredEdinetHumanComparisonRecord {
  const report = object(input.comparisonReport, "comparisonReport");
  const sourceComparisonHash = verifyComparisonReport(report);
  const sourceComparisonFile = localJsonBasename(input.sourceComparisonFile, "sourceComparisonFile");
  const sources = sourceDocuments(report);
  const sourceByDoc = new Map(sources.map(document => [document.docID, document]));
  const edited = object(input.editedReviewInput, "reviewInput");
  if (
    edited.schemaVersion !== 1
    || edited.source !== "edinet"
    || edited.reviewStatus !== "draft_human_input"
    || edited.automaticFactPromotionAuthorized !== false
    || edited.automaticImpactDecisionAuthorized !== false
    || edited.foundationPreviewEligible !== false
    || edited.appendAuthorized !== false
  ) {
    throw new Error("reviewInput safety boundary is invalid");
  }
  if (text(edited.sourceComparisonHash) !== sourceComparisonHash) throw new Error("reviewInput sourceComparisonHash mismatch");
  if (text(edited.sourceComparisonFile) !== sourceComparisonFile) throw new Error("reviewInput sourceComparisonFile mismatch");
  if (text(edited.registryHash) !== text(report.registryHash)) throw new Error("reviewInput registryHash mismatch");
  if (!sameCanonical(edited.issuer, issuerFromReport(report))) throw new Error("reviewInput issuer fields changed");
  const reviewer = required(edited.reviewer, "reviewInput.reviewer");
  const reviewedAt = timestamp(edited.reviewedAt, "reviewInput.reviewedAt");
  const editedDocuments = array(edited.documents, "reviewInput.documents");
  if (editedDocuments.length !== sourceByDoc.size) throw new Error("reviewInput document count mismatch");
  const seenDocs = new Set<string>();
  const seenAnchors = new Set<string>();
  const documents = editedDocuments.map((value, documentIndex) => {
    const document = object(value, `reviewInput.documents[${documentIndex}]`);
    const id = docID(document.docID, `reviewInput.documents[${documentIndex}].docID`);
    if (seenDocs.has(id)) throw new Error(`duplicate review document ${id}`);
    seenDocs.add(id);
    const source = sourceByDoc.get(id);
    if (!source) throw new Error(`unknown review document ${id}`);
    if (
      text(document.pairId) !== source.pairId
      || text(document.pairHash) !== source.pairHash
      || text(document.extractionHash) !== source.extractionHash
      || text(document.sourceDocumentResultHash) !== source.sourceDocumentResultHash
    ) {
      throw new Error(`reviewInput document ${id} source fields changed`);
    }
    const sourceByAnchor = new Map(source.anchors.map(anchor => [anchor.anchorId, anchor]));
    const editedAnchors = array(document.anchors, `reviewInput document ${id}.anchors`);
    if (editedAnchors.length !== sourceByAnchor.size) throw new Error(`reviewInput document ${id} anchor count mismatch`);
    const anchors = editedAnchors.map((anchorValue, anchorIndex) => {
      const anchor = object(anchorValue, `reviewInput document ${id}.anchors[${anchorIndex}]`);
      const anchorId = required(anchor.anchorId, `reviewInput document ${id}.anchors[${anchorIndex}].anchorId`);
      if (seenAnchors.has(anchorId)) throw new Error(`duplicate review anchor ${anchorId}`);
      seenAnchors.add(anchorId);
      const sourceAnchor = sourceByAnchor.get(anchorId);
      if (!sourceAnchor) throw new Error(`unknown review anchor ${anchorId}`);
      const editedSource = parseAnchorSource({
        anchor,
        field: `reviewInput anchor ${anchorId}`,
        resultField: "sourceComparisonResult",
        hashField: "sourceResultHash",
      });
      if (!sameCanonical(editedSource, sourceAnchor)) throw new Error(`reviewInput anchor ${anchorId} source fields changed`);
      if (anchor.completed !== true) throw new Error(`reviewInput anchor ${anchorId} must be completed`);
      if (anchor.visualConfirmation !== true) throw new Error(`reviewInput anchor ${anchorId} requires official PDF visual confirmation`);
      const visualDecision = parseVisualDecision(anchor.visualDecision, `reviewInput anchor ${anchorId}.visualDecision`);
      const equivalenceDecision = parseEquivalenceDecision(anchor.equivalenceDecision, `reviewInput anchor ${anchorId}.equivalenceDecision`);
      assertDecisionConsistency(visualDecision, equivalenceDecision, `reviewInput anchor ${anchorId}`);
      const confirmedFacts = stringArray(anchor.confirmedFacts, `reviewInput anchor ${anchorId}.confirmedFacts`);
      const previouslyKnownFacts = stringArray(anchor.previouslyKnownFacts, `reviewInput anchor ${anchorId}.previouslyKnownFacts`);
      const assumptions = stringArray(anchor.assumptions, `reviewInput anchor ${anchorId}.assumptions`);
      const opinions = stringArray(anchor.opinions, `reviewInput anchor ${anchorId}.opinions`);
      if (equivalenceDecision !== "insufficient_evidence" && confirmedFacts.length === 0) {
        throw new Error(`reviewInput anchor ${anchorId} requires at least one confirmed fact`);
      }
      const base: Omit<ConfiguredEdinetHumanComparisonAnchor, "decisionHash"> = {
        ...sourceAnchor,
        visualConfirmation: true,
        visualDecision,
        equivalenceDecision,
        confirmedFacts,
        previouslyKnownFacts,
        assumptions,
        opinions,
        exactAmounts: parseAmounts(anchor.exactAmounts, `reviewInput anchor ${anchorId}.exactAmounts`),
        accountingImpact: parseImpact(anchor.accountingImpact, `reviewInput anchor ${anchorId}.accountingImpact`),
        internalControlImpact: parseImpact(anchor.internalControlImpact, `reviewInput anchor ${anchorId}.internalControlImpact`),
        auditOpinionImpact: parseImpact(anchor.auditOpinionImpact, `reviewInput anchor ${anchorId}.auditOpinionImpact`),
        materiality: parseMateriality(anchor.materiality, `reviewInput anchor ${anchorId}.materiality`),
        direction: parseDirection(anchor.direction, `reviewInput anchor ${anchorId}.direction`),
        reviewNotes: text(anchor.reviewNotes),
        completed: true,
      };
      return { ...base, decisionHash: digest(base) };
    }).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
    const base = {
      pairId: source.pairId,
      pairHash: source.pairHash,
      extractionHash: source.extractionHash,
      docID: id,
      sourceDocumentResultHash: source.sourceDocumentResultHash,
      anchorCount: anchors.length,
      completedAnchorCount: anchors.length,
      anchors,
    };
    return { ...base, documentDecisionHash: digest(base) };
  }).sort((left, right) => left.docID.localeCompare(right.docID));
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const finalBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: hash(report.registryHash, "comparisonReport.registryHash"),
    issuer: issuerFromReport(report),
    sourceComparisonFile,
    sourceComparisonHash,
    generatedAt,
    reviewer,
    reviewedAt,
    reviewStatus: "complete_human_comparison_review" as const,
    documentCount: documents.length,
    anchorCount: documents.reduce((sum, document) => sum + document.anchorCount, 0),
    completedAnchorCount: documents.reduce((sum, document) => sum + document.completedAnchorCount, 0),
    documents,
    globalBlockers: [
      "human_review_does_not_automatically_promote_facts",
      "foundation_security_master_pit_license_and_revision_mapping_required",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    automaticFactPromotionAuthorized: false as const,
    automaticImpactDecisionAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...finalBase, recordHash: digest(finalBase) };
}

export function renderConfiguredEdinetHumanComparisonRecord(record: ConfiguredEdinetHumanComparisonRecord): string {
  const lines = [
    `# ${record.issuer.name} EDINET human comparison review`,
    "",
    `- generatedAt: ${record.generatedAt}`,
    `- reviewer: ${record.reviewer || "pending"}`,
    `- reviewedAt: ${record.reviewedAt ?? "pending"}`,
    `- sourceComparisonFile: ${record.sourceComparisonFile}`,
    `- sourceComparisonHash: ${record.sourceComparisonHash}`,
    `- documents/anchors/completed: ${record.documentCount}/${record.anchorCount}/${record.completedAnchorCount}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- recordHash: ${record.recordHash}`,
    "- automaticFactPromotionAuthorized: false",
    "- automaticImpactDecisionAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
  ];
  for (const document of record.documents) {
    lines.push(`## ${document.docID}`, "", `- anchors: ${document.anchorCount}`, `- completed: ${document.completedAnchorCount}`, "");
    for (const anchor of document.anchors) {
      lines.push(
        `### ${anchor.anchorId}`,
        "",
        `- source comparison: ${anchor.sourceComparisonResult}`,
        `- visual confirmation: ${anchor.visualConfirmation}`,
        `- visual decision: ${anchor.visualDecision}`,
        `- equivalence decision: ${anchor.equivalenceDecision}`,
        `- accounting/internal-control/audit: ${anchor.accountingImpact}/${anchor.internalControlImpact}/${anchor.auditOpinionImpact}`,
        `- materiality/direction: ${anchor.materiality}/${anchor.direction}`,
        `- confirmed/known/assumptions/opinions: ${anchor.confirmedFacts.length}/${anchor.previouslyKnownFacts.length}/${anchor.assumptions.length}/${anchor.opinions.length}`,
        `- exact amounts: ${anchor.exactAmounts.length}`,
        `- decisionHash: ${anchor.decisionHash}`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
