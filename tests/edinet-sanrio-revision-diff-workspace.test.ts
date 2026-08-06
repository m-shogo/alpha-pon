import assert from "node:assert/strict";
import {
  buildSanrioEdinetRevisionDiffPlan,
  buildSanrioEdinetRevisionDiffWorkspace,
  compareSanrioEdinetRevisionEntries,
  isEdinetPublicDocumentEntry,
  normalizeEdinetPublicDocument,
  renderSanrioEdinetRevisionDiffReview,
} from "../src/research/edinet-sanrio-revision-diff-workspace.js";

function acquisition(documentType: string, format: string, binaryFile: string, sha: string) {
  return {
    documentType,
    format,
    reason: "test",
    binaryFile,
    metadataFile: `${binaryFile}.metadata.json`,
    sha256: sha,
    byteLength: 100,
    retrievedAt: "2026-08-06T06:47:08.000Z",
  };
}

function reviewWorkspace() {
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceInventory: "sanrio-edinet-inventory.json",
    acquisitionManifest: "acquisition-manifest.json",
    generatedAt: "2026-08-06T06:50:00.000Z",
    retrievalComplete: true,
    acquisitionCount: 5,
    documentCount: 3,
    reviewStatus: "pending_human_review",
    groups: [
      {
        groupId: "edinet-chain:S100TUQ8",
        chainRootDocID: "S100TUQ8",
        documents: [
          {
            docID: "S100TUQ8",
            parentDocID: null,
            chainRootDocID: "S100TUQ8",
            submitDateTime: "2024-06-28T15:00:00+09:00",
            description: "有価証券報告書－第64期",
            revisionReviewHint: "external_parent_candidate",
            parentOutsideInventory: true,
            acquisitions: [
              acquisition("1", "zip", "S100TUQ8.type-1.parent.zip", "1".repeat(64)),
              acquisition("2", "pdf", "S100TUQ8.type-2.parent.pdf", "2".repeat(64)),
            ],
            reviewStatus: "pending_human_review",
            blockers: [],
          },
          {
            docID: "S100YMT4",
            parentDocID: "S100TUQ8",
            chainRootDocID: "S100TUQ8",
            submitDateTime: "2026-06-29T16:21:00+09:00",
            description: "訂正有価証券報告書－第64期",
            revisionReviewHint: "correction_candidate",
            parentOutsideInventory: false,
            acquisitions: [
              acquisition("1", "zip", "S100YMT4.type-1.child.zip", "3".repeat(64)),
              acquisition("2", "pdf", "S100YMT4.type-2.child.pdf", "4".repeat(64)),
            ],
            reviewStatus: "pending_human_review",
            blockers: [],
          },
          {
            docID: "S100YN6Q",
            parentDocID: "S100YMT4",
            chainRootDocID: "S100TUQ8",
            submitDateTime: "2026-06-29T16:29:00+09:00",
            description: "確認書",
            revisionReviewHint: "supporting_document",
            parentOutsideInventory: false,
            acquisitions: [
              acquisition("2", "pdf", "S100YN6Q.type-2.pdf", "5".repeat(64)),
            ],
            reviewStatus: "pending_human_review",
            blockers: [],
          },
        ],
        reviewChecklist: [],
      },
    ],
    globalBlockers: [],
    appendAuthorized: false,
    workspaceHash: "a".repeat(64),
  };
}

{
  const plan = buildSanrioEdinetRevisionDiffPlan(reviewWorkspace());
  assert.equal(plan.pairs.length, 1);
  assert.deepEqual(plan.pairs[0], {
    pairId: "edinet:S100TUQ8->S100YMT4",
    groupId: "edinet-chain:S100TUQ8",
    chainRootDocID: "S100TUQ8",
    fromDocID: "S100TUQ8",
    toDocID: "S100YMT4",
    fromDescription: "有価証券報告書－第64期",
    toDescription: "訂正有価証券報告書－第64期",
    fromSubmitDateTime: "2024-06-28T15:00:00+09:00",
    toSubmitDateTime: "2026-06-29T16:21:00+09:00",
    fromZipFile: "S100TUQ8.type-1.parent.zip",
    toZipFile: "S100YMT4.type-1.child.zip",
    fromZipSha256: "1".repeat(64),
    toZipSha256: "3".repeat(64),
  });
  assert.equal(plan.appendAuthorized, false);
  console.log("edinet-sanrio-revision-diff: correction pair planning OK");
}

{
  assert.equal(isEdinetPublicDocumentEntry("XBRL/PublicDoc/summary.htm"), true);
  assert.equal(isEdinetPublicDocumentEntry("PublicDoc/report.xbrl"), true);
  assert.equal(isEdinetPublicDocumentEntry("XBRL/AuditDoc/report.htm"), false);
  assert.equal(isEdinetPublicDocumentEntry("../PublicDoc/report.htm"), false);
  const normalized = normalizeEdinetPublicDocument(
    "XBRL/PublicDoc/report.htm",
    "<html><style>ignore</style><body><h1> 訂正事項 </h1><p>売上高&nbsp;100</p><ix:hidden>secret</ix:hidden></body></html>",
  );
  assert.equal(normalized, "訂正事項\n売上高 100");
  console.log("edinet-sanrio-revision-diff: safe PublicDoc normalization OK");
}

{
  const pair = buildSanrioEdinetRevisionDiffPlan(reviewWorkspace()).pairs[0]!;
  const result = compareSanrioEdinetRevisionEntries({
    pair,
    beforeEntries: [
      {
        path: "XBRL/PublicDoc/a.htm",
        content: "<h1>業績</h1><p>売上高 100</p><p>利益 20</p>",
      },
      {
        path: "XBRL/PublicDoc/unchanged.htm",
        content: "<p>変更なし</p>",
      },
      {
        path: "XBRL/PublicDoc/removed.htm",
        content: "<p>旧記載</p>",
      },
    ],
    afterEntries: [
      {
        path: "XBRL/PublicDoc/a.htm",
        content: "<h1>業績</h1><p>売上高 120</p><p>利益 20</p>",
      },
      {
        path: "XBRL/PublicDoc/unchanged.htm",
        content: "<p>変更なし</p>",
      },
      {
        path: "XBRL/PublicDoc/added.htm",
        content: "<p>追加記載</p>",
      },
    ],
  });
  assert.equal(result.modifiedEntryCount, 1);
  assert.equal(result.addedEntryCount, 1);
  assert.equal(result.removedEntryCount, 1);
  assert.equal(result.unchangedEntryCount, 1);
  assert.equal(result.changes.length, 3);
  const modified = result.changes.find(change => change.changeType === "modified")!;
  assert.deepEqual(modified.beforePreview, ["売上高 100"]);
  assert.deepEqual(modified.afterPreview, ["売上高 120"]);
  assert.equal(modified.semanticType, "unknown_pending_human_review");
  assert.match(result.pairDiffHash, /^[a-f0-9]{64}$/);

  const workspace = buildSanrioEdinetRevisionDiffWorkspace({
    plan: buildSanrioEdinetRevisionDiffPlan(reviewWorkspace()),
    pairs: [result],
    generatedAt: "2026-08-06T07:00:00.000Z",
  });
  assert.equal(workspace.pairCount, 1);
  assert.equal(workspace.changedEntryCount, 3);
  assert.equal(workspace.reviewStatus, "pending_human_review");
  assert.equal(workspace.appendAuthorized, false);
  assert.match(workspace.diffWorkspaceHash, /^[a-f0-9]{64}$/);
  assert.match(renderSanrioEdinetRevisionDiffReview(workspace), /S100TUQ8 → S100YMT4/);
  console.log("edinet-sanrio-revision-diff: hash-only candidate diff workspace OK");
}

{
  const broken = reviewWorkspace();
  const documents = broken.groups[0]!.documents;
  documents[0]!.acquisitions = documents[0]!.acquisitions.filter(
    item => item.documentType !== "1",
  );
  assert.throws(
    () => buildSanrioEdinetRevisionDiffPlan(broken),
    /requires exactly one type=1 ZIP acquisition/,
  );
  console.log("edinet-sanrio-revision-diff: missing structured parent ZIP blocked OK");
}

{
  assert.throws(
    () => compareSanrioEdinetRevisionEntries({
      pair: buildSanrioEdinetRevisionDiffPlan(reviewWorkspace()).pairs[0]!,
      beforeEntries: [{ path: "../PublicDoc/a.htm", content: "bad" }],
      afterEntries: [{ path: "XBRL/PublicDoc/a.htm", content: "good" }],
    }),
    /outside EDINET PublicDoc/,
  );
  console.log("edinet-sanrio-revision-diff: unsafe archive entry blocked OK");
}

console.log("edinet-sanrio-revision-diff-workspace.test.ts passed");
