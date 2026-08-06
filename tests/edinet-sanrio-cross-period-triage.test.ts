import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetCrossPeriodTriage,
  edinetPublicDocumentCrossPeriodRoleKey,
  renderSanrioEdinetCrossPeriodTriage,
} from "../src/research/edinet-sanrio-cross-period-triage.js";

type UnknownRecord = Record<string, unknown>;

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

function modified(path: string, beforePreview: string[], afterPreview: string[], seed: string) {
  return {
    path,
    changeType: "modified",
    beforeHash: seed.repeat(64).slice(0, 64),
    afterHash: `${seed}f`.repeat(64).slice(0, 64),
    beforeLineCount: 10,
    afterLineCount: 10,
    changedBeforeLineCount: beforePreview.length,
    changedAfterLineCount: afterPreview.length,
    commonPrefixLineCount: 2,
    commonSuffixLineCount: 3,
    beforePreview,
    afterPreview,
    semanticType: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
}

function added(path: string, afterPreview: string[], seed: string) {
  return {
    path,
    changeType: "added",
    afterHash: seed.repeat(64).slice(0, 64),
    beforeLineCount: 0,
    afterLineCount: afterPreview.length,
    changedBeforeLineCount: 0,
    changedAfterLineCount: afterPreview.length,
    commonPrefixLineCount: 0,
    commonSuffixLineCount: 0,
    beforePreview: [],
    afterPreview,
    semanticType: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
}

function pair(input: {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  period: string;
  originalDate: string;
  correctionDate: string;
  changes: unknown[];
}) {
  return {
    pairId: input.pairId,
    groupId: `group:${input.fromDocID}`,
    chainRootDocID: input.fromDocID,
    fromDocID: input.fromDocID,
    toDocID: input.toDocID,
    fromDescription: `有価証券報告書－${input.period}`,
    toDescription: `訂正有価証券報告書－${input.period}`,
    fromSubmitDateTime: `${input.originalDate}T15:00:00+09:00`,
    toSubmitDateTime: `${input.correctionDate}T16:00:00+09:00`,
    fromZipSha256: "a".repeat(64),
    toZipSha256: "b".repeat(64),
    publicDocumentEntryCountBefore: 30,
    publicDocumentEntryCountAfter: 32,
    unchangedEntryCount: 5,
    addedEntryCount: input.changes.filter(change => (change as UnknownRecord).changeType === "added").length,
    removedEntryCount: 0,
    modifiedEntryCount: input.changes.filter(change => (change as UnknownRecord).changeType === "modified").length,
    changes: input.changes,
    reviewStatus: "pending_human_review",
    blockers: ["human_changed_section_review_required"],
    pairDiffHash: hashValue({ pairId: input.pairId, changes: input.changes }),
  };
}

function sourceWorkspace() {
  const common64 =
    "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_01_2024-06-28.htm"
    + " => XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_02_2026-06-29.htm";
  const common65 =
    "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2025-03-31_01_2025-06-27.htm"
    + " => XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2025-03-31_02_2026-06-29.htm";
  const control64 =
    "XBRL/PublicDoc/jpcrp050000-asr-001_E02655-000_2024-03-31_01_2024-06-28.htm"
    + " => XBRL/PublicDoc/jpcrp050000-asr-001_E02655-000_2024-03-31_02_2026-06-29.htm";
  const control65 =
    "XBRL/PublicDoc/jpcrp050000-asr-001_E02655-000_2025-03-31_01_2025-06-27.htm"
    + " => XBRL/PublicDoc/jpcrp050000-asr-001_E02655-000_2025-03-31_02_2026-06-29.htm";

  const pairs = [
    pair({
      pairId: "edinet:S100TUQ8->S100YMT4",
      fromDocID: "S100TUQ8",
      toDocID: "S100YMT4",
      period: "第64期",
      originalDate: "2024-06-28",
      correctionDate: "2026-06-29",
      changes: [
        modified(common64, ["提出日 2024年6月28日"], ["提出日 2026年6月29日"], "1"),
        modified(control64, ["内部統制の状況 旧"], ["内部統制の状況 新"], "2"),
        added(
          "XBRL/PublicDoc/cover_E02655-000_2024-03-31_02_2026-06-29.htm",
          ["訂正有価証券報告書"],
          "3",
        ),
      ],
    }),
    pair({
      pairId: "edinet:S100W57J->S100YMY4",
      fromDocID: "S100W57J",
      toDocID: "S100YMY4",
      period: "第65期",
      originalDate: "2025-06-27",
      correctionDate: "2026-06-29",
      changes: [
        modified(common65, ["提出日 2025年6月27日"], ["提出日 2026年6月29日"], "4"),
        modified(control65, ["内部統制の状況 旧"], ["内部統制の状況 新"], "5"),
        added(
          "XBRL/PublicDoc/cover_E02655-000_2025-03-31_02_2026-06-29.htm",
          ["訂正有価証券報告書"],
          "6",
        ),
        modified(
          "XBRL/PublicDoc/pair-specific_E02655-000_2025-03-31_02_2026-06-29.htm",
          ["旧記載"],
          ["新記載"],
          "7",
        ),
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
    sourceReviewWorkspaceHash: "c".repeat(64),
    generatedAt: "2026-08-06T08:07:50.000Z",
    pairCount: 2,
    changedEntryCount: 7,
    reviewStatus: "pending_human_review",
    pairs,
    globalBlockers: ["human_review_required"],
    appendAuthorized: false,
  };
  const hashPayload = {
    schemaVersion: base.schemaVersion,
    source: base.source,
    sourceReviewWorkspaceHash: base.sourceReviewWorkspaceHash,
    pairs: base.pairs,
    appendAuthorized: base.appendAuthorized,
  };
  return { ...base, diffWorkspaceHash: hashValue(hashPayload) };
}

{
  const first = edinetPublicDocumentCrossPeriodRoleKey(
    "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2024-03-31_01_2024-06-28.htm",
  );
  const second = edinetPublicDocumentCrossPeriodRoleKey(
    "XBRL/PublicDoc/jpcrp030000-asr-001_E02655-000_2025-03-31_02_2026-06-29.htm",
  );
  assert.equal(first, second);
  assert.match(first, /<period-date>/);
  console.log("edinet-sanrio-cross-period-triage: period abstraction OK");
}

{
  const triage = buildSanrioEdinetCrossPeriodTriage({
    diffWorkspace: sourceWorkspace(),
    sourceDiffWorkspaceFile: "revision-diff-workspace-v2.20260806T080750Z.json",
    generatedAt: "2026-08-06T08:20:00.000Z",
  });
  assert.equal(triage.pairCount, 2);
  assert.equal(triage.sourceCandidateCount, 7);
  assert.equal(triage.clusterCount, 4);
  assert.equal(triage.allPairsCommonClusterCount, 3);
  assert.equal(triage.pairSpecificOrPartialClusterCount, 1);
  assert.equal(triage.reviewFirstCandidateCount, 5);
  assert.equal(triage.reviewNextCandidateCount, 2);

  const commonSubmission = triage.clusters.find(cluster =>
    cluster.candidates.some(candidate => candidate.beforePreview.includes("提出日 2024年6月28日")),
  )!;
  assert.equal(commonSubmission.recurrence, "all_pairs_same_role");
  assert.equal(commonSubmission.priority, "review_next");

  const control = triage.clusters.find(cluster =>
    cluster.candidates.some(candidate => candidate.beforePreview.includes("内部統制の状況 旧")),
  )!;
  assert.equal(control.priority, "review_first");
  assert.ok(control.candidates.every(candidate =>
    candidate.reasonCodes.includes("explicit_correction_or_control_keyword"),
  ));

  const pairSpecific = triage.clusters.find(cluster =>
    cluster.recurrence === "pair_specific_or_partial",
  )!;
  assert.equal(pairSpecific.priority, "review_first");
  assert.match(renderSanrioEdinetCrossPeriodTriage(triage), /Interpretation boundary/);
  assert.match(triage.triageWorkspaceHash, /^[a-f0-9]{64}$/);
  assert.equal(triage.appendAuthorized, false);
  console.log("edinet-sanrio-cross-period-triage: prioritization and safety boundary OK");
}

{
  const tampered = sourceWorkspace();
  (tampered.pairs[0]!.changes[0]! as UnknownRecord).afterPreview = ["tampered"];
  assert.throws(
    () => buildSanrioEdinetCrossPeriodTriage({
      diffWorkspace: tampered,
      sourceDiffWorkspaceFile: "revision-diff-workspace-v2.20260806T080750Z.json",
    }),
    /diffWorkspaceHash mismatch/,
  );
  console.log("edinet-sanrio-cross-period-triage: source hash tampering blocked OK");
}

{
  const invalid = sourceWorkspace();
  invalid.appendAuthorized = true;
  assert.throws(
    () => buildSanrioEdinetCrossPeriodTriage({
      diffWorkspace: invalid,
      sourceDiffWorkspaceFile: "revision-diff-workspace-v2.20260806T080750Z.json",
    }),
    /appendAuthorized must be false/,
  );
  console.log("edinet-sanrio-cross-period-triage: append authorization blocked OK");
}

console.log("edinet-sanrio-cross-period-triage.test.ts passed");
