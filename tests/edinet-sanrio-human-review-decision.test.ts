import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetHumanReviewTemplate,
  renderSanrioEdinetHumanReviewRecord,
  validateSanrioEdinetHumanReviewRecord,
} from "../src/research/edinet-sanrio-human-review-decision.js";
import { finalizeSanrioEdinetHumanReviewRecord } from "../src/research/edinet-sanrio-human-review-finalize.js";

type JsonObject = Record<string, unknown>;

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

function inspectionReport() {
  const candidates = [
    {
      candidateId: "candidate:reason",
      toDocID: "S100YMT4",
      path: "PublicDoc/0101000_0245000133806.htm",
      pdfBinaryFile: "S100YMT4.type2.pdf",
      pdfSha256: "a".repeat(64),
      sourceStatus: "partial_exact_anchor_match",
      unmatchedAnchorCount: 1,
      anchors: [
        {
          anchorId: "anchor:remaining",
          sourceLineNumber: 18,
          sourceText: "訂正後 役員の報酬等の総額",
          matchedKeywords: ["訂正後", "役員の報酬"],
          searchTokens: ["訂正後", "役員の報酬"],
          contextCount: 2,
          contexts: [
            {
              pageNumber: 3,
              startLine: 10,
              endLine: 14,
              matchedTokens: ["訂正後"],
              lines: [
                { lineNumber: 10, text: "訂正後" },
                { lineNumber: 11, text: "役員区分 報酬等の総額" },
              ],
            },
            {
              pageNumber: 4,
              startLine: 20,
              endLine: 24,
              matchedTokens: ["役員の報酬"],
              lines: [
                { lineNumber: 21, text: "役員の報酬等" },
              ],
            },
          ],
          diagnosticStatus: "context_candidates_found",
          equivalenceDecision: "unknown_pending_human_review",
          inspectionHash: "b".repeat(64),
        },
      ],
      candidateInspectionHash: "c".repeat(64),
    },
  ];
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceFidelityReportHash: "d".repeat(64),
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
    sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
    sourceFidelityReportHash: hashPayload.sourceFidelityReportHash,
    generatedAt: "2026-08-06T09:29:42.000Z",
    candidateCount: 1,
    unmatchedAnchorCount: 1,
    contextCandidateCount: 2,
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: ["human_pdf_visual_review_required"],
    appendAuthorized: false,
    reportHash: digest(hashPayload),
  };
}

function editableRecord() {
  const template = buildSanrioEdinetHumanReviewTemplate({
    inspectionReport: inspectionReport(),
    sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
    generatedAt: "2026-08-06T09:35:00.000Z",
  });
  const edited = structuredClone(template);
  edited.reviewer = "human-reviewer";
  edited.reviewedAt = "2026-08-06T18:35:00+09:00";
  edited.reviewStatus = "complete_human_review";
  edited.completedAnchorCount = 1;
  const anchor = edited.anchors[0]!;
  anchor.equivalenceDecision = "equivalent_layout_variance";
  anchor.selectedContextNumbers = [1];
  anchor.manualPdfPages = [3];
  anchor.confirmedFacts = [
    "公式PDFの3ページで訂正後の役員報酬表を目視確認した。",
  ];
  anchor.previouslyKnownFacts = [
    "訂正理由にはCOLA Bonusと大学博士課程学費等の経済的利益が記載されている。",
  ];
  anchor.assumptions = [
    "全文anchor不一致はPDF表組みによる可能性が高い。",
  ];
  anchor.opinions = [
    "投資上の重要性は別途評価が必要。",
  ];
  anchor.exactAmounts = [
    {
      amountText: "100千円",
      currency: "JPY",
      period: "第64期",
      recipient: "元常務取締役1名",
      payer: "グループ子会社",
      sourcePage: 3,
    },
  ];
  anchor.correctionScope = "governance_disclosure_only";
  anchor.financialStatementImpact = "unknown";
  anchor.internalControlImpact = "unknown";
  anchor.auditOpinionImpact = "unknown";
  anchor.pdfVisualConfirmation = true;
  anchor.reviewerNotes = "表の改行によりexact full-line matchしなかった。";
  anchor.completed = true;
  return edited;
}

{
  const template = buildSanrioEdinetHumanReviewTemplate({
    inspectionReport: inspectionReport(),
    sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
    generatedAt: "2026-08-06T09:35:00.000Z",
  });
  assert.equal(template.reviewStatus, "draft_human_input");
  assert.equal(template.anchorCount, 1);
  assert.equal(template.completedAnchorCount, 0);
  assert.deepEqual(template.anchors[0]!.availableContextPages, [3, 4]);
  assert.equal(template.anchors[0]!.equivalenceDecision, "pending_human_review");
  assert.equal(template.foundationPreviewEligible, false);
  assert.equal(template.appendAuthorized, false);
  assert.match(template.recordHash, /^[a-f0-9]{64}$/);
  const markdown = renderSanrioEdinetHumanReviewRecord(template);
  assert.match(markdown, /Confirmed facts/);
  assert.match(markdown, /Previously known facts/);
  assert.match(markdown, /appendAuthorized: false/);
  console.log("edinet-sanrio-human-review: draft template and fact separation OK");
}

{
  assert.throws(
    () => buildSanrioEdinetHumanReviewTemplate({
      inspectionReport: inspectionReport(),
      sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
      generatedAt: "2026-08-06T09:35:00",
    }),
    /explicit timezone/,
  );
  assert.throws(
    () => buildSanrioEdinetHumanReviewTemplate({
      inspectionReport: inspectionReport(),
      sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
      generatedAt: "2026-02-29T09:35:00Z",
    }),
    /valid Gregorian/,
  );
  console.log("edinet-sanrio-human-review: strict generatedAt provenance boundary OK");
}

{
  const finalRecord = finalizeSanrioEdinetHumanReviewRecord({
    inspectionReport: inspectionReport(),
    sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
    editedRecord: editableRecord(),
  });
  assert.equal(finalRecord.reviewStatus, "complete_human_review");
  assert.equal(finalRecord.completedAnchorCount, 1);
  assert.equal(finalRecord.anchors[0]!.equivalenceDecision, "equivalent_layout_variance");
  assert.equal(finalRecord.anchors[0]!.confirmedFacts.length, 1);
  assert.equal(finalRecord.anchors[0]!.exactAmounts[0]!.sourcePage, 3);
  assert.equal(finalRecord.foundationPreviewEligible, false);
  assert.equal(finalRecord.appendAuthorized, false);
  assert.ok(finalRecord.globalBlockers.includes("foundation_preview_not_authorized"));
  assert.deepEqual(validateSanrioEdinetHumanReviewRecord(finalRecord), finalRecord);
  console.log("edinet-sanrio-human-review: complete decision rehash and validation OK");
}

{
  const tampered = inspectionReport();
  tampered.candidates[0]!.anchors[0]!.sourceText = "tampered";
  assert.throws(
    () => buildSanrioEdinetHumanReviewTemplate({
      inspectionReport: tampered,
      sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
    }),
    /reportHash mismatch/,
  );
  console.log("edinet-sanrio-human-review: inspection tampering blocked OK");
}

{
  const edited = editableRecord();
  edited.anchors[0]!.pdfSha256 = "f".repeat(64);
  assert.throws(
    () => finalizeSanrioEdinetHumanReviewRecord({
      inspectionReport: inspectionReport(),
      sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
      editedRecord: edited,
    }),
    /source fields changed/,
  );
  console.log("edinet-sanrio-human-review: immutable source field edit blocked OK");
}

{
  const edited = editableRecord();
  edited.anchors[0]!.equivalenceDecision = "pending_human_review";
  assert.throws(
    () => finalizeSanrioEdinetHumanReviewRecord({
      inspectionReport: inspectionReport(),
      sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
      editedRecord: edited,
    }),
    /decision is still pending/,
  );
  console.log("edinet-sanrio-human-review: pending decision blocked OK");
}

{
  const edited = editableRecord();
  edited.anchors[0]!.pdfVisualConfirmation = false;
  assert.throws(
    () => finalizeSanrioEdinetHumanReviewRecord({
      inspectionReport: inspectionReport(),
      sourceInspectionFile: "revision-unmatched-anchor-inspection-v1.fixture.json",
      editedRecord: edited,
    }),
    /requires PDF visual confirmation/,
  );
  console.log("edinet-sanrio-human-review: missing visual confirmation blocked OK");
}

console.log("edinet-sanrio-human-review-decision.test.ts passed");
