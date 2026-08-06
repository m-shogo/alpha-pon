import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetReviewNextContentBundle,
  buildSanrioEdinetReviewNextContentPlan,
  renderSanrioEdinetReviewNextContentBundle,
} from "../src/research/edinet-sanrio-review-next-content-bundle.js";

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

function batchCandidate(input: {
  id: string;
  pairId: string;
  fromDocID: string;
  toDocID: string;
  path: string;
  role: string;
  signals?: string[];
}) {
  return {
    candidateId: input.id,
    pairId: input.pairId,
    fromDocID: input.fromDocID,
    toDocID: input.toDocID,
    path: input.path,
    beforePath: input.path,
    afterPath: input.path,
    logicalRoleKey: input.role,
    changeType: "modified",
    beforeLineCount: 10,
    afterLineCount: 10,
    changedBeforeLineCount: 2,
    changedAfterLineCount: 2,
    beforePreview: ["旧記載"],
    afterPreview: ["新記載"],
    pairCoverage: 2,
    totalPairs: 2,
    priority: "review_next",
    reasonCodes: ["same_role_changed_across_all_periods_review_after_exceptions"],
    shapeSignature: "a".repeat(64),
    numericPreviewVariance: false,
    highSignalKeywords: [],
    reviewSignals: input.signals ?? [],
  };
}

function batchCluster(input: {
  batchId: string;
  clusterId: string;
  role: string;
  strategy: "review_all_candidates_first" | "review_representative_then_confirm_pair";
  candidates: ReturnType<typeof batchCandidate>[];
  initialIds: string[];
  deferredIds: string[];
}) {
  const base = {
    batchId: input.batchId,
    sourceClusterId: input.clusterId,
    logicalRoleKey: input.role,
    strategy: input.strategy,
    reviewOrder: input.strategy === "review_all_candidates_first" ? "exception_first" : "representative_first",
    pairCoverage: 2,
    totalPairs: 2,
    candidateCount: input.candidates.length,
    initialReviewCandidateIds: input.initialIds,
    deferredPairConfirmationCandidateIds: input.deferredIds,
    reviewSignals: input.candidates.flatMap(candidate => candidate.reviewSignals),
    candidates: input.candidates,
  };
  return { ...base, batchHash: digest(base) };
}

function batchWorkspace() {
  const amount64 = batchCandidate({
    id: "candidate:amount64",
    pairId: "pair:64",
    fromDocID: "S100OLD64",
    toDocID: "S100NEW64",
    path: "PublicDoc/amount64.htm",
    role: "notes/amount",
    signals: ["numeric_preview_variance"],
  });
  const amount65 = batchCandidate({
    id: "candidate:amount65",
    pairId: "pair:65",
    fromDocID: "S100OLD65",
    toDocID: "S100NEW65",
    path: "PublicDoc/amount65.htm",
    role: "notes/amount",
    signals: ["numeric_preview_variance"],
  });
  const note64 = batchCandidate({
    id: "candidate:note64",
    pairId: "pair:64",
    fromDocID: "S100OLD64",
    toDocID: "S100NEW64",
    path: "PublicDoc/note64.htm",
    role: "notes/general",
  });
  const note65 = batchCandidate({
    id: "candidate:note65",
    pairId: "pair:65",
    fromDocID: "S100OLD65",
    toDocID: "S100NEW65",
    path: "PublicDoc/note65.htm",
    role: "notes/general",
  });
  const clusters = [
    batchCluster({
      batchId: "batch:amount",
      clusterId: "cluster:amount",
      role: "notes/amount",
      strategy: "review_all_candidates_first",
      candidates: [amount64, amount65],
      initialIds: [amount64.candidateId, amount65.candidateId],
      deferredIds: [],
    }),
    batchCluster({
      batchId: "batch:note",
      clusterId: "cluster:note",
      role: "notes/general",
      strategy: "review_representative_then_confirm_pair",
      candidates: [note64, note65],
      initialIds: [note64.candidateId],
      deferredIds: [note65.candidateId],
    }),
  ];
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceTriageWorkspaceHash: "b".repeat(64),
    clusters,
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
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    sourceTriageWorkspaceHash: hashPayload.sourceTriageWorkspaceHash,
    generatedAt: "2026-08-06T10:00:00.000Z",
    sourceCandidateCount: 4,
    sourceClusterCount: 2,
    exceptionClusterCount: 1,
    representativeClusterCount: 1,
    initialReviewCandidateCount: 3,
    deferredPairConfirmationCount: 1,
    estimatedInitialReviewReduction: 1,
    reviewStatus: "pending_human_review",
    clusters,
    globalBlockers: ["full_source_text_and_pdf_review_still_required"],
    appendAuthorized: false,
    workspaceHash: digest(hashPayload),
  };
}

{
  const plan = buildSanrioEdinetReviewNextContentPlan({
    batchWorkspace: batchWorkspace(),
    sourceBatchWorkspaceFile: "revision-review-next-batches-v1.fixture.json",
  });
  assert.equal(plan.candidateCount, 3);
  assert.ok(plan.candidates.some(candidate => candidate.candidateId === "candidate:amount64"));
  assert.ok(plan.candidates.some(candidate => candidate.candidateId === "candidate:amount65"));
  assert.ok(plan.candidates.some(candidate => candidate.candidateId === "candidate:note64"));
  assert.ok(!plan.candidates.some(candidate => candidate.candidateId === "candidate:note65"));
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.equal(plan.appendAuthorized, false);

  const bundle = buildSanrioEdinetReviewNextContentBundle({
    plan,
    generatedAt: "2026-08-06T10:30:00.000Z",
    contents: [
      {
        candidateId: "candidate:amount64",
        beforeText: [
          "売上高 100百万円",
          "（注）金額は百万円未満を切り捨てております。",
        ].join("\n"),
        afterText: [
          "売上高 120百万円",
          "（注）金額は百万円未満を切り捨てております。",
        ].join("\n"),
      },
      {
        candidateId: "candidate:amount65",
        beforeText: "内部統制に関する旧記載",
        afterText: "内部統制に関する新記載",
      },
      {
        candidateId: "candidate:note64",
        beforeText: "注記なし",
        afterText: "※ 当該事項は翌期も継続して確認する。",
      },
    ],
  });
  assert.equal(bundle.candidateCount, 3);
  assert.ok(bundle.numericLineCount >= 2);
  assert.ok(bundle.footnoteLineCount >= 3);
  assert.ok(bundle.accountingKeywordLineCount >= 4);
  assert.equal(bundle.reviewStatus, "pending_human_review");
  assert.equal(bundle.appendAuthorized, false);
  assert.ok(bundle.candidates.every(candidate => candidate.factStatus === "unreviewed_source_text"));
  const amountCandidate = bundle.candidates.find(candidate => candidate.candidateId === "candidate:amount64")!;
  assert.ok(amountCandidate.reviewLines.some(line => line.numericTokens.includes("120百万円")));
  assert.ok(amountCandidate.reviewLines.some(line => line.matchedKeywords.includes("売上高")));
  const markdown = renderSanrioEdinetReviewNextContentBundle(bundle);
  assert.match(markdown, /navigation candidates, not confirmed facts/);
  assert.match(markdown, /120百万円/);
  assert.match(bundle.bundleHash, /^[a-f0-9]{64}$/);
  console.log("edinet-sanrio-review-next-content: plan, full text, amounts, footnotes and accounting lines OK");
}

{
  const tampered = batchWorkspace();
  tampered.clusters[0]!.initialReviewCandidateIds = ["candidate:note65"];
  assert.throws(
    () => buildSanrioEdinetReviewNextContentPlan({
      batchWorkspace: tampered,
      sourceBatchWorkspaceFile: "revision-review-next-batches-v1.fixture.json",
    }),
    /batchWorkspace.workspaceHash mismatch/,
  );
  console.log("edinet-sanrio-review-next-content: batch workspace tampering blocked OK");
}

{
  const plan = buildSanrioEdinetReviewNextContentPlan({
    batchWorkspace: batchWorkspace(),
    sourceBatchWorkspaceFile: "revision-review-next-batches-v1.fixture.json",
  });
  assert.throws(
    () => buildSanrioEdinetReviewNextContentBundle({
      plan,
      contents: [
        { candidateId: "candidate:amount64", beforeText: "old", afterText: "new" },
      ],
    }),
    /content count mismatch/,
  );
  console.log("edinet-sanrio-review-next-content: incomplete extraction blocked OK");
}

console.log("edinet-sanrio-review-next-content-bundle.test.ts passed");
