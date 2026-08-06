import assert from "node:assert/strict";
import {
  buildSanrioEdinetReviewWorkspace,
  renderSanrioEdinetReviewChecklist,
} from "../src/research/edinet-sanrio-review-workspace.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);

function inventory(): unknown {
  return {
    schemaVersion: 1,
    source: "edinet",
    completeness: "complete",
    failedDates: [],
    appendAuthorized: false,
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    candidates: [
      {
        doc: {
          docID: "S100CORR",
          parentDocID: "S100ROOT",
          submitDateTime: "2026-06-29T16:21:00+09:00",
          docDescription: "訂正有価証券報告書",
        },
      },
      {
        doc: {
          docID: "S100CONF",
          parentDocID: "S100CORR",
          submitDateTime: "2026-06-29T16:29:00+09:00",
          docDescription: "確認書",
        },
      },
    ],
    lineage: {
      hasBlockingIssues: false,
      issues: [
        {
          severity: "warning",
          code: "missing_parent_document",
          target: "S100CORR",
          message: "parent outside observed set",
        },
      ],
      nodes: [
        {
          docID: "S100CORR",
          parentDocID: "S100ROOT",
          chainRootDocID: "S100ROOT",
          submitDateTime: "2026-06-29T16:21:00+09:00",
          docDescription: "訂正有価証券報告書",
          revisionReviewHint: "correction_candidate",
        },
        {
          docID: "S100CONF",
          parentDocID: "S100CORR",
          chainRootDocID: "S100ROOT",
          submitDateTime: "2026-06-29T16:29:00+09:00",
          docDescription: "確認書",
          revisionReviewHint: "correction_candidate",
        },
      ],
    },
  };
}

function success(
  docID: string,
  documentType: "1" | "2",
  sha256: string,
  overrides: Partial<{
    reason: string;
    sourceDocID: string;
    parentOutsideInventory: boolean;
    byteLength: number;
  }> = {},
): unknown {
  const format = documentType === "2" ? "pdf" : "zip";
  return {
    task: {
      docID,
      documentType,
      format,
      reason: overrides.reason ?? "core_filing_human_review",
      sourceDocID: overrides.sourceDocID ?? docID,
      parentOutsideInventory: overrides.parentOutsideInventory ?? false,
    },
    binaryFile: `${docID}.type-${documentType}.${sha256.slice(0, 16)}.${format}`,
    metadataFile: `${docID}.type-${documentType}.${sha256.slice(0, 16)}.metadata.json`,
    sha256,
    byteLength: overrides.byteLength ?? 1234,
    retrievedAt: "2026-08-06T06:47:08.000Z",
  };
}

function acquisitionManifest(): unknown {
  const succeeded = [
    success("S100ROOT", "1", HASH_A, {
      reason: "external_parent_structured",
      sourceDocID: "S100CORR",
      parentOutsideInventory: true,
    }),
    success("S100ROOT", "2", HASH_B, {
      reason: "external_parent_human_review",
      sourceDocID: "S100CORR",
      parentOutsideInventory: true,
    }),
    success("S100CORR", "1", HASH_C, { reason: "core_filing_structured" }),
    success("S100CORR", "2", HASH_D, { reason: "core_filing_human_review" }),
    success("S100CONF", "2", HASH_E, { reason: "supporting_document_human_review" }),
  ];
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceInventory: "sanrio-edinet-inventory.2026-01-01.2026-08-06.json",
    sourceInventoryRange: { from: "2026-01-01", to: "2026-08-06" },
    generatedAt: "2026-08-06T06:47:08.000Z",
    outputDirectory: "sanrio-acquisition.20260806T064708Z",
    totalTasks: succeeded.length,
    succeeded,
    failed: [],
    complete: true,
    storageBoundary: "local_only",
    appendAuthorized: false,
  };
}

function testReviewWorkspace(): void {
  const workspace = buildSanrioEdinetReviewWorkspace({
    inventory: inventory(),
    acquisitionManifest: acquisitionManifest(),
    acquisitionManifestFile: "acquisition-manifest.json",
    generatedAt: "2026-08-06T06:50:00.000Z",
  });

  assert.equal(workspace.retrievalComplete, true);
  assert.equal(workspace.acquisitionCount, 5);
  assert.equal(workspace.documentCount, 3);
  assert.equal(workspace.groups.length, 1);
  assert.equal(workspace.groups[0]?.chainRootDocID, "S100ROOT");
  assert.deepEqual(
    workspace.groups[0]?.documents.map(document => document.docID),
    ["S100ROOT", "S100CORR", "S100CONF"],
  );
  assert.equal(workspace.groups[0]?.documents[0]?.parentOutsideInventory, true);
  assert.ok(
    workspace.groups[0]?.documents[0]?.blockers.includes(
      "external_parent_metadata_review_required",
    ),
  );
  assert.ok(
    workspace.groups[0]?.documents[1]?.blockers.includes(
      "revision_relation_confirmation_required",
    ),
  );
  assert.equal(workspace.reviewStatus, "pending_human_review");
  assert.equal(workspace.appendAuthorized, false);
  assert.match(workspace.workspaceHash, /^[a-f0-9]{64}$/);

  const repeated = buildSanrioEdinetReviewWorkspace({
    inventory: inventory(),
    acquisitionManifest: acquisitionManifest(),
    acquisitionManifestFile: "acquisition-manifest.json",
    generatedAt: "2026-08-06T06:50:00.000Z",
  });
  assert.equal(repeated.workspaceHash, workspace.workspaceHash);

  const markdown = renderSanrioEdinetReviewChecklist(workspace);
  assert.match(markdown, /S100ROOT/);
  assert.match(markdown, /S100CORR/);
  assert.match(markdown, /pending_human_review/);
  assert.match(markdown, /appendAuthorized: false/);
}

function testFailClosedInputs(): void {
  const incomplete = acquisitionManifest() as Record<string, unknown>;
  incomplete.complete = false;
  assert.throws(
    () => buildSanrioEdinetReviewWorkspace({
      inventory: inventory(),
      acquisitionManifest: incomplete,
      acquisitionManifestFile: "acquisition-manifest.json",
      generatedAt: "2026-08-06T06:50:00.000Z",
    }),
    /must be complete/,
  );

  const badInventory = inventory() as Record<string, unknown>;
  badInventory.appendAuthorized = true;
  assert.throws(
    () => buildSanrioEdinetReviewWorkspace({
      inventory: badInventory,
      acquisitionManifest: acquisitionManifest(),
      acquisitionManifestFile: "acquisition-manifest.json",
      generatedAt: "2026-08-06T06:50:00.000Z",
    }),
    /appendAuthorized must be false/,
  );

  const duplicate = acquisitionManifest() as Record<string, unknown>;
  duplicate.succeeded = [
    ...((duplicate.succeeded as unknown[]) ?? []),
    success("S100CONF", "2", HASH_E, { reason: "supporting_document_human_review" }),
  ];
  duplicate.totalTasks = (duplicate.succeeded as unknown[]).length;
  assert.throws(
    () => buildSanrioEdinetReviewWorkspace({
      inventory: inventory(),
      acquisitionManifest: duplicate,
      acquisitionManifestFile: "acquisition-manifest.json",
      generatedAt: "2026-08-06T06:50:00.000Z",
    }),
    /duplicate acquisition/,
  );
}

testReviewWorkspace();
testFailClosedInputs();
console.log("edinet-sanrio-review-workspace.test.ts passed");
