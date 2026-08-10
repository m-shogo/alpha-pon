import { createHash } from "node:crypto";
import {
  buildSanrioEdinetHumanReviewTemplate,
  validateSanrioEdinetHumanReviewRecord,
  type SanrioEdinetCorrectionScope,
  type SanrioEdinetEquivalenceDecision,
  type SanrioEdinetHumanReviewAnchor,
  type SanrioEdinetHumanReviewRecord,
  type SanrioEdinetReviewAmount,
  type SanrioEdinetReviewImpact,
} from "./edinet-sanrio-human-review-decision.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

type JsonObject = Record<string, unknown>;

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as JsonObject;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = str(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${field} must be a positive integer`);
  return Number(value);
}

function stringArray(value: unknown, field: string): string[] {
  return arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
}

function integerArray(value: unknown, field: string): number[] {
  const result = arr(value, field).map((item, index) => positiveInteger(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${field} must not contain duplicates`);
  return result.sort((a, b) => a - b);
}

function parseDecision(value: unknown, field: string): SanrioEdinetEquivalenceDecision {
  const result = required(value, field);
  if (!["pending_human_review", "equivalent_layout_variance", "substantively_different", "insufficient_visual_evidence"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as SanrioEdinetEquivalenceDecision;
}

function parseScope(value: unknown, field: string): SanrioEdinetCorrectionScope {
  const result = required(value, field);
  if (!["governance_disclosure_only", "financial_statement_change", "mixed", "no_substantive_change", "unknown"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as SanrioEdinetCorrectionScope;
}

function parseImpact(value: unknown, field: string): SanrioEdinetReviewImpact {
  const result = required(value, field);
  if (result !== "yes" && result !== "no" && result !== "unknown") throw new Error(`${field} is invalid`);
  return result;
}

function parseAmounts(value: unknown, field: string): SanrioEdinetReviewAmount[] {
  return arr(value, field).map((amountValue, index) => {
    const amount = obj(amountValue, `${field}[${index}]`);
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function immutableAnchorFields(anchor: SanrioEdinetHumanReviewAnchor): unknown {
  return {
    anchorId: anchor.anchorId,
    candidateId: anchor.candidateId,
    toDocID: anchor.toDocID,
    path: anchor.path,
    pdfBinaryFile: anchor.pdfBinaryFile,
    pdfSha256: anchor.pdfSha256,
    sourceLineNumber: anchor.sourceLineNumber,
    sourceText: anchor.sourceText,
    contextCount: anchor.contextCount,
    availableContextPages: anchor.availableContextPages,
  };
}

export function finalizeSanrioEdinetHumanReviewRecord(input: {
  inspectionReport: unknown;
  sourceInspectionFile: string;
  editedRecord: unknown;
  reviewedAt?: string;
}): SanrioEdinetHumanReviewRecord {
  const edited = obj(input.editedRecord, "editedRecord");
  const generatedAt = timestamp(edited.generatedAt, "editedRecord.generatedAt");
  const template = buildSanrioEdinetHumanReviewTemplate({
    inspectionReport: input.inspectionReport,
    sourceInspectionFile: input.sourceInspectionFile,
    generatedAt,
  });
  if (str(edited.sourceInspectionHash) !== template.sourceInspectionHash) {
    throw new Error("editedRecord sourceInspectionHash mismatch");
  }
  if (str(edited.sourceInspectionFile) !== template.sourceInspectionFile) {
    throw new Error("editedRecord sourceInspectionFile mismatch");
  }
  const reviewer = required(edited.reviewer, "editedRecord.reviewer");
  const reviewedAt = input.reviewedAt
    ? timestamp(input.reviewedAt, "reviewedAt")
    : timestamp(edited.reviewedAt, "editedRecord.reviewedAt");
  const editedAnchors = new Map<string, JsonObject>();
  for (const [index, anchorValue] of arr(edited.anchors, "editedRecord.anchors").entries()) {
    const anchor = obj(anchorValue, `editedRecord.anchors[${index}]`);
    const anchorId = required(anchor.anchorId, `editedRecord.anchors[${index}].anchorId`);
    if (editedAnchors.has(anchorId)) throw new Error(`duplicate edited anchor ${anchorId}`);
    editedAnchors.set(anchorId, anchor);
  }
  if (editedAnchors.size !== template.anchorCount) throw new Error("editedRecord anchor count mismatch");

  const anchors = template.anchors.map((source, index) => {
    const editedAnchor = editedAnchors.get(source.anchorId);
    if (!editedAnchor) throw new Error(`missing edited anchor ${source.anchorId}`);
    const proposedImmutable = {
      anchorId: str(editedAnchor.anchorId),
      candidateId: str(editedAnchor.candidateId),
      toDocID: str(editedAnchor.toDocID),
      path: str(editedAnchor.path),
      pdfBinaryFile: str(editedAnchor.pdfBinaryFile),
      pdfSha256: str(editedAnchor.pdfSha256),
      sourceLineNumber: editedAnchor.sourceLineNumber,
      sourceText: str(editedAnchor.sourceText),
      contextCount: editedAnchor.contextCount,
      availableContextPages: editedAnchor.availableContextPages,
    };
    if (JSON.stringify(canonical(proposedImmutable)) !== JSON.stringify(canonical(immutableAnchorFields(source)))) {
      throw new Error(`editedRecord.anchors[${index}] source fields changed`);
    }
    const decision = parseDecision(editedAnchor.equivalenceDecision, `editedRecord.anchors[${index}].equivalenceDecision`);
    if (decision === "pending_human_review") throw new Error(`editedRecord.anchors[${index}] decision is still pending`);
    if (editedAnchor.completed !== true) throw new Error(`editedRecord.anchors[${index}] must be completed`);
    if (editedAnchor.pdfVisualConfirmation !== true) {
      throw new Error(`editedRecord.anchors[${index}] requires PDF visual confirmation`);
    }
    const selectedContextNumbers = integerArray(
      editedAnchor.selectedContextNumbers,
      `editedRecord.anchors[${index}].selectedContextNumbers`,
    );
    if (selectedContextNumbers.some(number => number > source.contextCount)) {
      throw new Error(`editedRecord.anchors[${index}].selectedContextNumbers exceeds contextCount`);
    }
    const manualPdfPages = integerArray(
      editedAnchor.manualPdfPages,
      `editedRecord.anchors[${index}].manualPdfPages`,
    );
    if (selectedContextNumbers.length === 0 && manualPdfPages.length === 0) {
      throw new Error(`editedRecord.anchors[${index}] requires a selected context or manual PDF page`);
    }
    const confirmedFacts = stringArray(
      editedAnchor.confirmedFacts,
      `editedRecord.anchors[${index}].confirmedFacts`,
    );
    if (decision !== "insufficient_visual_evidence" && confirmedFacts.length === 0) {
      throw new Error(`editedRecord.anchors[${index}] requires at least one confirmed fact`);
    }
    const base: Omit<SanrioEdinetHumanReviewAnchor, "anchorDecisionHash"> = {
      ...immutableAnchorFields(source) as Omit<SanrioEdinetHumanReviewAnchor, "anchorDecisionHash" | "equivalenceDecision" | "selectedContextNumbers" | "manualPdfPages" | "confirmedFacts" | "previouslyKnownFacts" | "assumptions" | "opinions" | "exactAmounts" | "correctionScope" | "financialStatementImpact" | "internalControlImpact" | "auditOpinionImpact" | "pdfVisualConfirmation" | "reviewerNotes" | "completed">,
      equivalenceDecision: decision,
      selectedContextNumbers,
      manualPdfPages,
      confirmedFacts,
      previouslyKnownFacts: stringArray(
        editedAnchor.previouslyKnownFacts,
        `editedRecord.anchors[${index}].previouslyKnownFacts`,
      ),
      assumptions: stringArray(editedAnchor.assumptions, `editedRecord.anchors[${index}].assumptions`),
      opinions: stringArray(editedAnchor.opinions, `editedRecord.anchors[${index}].opinions`),
      exactAmounts: parseAmounts(editedAnchor.exactAmounts, `editedRecord.anchors[${index}].exactAmounts`),
      correctionScope: parseScope(editedAnchor.correctionScope, `editedRecord.anchors[${index}].correctionScope`),
      financialStatementImpact: parseImpact(
        editedAnchor.financialStatementImpact,
        `editedRecord.anchors[${index}].financialStatementImpact`,
      ),
      internalControlImpact: parseImpact(
        editedAnchor.internalControlImpact,
        `editedRecord.anchors[${index}].internalControlImpact`,
      ),
      auditOpinionImpact: parseImpact(
        editedAnchor.auditOpinionImpact,
        `editedRecord.anchors[${index}].auditOpinionImpact`,
      ),
      pdfVisualConfirmation: true,
      reviewerNotes: str(editedAnchor.reviewerNotes),
      completed: true,
    };
    return { ...base, anchorDecisionHash: digest(base) };
  });

  const recordBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: template.issuer,
    sourceInspectionFile: template.sourceInspectionFile,
    sourceInspectionHash: template.sourceInspectionHash,
    generatedAt: template.generatedAt,
    reviewer,
    reviewedAt,
    reviewStatus: "complete_human_review" as const,
    anchorCount: anchors.length,
    completedAnchorCount: anchors.length,
    anchors,
    foundationPreviewEligible: false as const,
    globalBlockers: [
      "foundation_security_master_and_pit_fields_not_provided",
      "foundation_license_and_storage_policy_not_provided",
      "foundation_normalized_section_hash_not_provided",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false as const,
  };
  return validateSanrioEdinetHumanReviewRecord({ ...recordBase, recordHash: digest(recordBase) });
}
