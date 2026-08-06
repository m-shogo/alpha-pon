import assert from "node:assert/strict";
import {
  computeGovernedDocumentRevisionDiffSnapshotHash,
  validateGovernedDocumentRevisionDiffSnapshot,
} from "../../src/research/document-revision-diff-snapshot.js";
import type {
  GovernedDocumentRevisionDiffSnapshot,
} from "../../src/research/document-revision-diff-governed.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema(
  "research/schemas/document-revision-diff-snapshot.schema.json",
);

function snapshot(
  overrides: Partial<Omit<GovernedDocumentRevisionDiffSnapshot, "contentHash">> = {},
): GovernedDocumentRevisionDiffSnapshot {
  const input: Omit<GovernedDocumentRevisionDiffSnapshot, "contentHash"> = {
    asOf: "2026-08-06T10:00:00+09:00",
    mode: "system_replay",
    documentSnapshotHash: "a".repeat(64),
    evidenceSnapshotHash: "b".repeat(64),
    revisionIds: [
      "document-revision:snapshot:0",
      "document-revision:snapshot:1",
    ],
    diffIds: ["document-diff:snapshot:0-1"],
    evidenceIds: [
      "evidence:snapshot:correction",
      "evidence:snapshot:initial",
    ],
    ...overrides,
  };
  return {
    ...input,
    contentHash: computeGovernedDocumentRevisionDiffSnapshotHash(input),
  };
}

{
  const valid = snapshot();
  assert.deepEqual(
    validateGovernedDocumentRevisionDiffSnapshot(valid, schema),
    [],
  );
  assert.equal(
    computeGovernedDocumentRevisionDiffSnapshotHash(valid),
    valid.contentHash,
  );
  console.log("document-revision-diff-snapshot: deterministic valid hash OK");
}

{
  const valid = snapshot();
  const tampered = {
    ...valid,
    documentSnapshotHash: "c".repeat(64),
  };
  assert.ok(validateGovernedDocumentRevisionDiffSnapshot(tampered, schema)
    .some((item) => item.code === "invalid_document_snapshot_hash"));
  console.log("document-revision-diff-snapshot: tamper block OK");
}

{
  const unsorted = snapshot({
    revisionIds: [
      "document-revision:snapshot:1",
      "document-revision:snapshot:0",
    ],
  });
  assert.ok(validateGovernedDocumentRevisionDiffSnapshot(unsorted, schema)
    .some((item) =>
      item.code === "non_canonical_document_snapshot_array" &&
      item.target === "revisionIds",
    ));
  console.log("document-revision-diff-snapshot: non-canonical ordering block OK");
}

{
  const input: Omit<GovernedDocumentRevisionDiffSnapshot, "contentHash"> = {
    asOf: "2026-08-06T10:00:00+09:00",
    mode: "system_replay",
    documentSnapshotHash: "a".repeat(64),
    evidenceSnapshotHash: "b".repeat(64),
    revisionIds: [
      "document-revision:snapshot:0",
      "document-revision:snapshot:0",
    ],
    diffIds: [],
    evidenceIds: [],
  };
  const duplicated: GovernedDocumentRevisionDiffSnapshot = {
    ...input,
    contentHash: computeGovernedDocumentRevisionDiffSnapshotHash(input),
  };
  assert.ok(validateGovernedDocumentRevisionDiffSnapshot(duplicated, schema)
    .some((item) => item.code === "schema_violation"));
  console.log("document-revision-diff-snapshot: duplicate ID block OK");
}

console.log("document-revision-diff-snapshot: 全テスト成功");
