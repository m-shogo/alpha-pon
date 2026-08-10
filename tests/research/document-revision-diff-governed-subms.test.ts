import assert from "node:assert/strict";
import {
  validateIncomingDocumentRevisionDiffCutoff,
  visibleDocumentRevisionsAtCutoff,
} from "../../src/research/document-revision-diff-governed.js";
import type { EvidenceSnapshot } from "../../src/research/bitemporal-evidence-store.js";
import type { DocumentRevisionRecord } from "../../src/research/document-revision-diff.js";

const cutoff = "2026-08-11T00:00:00.123456789Z";

function revision(observedAt: string): DocumentRevisionRecord {
  return {
    recordId: `record-${observedAt}`,
    documentRevisionId: `revision-${observedAt}`,
    observedAt,
    retrievedAt: observedAt,
    effectiveFrom: "2026-08-10T00:00:00.000000000Z",
    status: "active",
  } as unknown as DocumentRevisionRecord;
}

{
  const before = revision("2026-08-11T00:00:00.123456788Z");
  const after = revision("2026-08-11T00:00:00.123456790Z");
  assert.deepEqual(visibleDocumentRevisionsAtCutoff([before, after], cutoff), [before]);
  console.log("document-revision-diff-governed: 1ns future revision excluded from PIT visibility OK");
}

{
  assert.throws(
    () => visibleDocumentRevisionsAtCutoff([], "2026-08-11T00:00:00.123456789"),
    /explicit timezone/,
  );
  console.log("document-revision-diff-governed: cutoff requires explicit timezone OK");
}

{
  const after = revision("2026-08-11T00:00:00.123456790Z");
  const snapshot = {
    asOf: cutoff,
    mode: "system_replay",
    evidence: [],
  } as unknown as EvidenceSnapshot;
  const issues = validateIncomingDocumentRevisionDiffCutoff([after], [], snapshot);
  assert.ok(issues.some((issue) => issue.code === "incoming_document_revision_after_snapshot_cutoff"));
  console.log("document-revision-diff-governed: 1ns future incoming revision rejected OK");
}

console.log("document-revision-diff-governed-subms.test.ts passed");
