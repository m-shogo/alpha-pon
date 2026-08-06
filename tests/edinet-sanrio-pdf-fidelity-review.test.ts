import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetPdfFidelityPlan,
  buildSanrioEdinetPdfFidelityReport,
  renderSanrioEdinetPdfFidelityReport,
} from "../src/research/edinet-sanrio-pdf-fidelity-review.js";

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

function focusedCandidate(input: {
  candidateId: string;
  fromDocID: string;
  toDocID: string;
  path: string;
  focusLines: Array<{ lineNumber: number; text: string; matchedKeywords: string[] }>;
}) {
  const base = {
    candidateId: input.candidateId,
    clusterId: `cluster:${input.path}`,
    logicalRoleKey: input.path,
    pairId: `edinet:${input.fromDocID}->${input.toDocID}`,
    fromDocID: input.fromDocID,
    toDocID: input.toDocID,
    fromDescription: "有価証券報告書",
    toDescription: "訂正有価証券報告書",
    path: input.path,
    beforePath: null,
    afterPath: input.path,
    changeType: "added",
    priority: "review_first",
    reasonCodes: ["added_or_removed_document_role"],
    beforeText: null,
    afterText: input.focusLines.map(line => line.text).join("\n"),
    beforeTextHash: null,
    afterTextHash: "a".repeat(64),
    beforeLineCount: 0,
    afterLineCount: input.focusLines.length,
    focusLines: input.focusLines.map(line => ({ side: "after", ...line })),
    factStatus: "unreviewed_source_text",
    semanticType: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
    accountingImpact: "unknown_pending_human_review",
  };
  return { ...base, candidateHash: digest(base) };
}

function focusedBundle() {
  const candidates = [
    focusedCandidate({
      candidateId: "candidate:header",
      fromDocID: "S100OLD1",
      toDocID: "S100NEW1",
      path: "PublicDoc/0000000_header.htm",
      focusLines: [
        {
          lineNumber: 2,
          text: "有価証券報告書の訂正報告書",
          matchedKeywords: ["訂正事項"],
        },
      ],
    }),
    focusedCandidate({
      candidateId: "candidate:reason",
      fromDocID: "S100OLD2",
      toDocID: "S100NEW2",
      path: "PublicDoc/0101000_reason.htm",
      focusLines: [
        {
          lineNumber: 3,
          text: "特別調査委員会の調査によりCOLA Bonus及び大学博士課程の学費等の経済的利益が確認された。",
          matchedKeywords: ["COLA", "学費", "経済的利益", "特別調査委員会"],
        },
        {
          lineNumber: 8,
          text: "訂正後 100千円",
          matchedKeywords: ["訂正後", "千円"],
        },
      ],
    }),
  ];
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    sourceTriageWorkspaceHash: "1".repeat(64),
    sourceDiffWorkspaceFile: "revision-diff-workspace-v2.fixture.json",
    sourceDiffWorkspaceHash: "2".repeat(64),
    focusedPlanHash: "3".repeat(64),
    generatedAt: "2026-08-06T08:43:10.000Z",
    clusterCount: 2,
    candidateCount: candidates.length,
    focusLineCount: 3,
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: ["original_and_corrected_pdf_cross_check_required"],
    appendAuthorized: false,
  };
  const hashPayload = {
    schemaVersion: base.schemaVersion,
    source: base.source,
    focusedPlanHash: base.focusedPlanHash,
    candidates: base.candidates,
    appendAuthorized: base.appendAuthorized,
  };
  return { ...base, focusedBundleHash: digest(hashPayload) };
}

function reviewWorkspace() {
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceInventory: "inventory.json",
    acquisitionManifest: "acquisition-manifest.json",
    generatedAt: "2026-08-06T06:47:08.000Z",
    retrievalComplete: true,
    acquisitionCount: 4,
    documentCount: 2,
    reviewStatus: "pending_human_review",
    groups: [
      {
        groupId: "group:1",
        chainRootDocID: "S100OLD1",
        reviewChecklist: ["review"],
        documents: [
          {
            docID: "S100NEW1",
            parentDocID: "S100OLD1",
            chainRootDocID: "S100OLD1",
            submitDateTime: "2026-06-29T16:00:00+09:00",
            description: "訂正有価証券報告書",
            revisionReviewHint: "correction",
            parentOutsideInventory: false,
            acquisitions: [
              {
                documentType: "1",
                format: "zip",
                reason: "structured",
                binaryFile: "S100NEW1.type1.zip",
                metadataFile: "S100NEW1.type1.json",
                sha256: "a".repeat(64),
                byteLength: 100,
                retrievedAt: "2026-08-06T06:48:00.000Z",
              },
              {
                documentType: "2",
                format: "pdf",
                reason: "visual",
                binaryFile: "S100NEW1.type2.pdf",
                metadataFile: "S100NEW1.type2.json",
                sha256: "b".repeat(64),
                byteLength: 200,
                retrievedAt: "2026-08-06T06:49:00.000Z",
              },
            ],
            reviewStatus: "pending_human_review",
            blockers: ["human_document_review_required"],
          },
        ],
      },
      {
        groupId: "group:2",
        chainRootDocID: "S100OLD2",
        reviewChecklist: ["review"],
        documents: [
          {
            docID: "S100NEW2",
            parentDocID: "S100OLD2",
            chainRootDocID: "S100OLD2",
            submitDateTime: "2026-06-29T16:00:00+09:00",
            description: "訂正有価証券報告書",
            revisionReviewHint: "correction",
            parentOutsideInventory: false,
            acquisitions: [
              {
                documentType: "2",
                format: "pdf",
                reason: "visual",
                binaryFile: "S100NEW2.type2.pdf",
                metadataFile: "S100NEW2.type2.json",
                sha256: "c".repeat(64),
                byteLength: 300,
                retrievedAt: "2026-08-06T06:50:00.000Z",
              },
            ],
            reviewStatus: "pending_human_review",
            blockers: ["human_document_review_required"],
          },
        ],
      },
    ],
    globalBlockers: ["human_document_review_required"],
    appendAuthorized: false,
  };
  const workspaceHash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, workspaceHash };
}

{
  const plan = buildSanrioEdinetPdfFidelityPlan({
    focusedBundle: focusedBundle(),
    sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
    reviewWorkspace: reviewWorkspace(),
    sourceReviewWorkspaceFile: "review-workspace.json",
  });
  assert.equal(plan.candidateCount, 2);
  assert.equal(plan.uniquePdfCount, 2);
  assert.equal(plan.candidates[0]!.anchors.length, 1);
  assert.equal(plan.candidates[1]!.anchors.length, 2);
  assert.match(plan.fidelityPlanHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.appendAuthorized, false);
  console.log("edinet-sanrio-pdf-fidelity: official PDF plan and anchors OK");
}

{
  const plan = buildSanrioEdinetPdfFidelityPlan({
    focusedBundle: focusedBundle(),
    sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
    reviewWorkspace: reviewWorkspace(),
    sourceReviewWorkspaceFile: "review-workspace.json",
  });
  const report = buildSanrioEdinetPdfFidelityReport({
    plan,
    generatedAt: "2026-08-06T09:00:00.000Z",
    pdfTexts: [
      {
        docID: "S100NEW1",
        pdfBinaryFile: "S100NEW1.type2.pdf",
        extractionMethod: "provided_fixture",
        text: "【提出書類】\n有価証券報告書の訂正報告書",
      },
      {
        docID: "S100NEW2",
        pdfBinaryFile: "S100NEW2.type2.pdf",
        extractionMethod: "provided_fixture",
        text: "特別調査委員会の調査により COLA Bonus 及び大学博士課程の学費等の経済的利益が確認された。",
      },
    ],
  });
  assert.equal(report.exactCoverageCandidateCount, 1);
  assert.equal(report.partialCoverageCandidateCount, 1);
  assert.equal(report.matchedAnchorCount, 2);
  assert.equal(report.unmatchedAnchorCount, 1);
  assert.equal(report.pendingAnchorCount, 0);
  assert.equal(report.reviewStatus, "pending_human_review");
  assert.equal(report.appendAuthorized, false);
  assert.ok(report.candidates.every(candidate => candidate.pendingAnchorCount === 0));
  assert.ok(report.candidates.every(candidate =>
    candidate.contentEquivalent === "unknown_pending_human_review",
  ));
  const markdown = renderSanrioEdinetPdfFidelityReport(report);
  assert.match(markdown, /does not prove full document equivalence/);
  assert.match(markdown, /訂正後 100千円/);
  console.log("edinet-sanrio-pdf-fidelity: exact and partial anchor coverage OK");
}

{
  const plan = buildSanrioEdinetPdfFidelityPlan({
    focusedBundle: focusedBundle(),
    sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
    reviewWorkspace: reviewWorkspace(),
    sourceReviewWorkspaceFile: "review-workspace.json",
  });
  const report = buildSanrioEdinetPdfFidelityReport({
    plan,
    pdfTexts: [
      {
        docID: "S100NEW1",
        pdfBinaryFile: "S100NEW1.type2.pdf",
        extractionMethod: "unavailable",
        text: null,
      },
      {
        docID: "S100NEW2",
        pdfBinaryFile: "S100NEW2.type2.pdf",
        extractionMethod: "unavailable",
        text: null,
      },
    ],
  });
  assert.equal(report.extractedPdfCount, 0);
  assert.equal(report.unavailableCandidateCount, 2);
  assert.equal(report.matchedAnchorCount, 0);
  assert.equal(report.unmatchedAnchorCount, 0);
  assert.equal(report.pendingAnchorCount, 3);
  assert.ok(report.globalBlockers.includes("pending_anchor_requires_pdf_text_extraction_or_visual_review"));
  assert.ok(!report.globalBlockers.includes("unmatched_anchor_may_be_pdf_layout_or_text_extraction_variance"));
  assert.ok(report.candidates.every(candidate =>
    candidate.status === "pdf_text_extraction_unavailable"
    && candidate.unmatchedAnchorCount === 0
    && candidate.pendingAnchorCount === candidate.anchorCount
    && candidate.anchorResults.every(anchor => anchor.matched === null),
  ));
  const markdown = renderSanrioEdinetPdfFidelityReport(report);
  assert.match(markdown, /Pending anchors were not evaluated/);
  assert.match(markdown, /matched=0, unmatched=0, pending=2/);
  assert.match(markdown, /- \[\?\] line 3:/);
  console.log("edinet-sanrio-pdf-fidelity: unavailable extractor remains pending, not unmatched OK");
}

{
  const tampered = focusedBundle();
  tampered.candidates[0]!.focusLines[0]!.text = "tampered";
  assert.throws(
    () => buildSanrioEdinetPdfFidelityPlan({
      focusedBundle: tampered,
      sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
      reviewWorkspace: reviewWorkspace(),
      sourceReviewWorkspaceFile: "review-workspace.json",
    }),
    /focusedBundleHash mismatch/,
  );
  console.log("edinet-sanrio-pdf-fidelity: focused bundle tampering blocked OK");
}

{
  const missingPdf = reviewWorkspace();
  missingPdf.groups[1]!.documents[0]!.acquisitions = [];
  const { workspaceHash: _oldHash, ...withoutHash } = missingPdf;
  missingPdf.workspaceHash = createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex");
  assert.throws(
    () => buildSanrioEdinetPdfFidelityPlan({
      focusedBundle: focusedBundle(),
      sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
      reviewWorkspace: missingPdf,
      sourceReviewWorkspaceFile: "review-workspace.json",
    }),
    /type=2 PDF acquisition missing/,
  );
  console.log("edinet-sanrio-pdf-fidelity: missing official PDF blocked OK");
}

{
  const plan = buildSanrioEdinetPdfFidelityPlan({
    focusedBundle: focusedBundle(),
    sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
    reviewWorkspace: reviewWorkspace(),
    sourceReviewWorkspaceFile: "review-workspace.json",
  });
  plan.candidateCount = 99;
  assert.throws(
    () => buildSanrioEdinetPdfFidelityReport({ plan, pdfTexts: [] }),
    /fidelityPlanHash mismatch/,
  );
  console.log("edinet-sanrio-pdf-fidelity: plan tampering blocked OK");
}

console.log("edinet-sanrio-pdf-fidelity-review.test.ts passed");
