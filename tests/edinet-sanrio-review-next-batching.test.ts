import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetReviewNextBatchWorkspace,
  renderSanrioEdinetReviewNextBatchWorkspace,
} from "../src/research/edinet-sanrio-review-next-batching.js";

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

function candidate(input: {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  path: string;
  role: string;
  before: string[];
  after: string[];
  changedLines?: number;
}) {
  return {
    pairId: input.pairId,
    fromDocID: input.fromDocID,
    toDocID: input.toDocID,
    fromDescription: "有価証券報告書",
    toDescription: "訂正有価証券報告書",
    path: input.path,
    beforePath: input.path,
    afterPath: input.path,
    logicalRoleKey: input.role,
    changeType: "modified",
    beforeHash: "a".repeat(64),
    afterHash: "b".repeat(64),
    beforeLineCount: 10,
    afterLineCount: 10,
    changedBeforeLineCount: input.changedLines ?? input.before.length,
    changedAfterLineCount: input.changedLines ?? input.after.length,
    beforePreview: input.before,
    afterPreview: input.after,
    recurrence: "all_pairs_same_role",
    pairCoverage: 2,
    totalPairs: 2,
    priority: "review_next",
    reasonCodes: ["same_role_changed_across_all_periods_review_after_exceptions"],
    semanticType: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
}

function cluster(id: string, role: string, candidates: unknown[]) {
  const base = {
    clusterId: id,
    logicalRoleKey: role,
    changeType: "modified",
    recurrence: "all_pairs_same_role",
    pairCoverage: 2,
    totalPairs: 2,
    pairIds: ["pair:64", "pair:65"],
    priority: "review_next",
    candidates,
  };
  return { ...base, clusterHash: digest(base) };
}

function sourceWorkspace() {
  const benign = cluster("cluster:benign", "notes/submission-date", [
    candidate({
      pairId: "pair:64",
      fromDocID: "S100OLD64",
      toDocID: "S100NEW64",
      path: "PublicDoc/note_2024-03-31.htm",
      role: "notes/submission-date",
      before: ["提出日 2024年6月28日"],
      after: ["提出日 2026年6月29日"],
    }),
    candidate({
      pairId: "pair:65",
      fromDocID: "S100OLD65",
      toDocID: "S100NEW65",
      path: "PublicDoc/note_2025-03-31.htm",
      role: "notes/submission-date",
      before: ["提出日 2025年6月27日"],
      after: ["提出日 2026年6月29日"],
    }),
  ]);
  const numeric = cluster("cluster:numeric", "notes/segment", [
    candidate({
      pairId: "pair:64",
      fromDocID: "S100OLD64",
      toDocID: "S100NEW64",
      path: "PublicDoc/segment_64.htm",
      role: "notes/segment",
      before: ["金額 100百万円"],
      after: ["金額 120百万円"],
    }),
    candidate({
      pairId: "pair:65",
      fromDocID: "S100OLD65",
      toDocID: "S100NEW65",
      path: "PublicDoc/segment_65.htm",
      role: "notes/segment",
      before: ["金額 200百万円"],
      after: ["金額 220百万円"],
    }),
  ]);
  const control = cluster("cluster:control", "governance/internal-control", [
    candidate({
      pairId: "pair:64",
      fromDocID: "S100OLD64",
      toDocID: "S100NEW64",
      path: "PublicDoc/control_64.htm",
      role: "governance/internal-control",
      before: ["内部統制の状況 旧"],
      after: ["内部統制の状況 新"],
    }),
    candidate({
      pairId: "pair:65",
      fromDocID: "S100OLD65",
      toDocID: "S100NEW65",
      path: "PublicDoc/control_65.htm",
      role: "governance/internal-control",
      before: ["内部統制の状況 旧"],
      after: ["内部統制の状況 新"],
    }),
  ]);
  const clusters = [benign, numeric, control];
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceDiffWorkspaceFile: "revision-diff-workspace-v2.fixture.json",
    sourceDiffWorkspaceHash: "c".repeat(64),
    generatedAt: "2026-08-06T08:24:52.000Z",
    pairCount: 2,
    sourceCandidateCount: 6,
    clusterCount: 3,
    allPairsCommonClusterCount: 3,
    pairSpecificOrPartialClusterCount: 0,
    reviewFirstCandidateCount: 0,
    reviewNextCandidateCount: 6,
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
  return { ...base, triageWorkspaceHash: digest(hashPayload) };
}

{
  const workspace = buildSanrioEdinetReviewNextBatchWorkspace({
    triageWorkspace: sourceWorkspace(),
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    generatedAt: "2026-08-06T10:00:00.000Z",
  });
  assert.equal(workspace.sourceCandidateCount, 6);
  assert.equal(workspace.sourceClusterCount, 3);
  assert.equal(workspace.exceptionClusterCount, 2);
  assert.equal(workspace.representativeClusterCount, 1);
  assert.equal(workspace.initialReviewCandidateCount, 5);
  assert.equal(workspace.deferredPairConfirmationCount, 1);
  assert.equal(workspace.estimatedInitialReviewReduction, 1);
  assert.equal(workspace.appendAuthorized, false);

  const benign = workspace.clusters.find(item => item.sourceClusterId === "cluster:benign")!;
  assert.equal(benign.strategy, "review_representative_then_confirm_pair");
  assert.equal(benign.initialReviewCandidateIds.length, 1);
  assert.equal(benign.deferredPairConfirmationCandidateIds.length, 1);

  const numeric = workspace.clusters.find(item => item.sourceClusterId === "cluster:numeric")!;
  assert.equal(numeric.strategy, "review_all_candidates_first");
  assert.ok(numeric.reviewSignals.includes("numeric_preview_variance"));

  const control = workspace.clusters.find(item => item.sourceClusterId === "cluster:control")!;
  assert.ok(control.reviewSignals.includes("high_signal_keyword:内部統制"));
  assert.equal(control.initialReviewCandidateIds.length, 2);

  const markdown = renderSanrioEdinetReviewNextBatchWorkspace(workspace);
  assert.match(markdown, /changes review order only/);
  assert.match(markdown, /representative_first/);
  assert.match(workspace.workspaceHash, /^[a-f0-9]{64}$/);
  console.log("edinet-sanrio-review-next-batching: deterministic exception and representative batches OK");
}

{
  assert.throws(
    () => buildSanrioEdinetReviewNextBatchWorkspace({
      triageWorkspace: sourceWorkspace(),
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
      generatedAt: "2026-08-06T10:00:00",
    }),
    /generatedAt must be an ISO-8601 timestamp with explicit timezone/,
  );
  console.log("edinet-sanrio-review-next-batching: generatedAt explicit timezone required OK");
}

{
  assert.throws(
    () => buildSanrioEdinetReviewNextBatchWorkspace({
      triageWorkspace: sourceWorkspace(),
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
      generatedAt: "2026-02-30T10:00:00Z",
    }),
    /generatedAt must be a valid Gregorian ISO-8601 timestamp/,
  );
  console.log("edinet-sanrio-review-next-batching: generatedAt Gregorian validity required OK");
}

{
  const workspace = buildSanrioEdinetReviewNextBatchWorkspace({
    triageWorkspace: sourceWorkspace(),
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    generatedAt: "2026-08-06T19:00:00+09:00",
  });
  assert.equal(workspace.generatedAt, "2026-08-06T19:00:00+09:00");
  console.log("edinet-sanrio-review-next-batching: valid explicit offset generatedAt preserved OK");
}

{
  const tampered = sourceWorkspace();
  const firstCandidate = tampered.clusters[0]!.candidates[0] as JsonObject;
  firstCandidate.afterPreview = ["tampered"];
  assert.throws(
    () => buildSanrioEdinetReviewNextBatchWorkspace({
      triageWorkspace: tampered,
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    }),
    /triageWorkspaceHash mismatch/,
  );
  console.log("edinet-sanrio-review-next-batching: source tampering blocked OK");
}

{
  const wrongCount = sourceWorkspace();
  wrongCount.reviewNextCandidateCount = 7;
  const hashPayload = {
    schemaVersion: wrongCount.schemaVersion,
    source: wrongCount.source,
    sourceDiffWorkspaceHash: wrongCount.sourceDiffWorkspaceHash,
    clusters: wrongCount.clusters,
    appendAuthorized: wrongCount.appendAuthorized,
  };
  wrongCount.triageWorkspaceHash = digest(hashPayload);
  assert.throws(
    () => buildSanrioEdinetReviewNextBatchWorkspace({
      triageWorkspace: wrongCount,
      sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    }),
    /reviewNextCandidateCount mismatch/,
  );
  console.log("edinet-sanrio-review-next-batching: aggregate count mismatch blocked OK");
}

console.log("edinet-sanrio-review-next-batching.test.ts passed");
