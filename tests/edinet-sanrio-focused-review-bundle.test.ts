import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetFocusedReviewBundle,
  buildSanrioEdinetFocusedReviewPlan,
  renderSanrioEdinetFocusedReviewBundle,
} from "../src/research/edinet-sanrio-focused-review-bundle.js";

type UnknownRecord = Record<string, unknown>;

type ReviewFirstCandidate = {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  fromDescription: string;
  toDescription: string;
  path: string;
  beforePath: null;
  afterPath: string;
  logicalRoleKey: string;
  changeType: "added";
  beforeLineCount: number;
  afterLineCount: number;
  changedBeforeLineCount: number;
  changedAfterLineCount: number;
  beforePreview: string[];
  afterPreview: string[];
  recurrence: "all_pairs_same_role";
  pairCoverage: number;
  totalPairs: number;
  priority: "review_first";
  reasonCodes: string[];
  semanticType: "unknown_pending_human_review";
  materiality: "unknown_pending_human_review";
  direction: "unknown_pending_human_review";
};

type TriageClusterFixture = {
  clusterId: string;
  logicalRoleKey: string;
  changeType: string;
  recurrence: string;
  pairCoverage: number;
  totalPairs: number;
  pairIds: string[];
  priority: string;
  candidates: ReviewFirstCandidate[];
  clusterHash: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function candidate(input: {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  period: string;
  path: string;
  logicalRoleKey: string;
  preview: string[];
}): ReviewFirstCandidate {
  return {
    pairId: input.pairId,
    fromDocID: input.fromDocID,
    toDocID: input.toDocID,
    fromDescription: `有価証券報告書－${input.period}`,
    toDescription: `訂正有価証券報告書－${input.period}`,
    path: input.path,
    beforePath: null,
    afterPath: input.path,
    logicalRoleKey: input.logicalRoleKey,
    changeType: "added",
    beforeLineCount: 0,
    afterLineCount: input.preview.length,
    changedBeforeLineCount: 0,
    changedAfterLineCount: input.preview.length,
    beforePreview: [],
    afterPreview: input.preview,
    recurrence: "all_pairs_same_role",
    pairCoverage: 2,
    totalPairs: 2,
    priority: "review_first",
    reasonCodes: ["added_or_removed_document_role"],
    semanticType: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
}

function sourceTriageWorkspace() {
  const headerCandidates = [
    candidate({
      pairId: "edinet:S100TUQ8->S100YMT4",
      fromDocID: "S100TUQ8",
      toDocID: "S100YMT4",
      period: "第64期",
      path: "PublicDoc/0000000_header.htm",
      logicalRoleKey: "0000000_header.htm",
      preview: ["【表紙】", "有価証券報告書の訂正報告書"],
    }),
    candidate({
      pairId: "edinet:S100W57J->S100YMY4",
      fromDocID: "S100W57J",
      toDocID: "S100YMY4",
      period: "第65期",
      path: "PublicDoc/0000000_header.htm",
      logicalRoleKey: "0000000_header.htm",
      preview: ["【表紙】", "有価証券報告書の訂正報告書"],
    }),
  ];
  const reasonCandidates = [
    candidate({
      pairId: "edinet:S100TUQ8->S100YMT4",
      fromDocID: "S100TUQ8",
      toDocID: "S100YMT4",
      period: "第64期",
      path: "PublicDoc/0101000_0245000133806.htm",
      logicalRoleKey: "0101000_<period-date>33806.htm",
      preview: ["有価証券報告書の訂正報告書の提出理由", "役員の報酬等"],
    }),
    candidate({
      pairId: "edinet:S100W57J->S100YMY4",
      fromDocID: "S100W57J",
      toDocID: "S100YMY4",
      period: "第65期",
      path: "PublicDoc/0101000_0245000133806.htm",
      logicalRoleKey: "0101000_<period-date>33806.htm",
      preview: ["有価証券報告書の訂正報告書の提出理由", "役員の報酬等"],
    }),
  ];
  const clusters: TriageClusterFixture[] = [
    {
      clusterId: "edinet-triage:header",
      logicalRoleKey: "0000000_header.htm",
      changeType: "added",
      recurrence: "all_pairs_same_role",
      pairCoverage: 2,
      totalPairs: 2,
      pairIds: headerCandidates.map(item => item.pairId),
      priority: "review_first",
      candidates: headerCandidates,
      clusterHash: "1".repeat(64),
    },
    {
      clusterId: "edinet-triage:reason",
      logicalRoleKey: "0101000_<period-date>33806.htm",
      changeType: "added",
      recurrence: "all_pairs_same_role",
      pairCoverage: 2,
      totalPairs: 2,
      pairIds: reasonCandidates.map(item => item.pairId),
      priority: "review_first",
      candidates: reasonCandidates,
      clusterHash: "2".repeat(64),
    },
  ];
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceDiffWorkspaceFile: "revision-diff-workspace-v2.20260806T080750Z.json",
    sourceDiffWorkspaceHash: "a".repeat(64),
    generatedAt: "2026-08-06T08:24:52.000Z",
    pairCount: 2,
    sourceCandidateCount: 52,
    clusterCount: 26,
    allPairsCommonClusterCount: 26,
    pairSpecificOrPartialClusterCount: 0,
    reviewFirstCandidateCount: 4,
    reviewNextCandidateCount: 48,
    reviewStatus: "pending_human_review",
    clusters,
    globalBlockers: ["human_pdf_review_required"],
    appendAuthorized: false,
  };
  const hashPayload = {
    schemaVersion: base.schemaVersion,
    source: base.source,
    sourceDiffWorkspaceHash: base.sourceDiffWorkspaceHash,
    clusters: base.clusters,
    appendAuthorized: base.appendAuthorized,
  };
  return { ...base, triageWorkspaceHash: hashValue(hashPayload) };
}

{
  const plan = buildSanrioEdinetFocusedReviewPlan({
    triageWorkspace: sourceTriageWorkspace(),
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.20260806T082452Z.json",
  });
  assert.equal(plan.clusterCount, 2);
  assert.equal(plan.candidateCount, 4);
  assert.ok(plan.candidates.every(item => item.priority === "review_first"));
  assert.equal(new Set(plan.candidates.map(item => item.candidateId)).size, 4);
  assert.match(plan.focusedPlanHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.appendAuthorized, false);
  console.log("edinet-sanrio-focused-review: strict review-first planning OK");
}

{
  const plan = buildSanrioEdinetFocusedReviewPlan({
    triageWorkspace: sourceTriageWorkspace(),
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.20260806T082452Z.json",
  });
  const contents = plan.candidates.map(item => ({
    candidateId: item.candidateId,
    beforeText: null,
    afterText: item.afterPath?.includes("0101000")
      ? [
          "１ 【有価証券報告書の訂正報告書の提出理由】",
          "特別調査委員会の調査によりCOLA Bonus及び大学博士課程の学費等の経済的利益が確認された。",
          "２ 【訂正事項】",
          "(4）役員の報酬等",
          "訂正後 100千円",
        ].join("\n")
      : ["【表紙】", "有価証券報告書の訂正報告書"].join("\n"),
  }));
  const bundle = buildSanrioEdinetFocusedReviewBundle({
    plan,
    contents,
    generatedAt: "2026-08-06T08:30:00.000Z",
  });
  assert.equal(bundle.candidateCount, 4);
  assert.equal(bundle.focusLineCount, 8);
  const reasonCandidate = bundle.candidates.find(item => item.afterPath?.includes("0101000"))!;
  assert.ok(reasonCandidate.focusLines.some(line => line.matchedKeywords.includes("COLA")));
  assert.ok(reasonCandidate.focusLines.some(line => line.matchedKeywords.includes("学費")));
  assert.ok(reasonCandidate.focusLines.some(line => line.matchedKeywords.includes("千円")));
  assert.equal(reasonCandidate.accountingImpact, "unknown_pending_human_review");
  assert.match(reasonCandidate.afterTextHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(bundle.focusedBundleHash, /^[a-f0-9]{64}$/);
  const markdown = renderSanrioEdinetFocusedReviewBundle(bundle);
  assert.match(markdown, /COLA Bonus/);
  assert.match(markdown, /Determine whether financial statements changed/);
  assert.match(markdown, /unreviewed_source_text/);
  console.log("edinet-sanrio-focused-review: full text and focus-line bundle OK");
}

{
  const tampered = sourceTriageWorkspace();
  tampered.clusters[0]!.candidates[0]!.afterPreview = ["tampered source text"];
  assert.throws(
    () => buildSanrioEdinetFocusedReviewPlan({
      triageWorkspace: tampered,
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.20260806T082452Z.json",
    }),
    /triageWorkspaceHash mismatch/,
  );
  console.log("edinet-sanrio-focused-review: triage hash tampering blocked OK");
}

{
  const wrongCount = sourceTriageWorkspace();
  wrongCount.reviewFirstCandidateCount = 5;
  assert.throws(
    () => buildSanrioEdinetFocusedReviewPlan({
      triageWorkspace: wrongCount,
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.20260806T082452Z.json",
    }),
    /reviewFirstCandidateCount mismatch/,
  );
  console.log("edinet-sanrio-focused-review: aggregate count tampering blocked OK");
}

{
  const plan = buildSanrioEdinetFocusedReviewPlan({
    triageWorkspace: sourceTriageWorkspace(),
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.20260806T082452Z.json",
  });
  assert.throws(
    () => buildSanrioEdinetFocusedReviewBundle({
      plan,
      contents: plan.candidates.slice(1).map(item => ({
        candidateId: item.candidateId,
        beforeText: null,
        afterText: "text",
      })),
    }),
    /content count mismatch/,
  );
  console.log("edinet-sanrio-focused-review: incomplete extraction blocked OK");
}

{
  const invalid = sourceTriageWorkspace();
  invalid.appendAuthorized = true;
  assert.throws(
    () => buildSanrioEdinetFocusedReviewPlan({
      triageWorkspace: invalid,
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.20260806T082452Z.json",
    }),
    /appendAuthorized must be false/,
  );
  console.log("edinet-sanrio-focused-review: append authorization blocked OK");
}

console.log("edinet-sanrio-focused-review-bundle.test.ts passed");
