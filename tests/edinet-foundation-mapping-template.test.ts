import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { finalizeHumanEditedEdinetFoundationMapping } from "../src/research/edinet-foundation-mapping-edit-finalizer.js";
import {
  buildEdinetFoundationMappingTemplate,
  renderEdinetFoundationMappingRecord,
} from "../src/research/edinet-foundation-mapping-template.js";

type JsonObject = Record<string, unknown>;

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

function completedSection(decision: "changed" | "not_changed" | "not_applicable") {
  return {
    decision,
    affectedItems: decision === "changed" ? ["役員の報酬等"] : [],
    evidenceReferences: decision === "not_applicable" ? [] : [
      {
        side: "pdf",
        lineNumber: null,
        pdfPage: 12,
        description: "公式PDFで確認",
      },
    ],
    notes: "human reviewed",
    completed: true,
  };
}

function impactCandidate() {
  const base = {
    candidateId: "candidate:remuneration",
    batchId: "batch:remuneration",
    sourceClusterId: "cluster:remuneration",
    pairId: "edinet:S100OLD1->S100NEW1",
    fromDocID: "S100OLD1",
    toDocID: "S100NEW1",
    logicalRoleKey: "governance/officer-remuneration",
    path: "PublicDoc/officer-remuneration.htm",
    beforeTextHash: "1".repeat(64),
    afterTextHash: "2".repeat(64),
    numericLineCount: 2,
    footnoteLineCount: 1,
    accountingKeywordLineCount: 2,
    sourceCandidateHash: "3".repeat(64),
    financialStatements: completedSection("not_changed"),
    internalControl: completedSection("not_changed"),
    auditOpinion: completedSection("not_changed"),
    correctionScope: "governance_disclosure_only",
    confirmedFacts: ["役員の報酬等の記載が訂正された"],
    previouslyKnownFacts: [],
    assumptions: [],
    opinions: [],
    reviewerNotes: "fixture",
    completed: true,
  };
  return { ...base, decisionHash: digest(base) };
}

function impactReview() {
  const candidates = [impactCandidate()];
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
    sourceContentBundleHash: "4".repeat(64),
    generatedAt: "2026-08-06T10:00:00.000Z",
    reviewer: "impact-reviewer",
    reviewedAt: "2026-08-06T10:30:00.000Z",
    reviewStatus: "complete_human_review",
    candidateCount: 1,
    completedCandidateCount: 1,
    candidates,
    foundationPreviewEligible: false,
    appendAuthorized: false,
    globalBlockers: ["foundation_preview_not_authorized"],
  };
  return { ...base, recordHash: digest(base) };
}

function editedMappingInput() {
  const template = buildEdinetFoundationMappingTemplate({
    impactReview: impactReview(),
    sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
    generatedAt: "2026-08-06T11:00:00.000Z",
  });
  const edited = structuredClone(template) as unknown as JsonObject;
  edited.reviewer = "foundation-reviewer";
  edited.reviewedAt = "2026-08-06T12:00:00.000Z";
  const mapping = (edited.mappings as JsonObject[])[0]!;
  mapping.mappingComplete = true;
  const fields = mapping.fields as JsonObject;
  fields.chainRootDocID = "S100OLD1";
  fields.documentTypeCode = "1";
  fields.entityIds = ["entity:jp:tse:8136"];
  fields.sourceContentHash = "5".repeat(64);
  fields.title = "訂正有価証券報告書 — 役員の報酬等";
  fields.summary = "人間レビュー済みの訂正開示をFoundation previewへ変換する。";
  fields.publishedAt = "2026-06-29T07:00:00.000Z";
  fields.observedAt = "2026-06-29T07:01:00.000Z";
  fields.retrievedAt = "2026-06-29T07:02:00.000Z";
  fields.effectiveFrom = "2026-06-29T07:00:00.000Z";
  fields.firstExecutableAt = "2026-06-29T07:03:00.000Z";
  fields.eventAtStatus = "unknown";
  fields.eventAt = null;
  fields.retrievalRunId = "retrieval-run:edinet:s100new1";
  fields.parserVersion = "edinet-publicdoc-v1";
  fields.normalizationVersion = "edinet-visible-text-v1";
  fields.normalizedStructureHash = "6".repeat(64);
  fields.language = "ja";
  fields.revisionKind = "correction";
  fields.revisionSequence = 1;
  fields.evidenceStatus = "active";
  fields.documentRevisionStatus = "active";
  fields.license = "local_only";
  fields.storagePolicy = "local_only_content";
  fields.prior = {
    evidenceId: "evidence:edinet:s100old1",
    documentRevisionId: "document-revision:edinet:s100old1",
    documentRevisionRecordId: "document-revision:edinet:s100old1:record:1",
    relationType: "corrects",
    supersessionStrength: "partial",
  };
  const section = (fields.sections as JsonObject[])[0]!;
  section.sectionId = "section:officer-remuneration";
  section.ordinal = 0;
  section.titleHash = "7".repeat(64);
  return edited;
}

{
  const template = buildEdinetFoundationMappingTemplate({
    impactReview: impactReview(),
    sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
    generatedAt: "2026-08-06T11:00:00.000Z",
  });
  assert.equal(template.reviewStatus, "draft_human_input");
  assert.equal(template.mappingCount, 1);
  assert.equal(template.foundationPreviewEligible, false);
  assert.equal(template.appendAuthorized, false);
  assert.equal(template.mappings[0]!.docID, "S100NEW1");
  assert.equal(template.mappings[0]!.fields.entityIds.length, 0);
  assert.equal(template.mappings[0]!.fields.revisionKind, "pending_human_review");
  assert.equal(template.mappings[0]!.fields.sections[0]!.sourceContentHash, "2".repeat(64));
  assert.match(template.recordHash, /^[a-f0-9]{64}$/);
  assert.match(renderEdinetFoundationMappingRecord(template), /Security Master entity IDs/);
  console.log("edinet-foundation-mapping: deterministic blocked template OK");
}

{
  const edited = editedMappingInput();
  const staleTemplateHash = edited.recordHash;
  const final = finalizeHumanEditedEdinetFoundationMapping({
    impactReview: impactReview(),
    sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
    mappingInput: edited,
    sourceMappingInputFile: "revision-foundation-mapping-input-v1.fixture.json",
    generatedAt: "2026-08-06T12:10:00.000Z",
  });
  assert.equal(typeof staleTemplateHash, "string");
  assert.equal(final.reviewStatus, "complete_foundation_preview");
  assert.equal(final.previewCount, 1);
  assert.equal(final.previewGenerated, true);
  assert.equal(final.foundationPreviewEligible, false);
  assert.equal(final.appendAuthorized, false);
  const preview = final.previews[0]!;
  assert.equal(preview.appendAuthorized, false);
  assert.equal(preview.evidence.entityIds[0], "entity:jp:tse:8136");
  assert.equal(preview.evidence.firstExecutableAt, "2026-06-29T07:03:00.000Z");
  assert.equal(preview.documentRevision.kind, "correction");
  assert.equal(preview.documentRevision.priorRevisionId, "document-revision:edinet:s100old1");
  assert.equal(preview.relation?.relationType, "corrects");
  assert.match(final.sourceMappingInputHash, /^[a-f0-9]{64}$/);
  assert.match(final.recordHash, /^[a-f0-9]{64}$/);
  assert.match(renderEdinetFoundationMappingRecord(final), /Foundation preview remains non-appendable/);
  console.log("edinet-foundation-mapping: edited input rehashes and generates non-appendable preview OK");
}

{
  const edited = editedMappingInput();
  const mapping = (edited.mappings as JsonObject[])[0]!;
  const fields = mapping.fields as JsonObject;
  fields.entityIds = [];
  assert.throws(
    () => finalizeHumanEditedEdinetFoundationMapping({
      impactReview: impactReview(),
      sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
      mappingInput: edited,
      sourceMappingInputFile: "revision-foundation-mapping-input-v1.fixture.json",
    }),
    /entityIds must not be empty/,
  );
  console.log("edinet-foundation-mapping: missing Security Master identity blocked OK");
}

{
  const edited = editedMappingInput();
  const fields = ((edited.mappings as JsonObject[])[0]!.fields as JsonObject);
  fields.firstExecutableAt = "2026-06-29T07:01:30.000Z";
  assert.throws(
    () => finalizeHumanEditedEdinetFoundationMapping({
      impactReview: impactReview(),
      sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
      mappingInput: edited,
      sourceMappingInputFile: "revision-foundation-mapping-input-v1.fixture.json",
    }),
    /firstExecutableAt must be on or after retrievedAt/,
  );
  console.log("edinet-foundation-mapping: PIT first-executable inversion blocked OK");
}

{
  const edited = editedMappingInput();
  const fields = ((edited.mappings as JsonObject[])[0]!.fields as JsonObject);
  const section = (fields.sections as JsonObject[])[0]!;
  section.path = "PublicDoc/tampered.htm";
  assert.throws(
    () => finalizeHumanEditedEdinetFoundationMapping({
      impactReview: impactReview(),
      sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
      mappingInput: edited,
      sourceMappingInputFile: "revision-foundation-mapping-input-v1.fixture.json",
    }),
    /source fields changed/,
  );
  console.log("edinet-foundation-mapping: immutable source section protected OK");
}

{
  const incomplete = impactReview();
  incomplete.reviewStatus = "draft_human_input";
  const { recordHash: _ignored, ...withoutHash } = incomplete;
  incomplete.recordHash = digest(withoutHash);
  assert.throws(
    () => buildEdinetFoundationMappingTemplate({
      impactReview: incomplete,
      sourceImpactReviewFile: "revision-impact-review-final-v1.fixture.json",
    }),
    /must be complete, human-reviewed, and non-appendable/,
  );
  console.log("edinet-foundation-mapping: incomplete human review source blocked OK");
}

console.log("edinet-foundation-mapping-template.test.ts passed");
