import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

type JsonObject = Record<string, unknown>;

export type ImpactDecision =
  | "pending_human_review"
  | "changed"
  | "not_changed"
  | "not_applicable"
  | "insufficient_evidence";

export type CorrectionScopeDecision =
  | "pending_human_review"
  | "governance_disclosure_only"
  | "financial_statement_change"
  | "internal_control_change"
  | "audit_opinion_change"
  | "mixed"
  | "no_substantive_change"
  | "insufficient_evidence";

export type ImpactEvidenceReference = {
  side: "before" | "after" | "pdf";
  lineNumber: number | null;
  pdfPage: number | null;
  description: string;
};

export type ImpactSectionDecision = {
  decision: ImpactDecision;
  affectedItems: string[];
  evidenceReferences: ImpactEvidenceReference[];
  notes: string;
  completed: boolean;
};

export type SanrioEdinetImpactChecklistCandidate = {
  candidateId: string;
  batchId: string;
  sourceClusterId: string;
  pairId: string;
  fromDocID: string;
  toDocID: string;
  logicalRoleKey: string;
  path: string;
  beforeTextHash: string | null;
  afterTextHash: string | null;
  numericLineCount: number;
  footnoteLineCount: number;
  accountingKeywordLineCount: number;
  sourceCandidateHash: string;
  financialStatements: ImpactSectionDecision;
  internalControl: ImpactSectionDecision;
  auditOpinion: ImpactSectionDecision;
  correctionScope: CorrectionScopeDecision;
  confirmedFacts: string[];
  previouslyKnownFacts: string[];
  assumptions: string[];
  opinions: string[];
  reviewerNotes: string;
  completed: boolean;
  decisionHash: string;
};

export type SanrioEdinetImpactChecklistRecord = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceContentBundleFile: string;
  sourceContentBundleHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string | null;
  reviewStatus: "draft_human_input" | "complete_human_review";
  candidateCount: number;
  completedCandidateCount: number;
  candidates: SanrioEdinetImpactChecklistCandidate[];
  foundationPreviewEligible: false;
  appendAuthorized: false;
  globalBlockers: string[];
  recordHash: string;
};

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
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

function requireHash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, field: string): number {
  const result = nonNegativeInteger(value, field);
  if (result === 0) throw new Error(`${field} must be a positive integer`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function strings(value: unknown, field: string): string[] {
  return arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
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

function verifyContentBundle(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("contentBundle schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("contentBundle safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "contentBundle.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("contentBundle issuer is not Sanrio");
  }
  const expected = requireHash(record.bundleHash, "contentBundle.bundleHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceBatchWorkspaceHash: record.sourceBatchWorkspaceHash,
    planHash: record.planHash,
    candidates: record.candidates,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("contentBundle.bundleHash mismatch");
  return expected;
}

function nullableHash(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireHash(value, field);
}

function emptySection(): ImpactSectionDecision {
  return {
    decision: "pending_human_review",
    affectedItems: [],
    evidenceReferences: [],
    notes: "",
    completed: false,
  };
}

function sourceCandidates(bundle: JsonObject): Array<Omit<SanrioEdinetImpactChecklistCandidate,
  "financialStatements" | "internalControl" | "auditOpinion" | "correctionScope" |
  "confirmedFacts" | "previouslyKnownFacts" | "assumptions" | "opinions" |
  "reviewerNotes" | "completed" | "decisionHash">> {
  return arr(bundle.candidates, "contentBundle.candidates").map((value, index) => {
    const candidate = obj(value, `contentBundle.candidates[${index}]`);
    if (candidate.factStatus !== "unreviewed_source_text") {
      throw new Error(`contentBundle.candidates[${index}].factStatus must remain unreviewed_source_text`);
    }
    return {
      candidateId: required(candidate.candidateId, `contentBundle.candidates[${index}].candidateId`),
      batchId: required(candidate.batchId, `contentBundle.candidates[${index}].batchId`),
      sourceClusterId: required(candidate.sourceClusterId, `contentBundle.candidates[${index}].sourceClusterId`),
      pairId: required(candidate.pairId, `contentBundle.candidates[${index}].pairId`),
      fromDocID: requireDocID(candidate.fromDocID, `contentBundle.candidates[${index}].fromDocID`),
      toDocID: requireDocID(candidate.toDocID, `contentBundle.candidates[${index}].toDocID`),
      logicalRoleKey: required(candidate.logicalRoleKey, `contentBundle.candidates[${index}].logicalRoleKey`),
      path: required(candidate.path, `contentBundle.candidates[${index}].path`),
      beforeTextHash: nullableHash(candidate.beforeTextHash, `contentBundle.candidates[${index}].beforeTextHash`),
      afterTextHash: nullableHash(candidate.afterTextHash, `contentBundle.candidates[${index}].afterTextHash`),
      numericLineCount: nonNegativeInteger(candidate.numericLineCount, `contentBundle.candidates[${index}].numericLineCount`),
      footnoteLineCount: nonNegativeInteger(candidate.footnoteLineCount, `contentBundle.candidates[${index}].footnoteLineCount`),
      accountingKeywordLineCount: nonNegativeInteger(
        candidate.accountingKeywordLineCount,
        `contentBundle.candidates[${index}].accountingKeywordLineCount`,
      ),
      sourceCandidateHash: requireHash(candidate.candidateHash, `contentBundle.candidates[${index}].candidateHash`),
    };
  }).sort((left, right) => `${left.batchId}|${left.pairId}|${left.candidateId}`.localeCompare(
    `${right.batchId}|${right.pairId}|${right.candidateId}`,
  ));
}

function decisionPayload(candidate: Omit<SanrioEdinetImpactChecklistCandidate, "decisionHash">): unknown {
  return candidate;
}

export function buildSanrioEdinetImpactChecklistTemplate(input: {
  contentBundle: unknown;
  sourceContentBundleFile: string;
  generatedAt?: string;
}): SanrioEdinetImpactChecklistRecord {
  const bundle = obj(input.contentBundle, "contentBundle");
  const sourceContentBundleHash = verifyContentBundle(bundle);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const sourceContentBundleFile = localJsonBasename(input.sourceContentBundleFile, "sourceContentBundleFile");
  const candidates = sourceCandidates(bundle).map(source => {
    const base: Omit<SanrioEdinetImpactChecklistCandidate, "decisionHash"> = {
      ...source,
      financialStatements: emptySection(),
      internalControl: emptySection(),
      auditOpinion: emptySection(),
      correctionScope: "pending_human_review",
      confirmedFacts: [],
      previouslyKnownFacts: [],
      assumptions: [],
      opinions: [],
      reviewerNotes: "",
      completed: false,
    };
    return { ...base, decisionHash: digest(decisionPayload(base)) };
  });
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceContentBundleFile,
    sourceContentBundleHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    reviewStatus: "draft_human_input" as const,
    candidateCount: candidates.length,
    completedCandidateCount: 0,
    candidates,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
    globalBlockers: [
      "human_reviewer_identity_required",
      "all_impact_sections_require_explicit_decisions",
      "pdf_page_or_source_line_evidence_required",
      "fact_known_assumption_opinion_separation_required",
      "foundation_security_master_and_pit_fields_not_provided",
      "foundation_preview_not_authorized",
    ].sort(),
  };
  return { ...base, recordHash: digest(base) };
}

function parseImpactDecision(value: unknown, field: string): ImpactDecision {
  const result = required(value, field);
  if (!["pending_human_review", "changed", "not_changed", "not_applicable", "insufficient_evidence"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as ImpactDecision;
}

function parseScope(value: unknown, field: string): CorrectionScopeDecision {
  const result = required(value, field);
  if (![
    "pending_human_review",
    "governance_disclosure_only",
    "financial_statement_change",
    "internal_control_change",
    "audit_opinion_change",
    "mixed",
    "no_substantive_change",
    "insufficient_evidence",
  ].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as CorrectionScopeDecision;
}

function parseEvidenceReferences(value: unknown, field: string): ImpactEvidenceReference[] {
  return arr(value, field).map((referenceValue, index) => {
    const reference = obj(referenceValue, `${field}[${index}]`);
    const side = required(reference.side, `${field}[${index}].side`);
    if (side !== "before" && side !== "after" && side !== "pdf") {
      throw new Error(`${field}[${index}].side is invalid`);
    }
    const lineNumber = reference.lineNumber === null
      ? null
      : positiveInteger(reference.lineNumber, `${field}[${index}].lineNumber`);
    const pdfPage = reference.pdfPage === null
      ? null
      : positiveInteger(reference.pdfPage, `${field}[${index}].pdfPage`);
    if (side === "pdf" && pdfPage === null) throw new Error(`${field}[${index}] PDF reference requires pdfPage`);
    if (side !== "pdf" && lineNumber === null) throw new Error(`${field}[${index}] source reference requires lineNumber`);
    return {
      side,
      lineNumber,
      pdfPage,
      description: required(reference.description, `${field}[${index}].description`),
    };
  });
}

function parseSection(value: unknown, field: string): ImpactSectionDecision {
  const section = obj(value, field);
  const decision = parseImpactDecision(section.decision, `${field}.decision`);
  if (decision === "pending_human_review") throw new Error(`${field}.decision is still pending`);
  if (section.completed !== true) throw new Error(`${field}.completed must be true`);
  const evidenceReferences = parseEvidenceReferences(section.evidenceReferences, `${field}.evidenceReferences`);
  if (decision !== "not_applicable" && evidenceReferences.length === 0) {
    throw new Error(`${field} requires at least one evidence reference`);
  }
  const affectedItems = strings(section.affectedItems, `${field}.affectedItems`);
  if (decision === "changed" && affectedItems.length === 0) {
    throw new Error(`${field}.affectedItems is required when changed`);
  }
  return {
    decision,
    affectedItems,
    evidenceReferences,
    notes: str(section.notes),
    completed: true,
  };
}

function immutableSource(candidate: SanrioEdinetImpactChecklistCandidate): unknown {
  return {
    candidateId: candidate.candidateId,
    batchId: candidate.batchId,
    sourceClusterId: candidate.sourceClusterId,
    pairId: candidate.pairId,
    fromDocID: candidate.fromDocID,
    toDocID: candidate.toDocID,
    logicalRoleKey: candidate.logicalRoleKey,
    path: candidate.path,
    beforeTextHash: candidate.beforeTextHash,
    afterTextHash: candidate.afterTextHash,
    numericLineCount: candidate.numericLineCount,
    footnoteLineCount: candidate.footnoteLineCount,
    accountingKeywordLineCount: candidate.accountingKeywordLineCount,
    sourceCandidateHash: candidate.sourceCandidateHash,
  };
}

export function finalizeSanrioEdinetImpactChecklist(input: {
  contentBundle: unknown;
  sourceContentBundleFile: string;
  editedRecord: unknown;
  reviewedAt?: string;
}): SanrioEdinetImpactChecklistRecord {
  const edited = obj(input.editedRecord, "editedRecord");
  const template = buildSanrioEdinetImpactChecklistTemplate({
    contentBundle: input.contentBundle,
    sourceContentBundleFile: input.sourceContentBundleFile,
    generatedAt: timestamp(edited.generatedAt, "editedRecord.generatedAt"),
  });
  if (str(edited.sourceContentBundleHash) !== template.sourceContentBundleHash) {
    throw new Error("editedRecord sourceContentBundleHash mismatch");
  }
  const reviewer = required(edited.reviewer, "editedRecord.reviewer");
  const reviewedAt = input.reviewedAt
    ? timestamp(input.reviewedAt, "reviewedAt")
    : timestamp(edited.reviewedAt, "editedRecord.reviewedAt");
  const editedById = new Map<string, JsonObject>();
  for (const [index, value] of arr(edited.candidates, "editedRecord.candidates").entries()) {
    const candidate = obj(value, `editedRecord.candidates[${index}]`);
    const id = required(candidate.candidateId, `editedRecord.candidates[${index}].candidateId`);
    if (editedById.has(id)) throw new Error(`duplicate edited candidate ${id}`);
    editedById.set(id, candidate);
  }
  if (editedById.size !== template.candidateCount) throw new Error("editedRecord candidate count mismatch");

  const candidates = template.candidates.map((source, index) => {
    const editedCandidate = editedById.get(source.candidateId);
    if (!editedCandidate) throw new Error(`missing edited candidate ${source.candidateId}`);
    const proposedSource = {
      candidateId: str(editedCandidate.candidateId),
      batchId: str(editedCandidate.batchId),
      sourceClusterId: str(editedCandidate.sourceClusterId),
      pairId: str(editedCandidate.pairId),
      fromDocID: str(editedCandidate.fromDocID),
      toDocID: str(editedCandidate.toDocID),
      logicalRoleKey: str(editedCandidate.logicalRoleKey),
      path: str(editedCandidate.path),
      beforeTextHash: editedCandidate.beforeTextHash,
      afterTextHash: editedCandidate.afterTextHash,
      numericLineCount: editedCandidate.numericLineCount,
      footnoteLineCount: editedCandidate.footnoteLineCount,
      accountingKeywordLineCount: editedCandidate.accountingKeywordLineCount,
      sourceCandidateHash: str(editedCandidate.sourceCandidateHash),
    };
    if (JSON.stringify(canonical(proposedSource)) !== JSON.stringify(canonical(immutableSource(source)))) {
      throw new Error(`editedRecord.candidates[${index}] source fields changed`);
    }
    if (editedCandidate.completed !== true) throw new Error(`editedRecord.candidates[${index}].completed must be true`);
    const correctionScope = parseScope(editedCandidate.correctionScope, `editedRecord.candidates[${index}].correctionScope`);
    if (correctionScope === "pending_human_review") {
      throw new Error(`editedRecord.candidates[${index}].correctionScope is still pending`);
    }
    const base: Omit<SanrioEdinetImpactChecklistCandidate, "decisionHash"> = {
      ...immutableSource(source) as Omit<SanrioEdinetImpactChecklistCandidate,
        "financialStatements" | "internalControl" | "auditOpinion" | "correctionScope" |
        "confirmedFacts" | "previouslyKnownFacts" | "assumptions" | "opinions" |
        "reviewerNotes" | "completed" | "decisionHash">,
      financialStatements: parseSection(
        editedCandidate.financialStatements,
        `editedRecord.candidates[${index}].financialStatements`,
      ),
      internalControl: parseSection(
        editedCandidate.internalControl,
        `editedRecord.candidates[${index}].internalControl`,
      ),
      auditOpinion: parseSection(
        editedCandidate.auditOpinion,
        `editedRecord.candidates[${index}].auditOpinion`,
      ),
      correctionScope,
      confirmedFacts: strings(editedCandidate.confirmedFacts, `editedRecord.candidates[${index}].confirmedFacts`),
      previouslyKnownFacts: strings(
        editedCandidate.previouslyKnownFacts,
        `editedRecord.candidates[${index}].previouslyKnownFacts`,
      ),
      assumptions: strings(editedCandidate.assumptions, `editedRecord.candidates[${index}].assumptions`),
      opinions: strings(editedCandidate.opinions, `editedRecord.candidates[${index}].opinions`),
      reviewerNotes: str(editedCandidate.reviewerNotes),
      completed: true,
    };
    return { ...base, decisionHash: digest(base) };
  });

  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: template.issuer,
    sourceContentBundleFile: template.sourceContentBundleFile,
    sourceContentBundleHash: template.sourceContentBundleHash,
    generatedAt: template.generatedAt,
    reviewer,
    reviewedAt,
    reviewStatus: "complete_human_review" as const,
    candidateCount: candidates.length,
    completedCandidateCount: candidates.length,
    candidates,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
    globalBlockers: [
      "foundation_security_master_and_pit_fields_not_provided",
      "foundation_license_and_storage_policy_not_provided",
      "foundation_normalized_section_hash_not_provided",
      "foundation_preview_not_authorized",
    ].sort(),
  };
  return { ...base, recordHash: digest(base) };
}

export function renderSanrioEdinetImpactChecklist(record: SanrioEdinetImpactChecklistRecord): string {
  const lines = [
    "# Sanrio EDINET impact review checklist",
    "",
    `- sourceContentBundleFile: ${record.sourceContentBundleFile}`,
    `- sourceContentBundleHash: ${record.sourceContentBundleHash}`,
    `- generatedAt: ${record.generatedAt}`,
    `- reviewer: ${record.reviewer || "(edit JSON)"}`,
    `- reviewedAt: ${record.reviewedAt ?? "(pending)"}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- candidateCount: ${record.candidateCount}`,
    `- completedCandidateCount: ${record.completedCandidateCount}`,
    `- foundationPreviewEligible: ${record.foundationPreviewEligible}`,
    `- appendAuthorized: ${record.appendAuthorized}`,
    `- recordHash: ${record.recordHash}`,
    "",
    "## Required distinctions",
    "",
    "- Financial-statement changes, internal-control changes, and audit-opinion changes must be decided separately.",
    "- `not_changed` requires cited source lines or PDF pages; absence of a keyword is not evidence.",
    "- Confirmed facts, previously known facts, assumptions, and opinions must remain separate.",
    "- A completed checklist still does not authorize Foundation preview or append.",
    "",
  ];
  for (const candidate of record.candidates) {
    lines.push(
      `## ${candidate.fromDocID} → ${candidate.toDocID}`,
      "",
      `- candidateId: ${candidate.candidateId}`,
      `- logicalRoleKey: ${candidate.logicalRoleKey}`,
      `- path: ${candidate.path}`,
      `- sourceCandidateHash: ${candidate.sourceCandidateHash}`,
      `- financialStatements: ${candidate.financialStatements.decision}`,
      `- internalControl: ${candidate.internalControl.decision}`,
      `- auditOpinion: ${candidate.auditOpinion.decision}`,
      `- correctionScope: ${candidate.correctionScope}`,
      `- completed: ${candidate.completed}`,
      `- decisionHash: ${candidate.decisionHash}`,
      "",
      "### JSON fields to complete",
      "",
      "- Each impact section: decision, affectedItems, evidenceReferences, notes, completed=true",
      "- Candidate: correctionScope, confirmedFacts, previouslyKnownFacts, assumptions, opinions, completed=true",
      "- Record: reviewer, reviewedAt, reviewStatus=complete_human_review (finalizer writes final status)",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
