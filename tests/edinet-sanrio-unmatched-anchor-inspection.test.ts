import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetUnmatchedAnchorReport,
  renderSanrioEdinetUnmatchedAnchorReport,
} from "../src/research/edinet-sanrio-unmatched-anchor-inspection.js";

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

function fidelityReport() {
  const candidates = [
    {
      candidateId: "candidate:reason",
      clusterId: "cluster:reason",
      pairId: "edinet:S100OLD1->S100NEW1",
      fromDocID: "S100OLD1",
      toDocID: "S100NEW1",
      path: "PublicDoc/0101000_reason.htm",
      pdfBinaryFile: "S100NEW1.type2.pdf",
      pdfSha256: "a".repeat(64),
      status: "partial_exact_anchor_match",
      anchorResults: [
        {
          anchorId: "anchor:matched",
          sourceLineNumber: 3,
          sourceText: "特別調査委員会の調査結果",
          matchedKeywords: ["特別調査委員会"],
          matched: true,
        },
        {
          anchorId: "anchor:unmatched",
          sourceLineNumber: 8,
          sourceText: "訂正後 100千円",
          matchedKeywords: ["訂正後", "千円"],
          matched: false,
        },
      ],
    },
  ];
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceFocusedBundleHash: "1".repeat(64),
    sourceReviewWorkspaceHash: "2".repeat(64),
    fidelityPlanHash: "3".repeat(64),
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
    sourceFocusedBundleFile: "revision-focused-review-v1.fixture.json",
    sourceFocusedBundleHash: hashPayload.sourceFocusedBundleHash,
    sourceReviewWorkspaceFile: "review-workspace.json",
    sourceReviewWorkspaceHash: hashPayload.sourceReviewWorkspaceHash,
    fidelityPlanHash: hashPayload.fidelityPlanHash,
    generatedAt: "2026-08-06T09:14:46.000Z",
    candidateCount: 1,
    uniquePdfCount: 1,
    extractedPdfCount: 1,
    exactCoverageCandidateCount: 0,
    partialCoverageCandidateCount: 1,
    unavailableCandidateCount: 0,
    matchedAnchorCount: 1,
    unmatchedAnchorCount: 1,
    pendingAnchorCount: 0,
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: ["human_pdf_visual_review_required"],
    appendAuthorized: false,
    fidelityReportHash: digest(hashPayload),
  };
}

function pdfInputs() {
  return [
    {
      docID: "S100NEW1",
      pdfBinaryFile: "S100NEW1.type2.pdf",
      pdfText: [
        "【訂正後】",
        "役員区分      報酬等の総額",
        "取締役        100 千円",
        "注記",
      ].join("\n"),
    },
  ];
}

{
  const report = buildSanrioEdinetUnmatchedAnchorReport({
    fidelityReport: fidelityReport(),
    sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
    generatedAt: "2026-08-06T09:20:00.000Z",
    pdfInputs: pdfInputs(),
  });
  assert.equal(report.candidateCount, 1);
  assert.equal(report.unmatchedAnchorCount, 1);
  assert.ok(report.contextCandidateCount >= 1);
  const anchor = report.candidates[0]!.anchors[0]!;
  assert.equal(anchor.diagnosticStatus, "context_candidates_found");
  assert.equal(anchor.equivalenceDecision, "unknown_pending_human_review");
  assert.ok(anchor.searchTokens.includes("100千円"));
  assert.ok(anchor.contexts.some(context => context.matchedTokens.includes("訂正後")));
  const markdown = renderSanrioEdinetUnmatchedAnchorReport(report);
  assert.match(markdown, /PDF page 1/);
  assert.match(markdown, /100 千円/);
  assert.match(markdown, /not fuzzy equivalence decisions/);
  console.log("edinet-sanrio-unmatched-anchor: deterministic PDF contexts OK");
}

{
  for (const generatedAt of [
    "2026-08-06T09:20:00",
    "2026-02-30T09:20:00Z",
  ]) {
    assert.throws(
      () => buildSanrioEdinetUnmatchedAnchorReport({
        fidelityReport: fidelityReport(),
        sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
        generatedAt,
        pdfInputs: pdfInputs(),
      }),
      /generatedAt/,
    );
  }
  const offset = buildSanrioEdinetUnmatchedAnchorReport({
    fidelityReport: fidelityReport(),
    sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
    generatedAt: "2026-08-06T18:20:00+09:00",
    pdfInputs: pdfInputs(),
  });
  assert.equal(offset.generatedAt, "2026-08-06T18:20:00+09:00");
  console.log("edinet-sanrio-unmatched-anchor: generatedAt requires strict explicit-timezone instant OK");
}

{
  const report = buildSanrioEdinetUnmatchedAnchorReport({
    fidelityReport: fidelityReport(),
    sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
    pdfInputs: [
      {
        docID: "S100NEW1",
        pdfBinaryFile: "S100NEW1.type2.pdf",
        pdfText: " unrelated PDF content ",
      },
    ],
  });
  assert.equal(report.contextCandidateCount, 0);
  assert.equal(report.candidates[0]!.anchors[0]!.diagnosticStatus, "no_context_candidate_found");
  assert.equal(report.reviewStatus, "pending_human_review");
  assert.equal(report.appendAuthorized, false);
  console.log("edinet-sanrio-unmatched-anchor: no context stays pending OK");
}

{
  const tampered = fidelityReport();
  tampered.candidates[0]!.anchorResults[1]!.sourceText = "tampered";
  assert.throws(
    () => buildSanrioEdinetUnmatchedAnchorReport({
      fidelityReport: tampered,
      sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
      pdfInputs: [],
    }),
    /fidelityReportHash mismatch/,
  );
  console.log("edinet-sanrio-unmatched-anchor: source tampering blocked OK");
}

{
  const source = fidelityReport();
  source.candidates[0]!.anchorResults[1]!.matched = true;
  const hashPayload = {
    schemaVersion: source.schemaVersion,
    source: source.source,
    sourceFocusedBundleHash: source.sourceFocusedBundleHash,
    sourceReviewWorkspaceHash: source.sourceReviewWorkspaceHash,
    fidelityPlanHash: source.fidelityPlanHash,
    candidates: source.candidates,
    appendAuthorized: source.appendAuthorized,
  };
  source.fidelityReportHash = digest(hashPayload);
  assert.throws(
    () => buildSanrioEdinetUnmatchedAnchorReport({
      fidelityReport: source,
      sourceFidelityReportFile: "revision-source-fidelity-v1.fixture.json",
      pdfInputs: [],
    }),
    /no unmatched anchors/,
  );
  console.log("edinet-sanrio-unmatched-anchor: no unmatched source rejected OK");
}

console.log("edinet-sanrio-unmatched-anchor-inspection.test.ts passed");
