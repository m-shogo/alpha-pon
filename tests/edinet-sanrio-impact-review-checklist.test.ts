import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetImpactChecklistTemplate,
  finalizeSanrioEdinetImpactChecklist,
  renderSanrioEdinetImpactChecklist,
} from "../src/research/edinet-sanrio-impact-review-checklist.js";

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

function contentCandidate(input: { id: string; pairId: string; role: string }) {
  const base = {
    candidateId: input.id,
    batchId: `batch:${input.role}`,
    sourceClusterId: `cluster:${input.role}`,
    strategy: "review_all_candidates_first",
    pairId: input.pairId,
    fromDocID: input.pairId === "pair:64" ? "S100OLD64" : "S100OLD65",
    toDocID: input.pairId === "pair:64" ? "S100NEW64" : "S100NEW65",
    path: `PublicDoc/${input.id}.htm`,
    beforePath: `PublicDoc/${input.id}.htm`,
    afterPath: `PublicDoc/${input.id}.htm`,
    logicalRoleKey: input.role,
    changeType: "modified",
    reviewSignals: ["numeric_preview_variance"],
    beforeText: "売上高 100百万円",
    afterText: "売上高 120百万円",
    beforeTextHash: "a".repeat(64),
    afterTextHash: "b".repeat(64),
    beforeLineCount: 1,
    afterLineCount: 1,
    reviewLines: [
      {
        side: "before",
        lineNumber: 1,
        text: "売上高 100百万円",
        candidateTypes: ["numeric_line", "accounting_keyword_line"],
        numericTokens: ["100百万円"],
        matchedKeywords: ["売上高"],
      },
      {
        side: "after",
        lineNumber: 1,
        text: "売上高 120百万円",
        candidateTypes: ["numeric_line", "accounting_keyword_line"],
        numericTokens: ["120百万円"],
        matchedKeywords: ["売上高"],
      },
    ],
    numericLineCount: 2,
    footnoteLineCount: 0,
    accountingKeywordLineCount: 2,
    factStatus: "unreviewed_source_text",
    accountingImpact: "unknown_pending_human_review",
    internalControlImpact: "unknown_pending_human_review",
    auditOpinionImpact: "unknown_pending_human_review",
  };
  return { ...base, candidateHash: digest(base) };
}

function contentBundle() {
  const candidates = [
    contentCandidate({ id: "candidate:64", pairId: "pair:64", role: "financial/summary" }),
    contentCandidate({ id: "candidate:65", pairId: "pair:65", role: "financial/summary" }),
  ];
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceBatchWorkspaceHash: "c".repeat(64),
    planHash: "d".repeat(64),
    candidates,
    appendAuthorized: false,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceBatchWorkspaceFile: "revision-review-next-batches-v1.fixture.json",
    sourceBatchWorkspaceHash: hashPayload.sourceBatchWorkspaceHash,
    planHash: hashPayload.planHash,
    generatedAt: "2026-08-06T10:30:00.000Z",
    candidateCount: candidates.length,
    numericLineCount: 4,
    footnoteLineCount: 0,
    accountingKeywordLineCount: 4,
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: ["official_pdf_visual_review_required"],
    appendAuthorized: false,
    bundleHash: digest(hashPayload),
  };
}

function completedSection(decision: "changed" | "not_changed" | "not_applicable" | "insufficient_evidence", input?: {
  affectedItems?: string[];
  side?: "before" | "after" | "pdf";
  lineNumber?: number | null;
  pdfPage?: number | null;
}) {
  const side = input?.side ?? "pdf";
  return {
    decision,
    affectedItems: input?.affectedItems ?? [],
    evidenceReferences: decision === "not_applicable" ? [] : [
      {
        side,
        lineNumber: input?.lineNumber ?? (side === "pdf" ? null : 1),
        pdfPage: input?.pdfPage ?? (side === "pdf" ? 12 : null),
        description: "公式PDFと抽出行を照合した",
      },
    ],
    notes: "human reviewed",
    completed: true,
  };
}

function editTemplate() {
  const template = buildSanrioEdinetImpactChecklistTemplate({
    contentBundle: contentBundle(),
    sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
    generatedAt: "2026-08-06T11:00:00.000Z",
  });
  const edited = structuredClone(template) as unknown as JsonObject;
  edited.reviewer = "fixture-reviewer";
  edited.reviewedAt = "2026-08-06T11:30:00.000Z";
  const candidates = edited.candidates as JsonObject[];
  for (const [index, candidate] of candidates.entries()) {
    candidate.financialStatements = completedSection("changed", {
      affectedItems: ["売上高"],
      side: "pdf",
      pdfPage: 12 + index,
    });
    candidate.internalControl = completedSection("not_changed", {
      side: "pdf",
      pdfPage: 20 + index,
    });
    candidate.auditOpinion = completedSection("not_changed", {
      side: "pdf",
      pdfPage: 30 + index,
    });
    candidate.correctionScope = "financial_statement_change";
    candidate.confirmedFacts = ["訂正前後で売上高の記載値が変更された"];
    candidate.previouslyKnownFacts = [];
    candidate.assumptions = [];
    candidate.opinions = [];
    candidate.reviewerNotes = "fixture completion";
    candidate.completed = true;
  }
  return edited;
}

{
  const template = buildSanrioEdinetImpactChecklistTemplate({
    contentBundle: contentBundle(),
    sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
    generatedAt: "2026-08-06T11:00:00.000Z",
  });
  assert.equal(template.candidateCount, 2);
  assert.equal(template.completedCandidateCount, 0);
  assert.equal(template.reviewStatus, "draft_human_input");
  assert.equal(template.foundationPreviewEligible, false);
  assert.equal(template.appendAuthorized, false);
  assert.ok(template.candidates.every(candidate =>
    candidate.financialStatements.decision === "pending_human_review"
    && candidate.internalControl.decision === "pending_human_review"
    && candidate.auditOpinion.decision === "pending_human_review",
  ));
  assert.match(renderSanrioEdinetImpactChecklist(template), /must be decided separately/);
  console.log("edinet-sanrio-impact-review: deterministic draft checklist OK");
}

{
  for (const generatedAt of ["2026-08-06T11:00:00", "2026-02-30T11:00:00Z"]) {
    assert.throws(
      () => buildSanrioEdinetImpactChecklistTemplate({
        contentBundle: contentBundle(),
        sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
        generatedAt,
      }),
      /generatedAt/,
    );
  }
  assert.equal(
    buildSanrioEdinetImpactChecklistTemplate({
      contentBundle: contentBundle(),
      sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
      generatedAt: "2026-08-06T20:00:00+09:00",
    }).generatedAt,
    "2026-08-06T20:00:00+09:00",
  );
  console.log("edinet-sanrio-impact-review: generatedAt strict explicit-timezone boundary OK");
}

{
  const final = finalizeSanrioEdinetImpactChecklist({
    contentBundle: contentBundle(),
    sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
    editedRecord: editTemplate(),
    reviewedAt: "2026-08-06T11:30:00.000Z",
  });
  assert.equal(final.reviewStatus, "complete_human_review");
  assert.equal(final.completedCandidateCount, 2);
  assert.equal(final.foundationPreviewEligible, false);
  assert.equal(final.appendAuthorized, false);
  assert.ok(final.candidates.every(candidate =>
    candidate.financialStatements.decision === "changed"
    && candidate.internalControl.decision === "not_changed"
    && candidate.auditOpinion.decision === "not_changed"
    && candidate.correctionScope === "financial_statement_change",
  ));
  assert.match(final.recordHash, /^[a-f0-9]{64}$/);
  console.log("edinet-sanrio-impact-review: completed checklist remains non-appendable OK");
}

{
  for (const reviewedAt of ["2026-08-06T11:30:00", "2026-02-30T11:30:00Z"]) {
    assert.throws(
      () => finalizeSanrioEdinetImpactChecklist({
        contentBundle: contentBundle(),
        sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
        editedRecord: editTemplate(),
        reviewedAt,
      }),
      /reviewedAt/,
    );
  }
  assert.equal(
    finalizeSanrioEdinetImpactChecklist({
      contentBundle: contentBundle(),
      sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
      editedRecord: editTemplate(),
      reviewedAt: "2026-08-06T20:30:00+09:00",
    }).reviewedAt,
    "2026-08-06T20:30:00+09:00",
  );
  console.log("edinet-sanrio-impact-review: reviewedAt strict explicit-timezone boundary OK");
}

{
  const tamperedBundle = contentBundle();
  tamperedBundle.candidates[0]!.afterText = "tampered";
  assert.throws(
    () => buildSanrioEdinetImpactChecklistTemplate({
      contentBundle: tamperedBundle,
      sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
    }),
    /contentBundle.bundleHash mismatch/,
  );
  console.log("edinet-sanrio-impact-review: content bundle tampering blocked OK");
}

{
  const edited = editTemplate();
  const first = (edited.candidates as JsonObject[])[0]!;
  first.afterTextHash = "f".repeat(64);
  assert.throws(
    () => finalizeSanrioEdinetImpactChecklist({
      contentBundle: contentBundle(),
      sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
      editedRecord: edited,
    }),
    /source fields changed/,
  );
  console.log("edinet-sanrio-impact-review: immutable source fields protected OK");
}

{
  const edited = editTemplate();
  const first = (edited.candidates as JsonObject[])[0]!;
  first.internalControl = completedSection("not_changed");
  const internalControl = first.internalControl as JsonObject;
  internalControl.evidenceReferences = [];
  assert.throws(
    () => finalizeSanrioEdinetImpactChecklist({
      contentBundle: contentBundle(),
      sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
      editedRecord: edited,
    }),
    /requires at least one evidence reference/,
  );
  console.log("edinet-sanrio-impact-review: unsupported not-changed decision blocked OK");
}

console.log("edinet-sanrio-impact-review-checklist.test.ts passed");
