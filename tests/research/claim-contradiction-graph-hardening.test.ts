import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
  type EvidenceSnapshot,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
  type ClaimGraphSchemas,
} from "../../src/research/claim-contradiction-graph.js";
import {
  appendClaimGraphRecordsGoverned,
} from "../../src/research/claim-contradiction-graph-hardening.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: ClaimGraphSchemas = {
  claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
  edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
};
const knownEntityIds = new Set(["entity:issuer:writer"]);

function evidenceSnapshot(): EvidenceSnapshot {
  const evidence = withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: "evidence:writer:record:001",
    evidenceId: "evidence:writer:primary",
    entityIds: ["entity:issuer:writer"],
    sourceId: "source:writer:company-ir",
    sourceType: "company_ir",
    sourceLocator: "https://example.com/ir/writer",
    sourceContentHash: "a".repeat(64),
    eventAtStatus: "known",
    eventAt: "2026-08-05T14:00:00+09:00",
    publishedAt: "2026-08-05T15:00:00+09:00",
    observedAt: "2026-08-05T15:01:00+09:00",
    retrievedAt: "2026-08-05T15:02:00+09:00",
    effectiveFrom: "2026-08-05T15:00:00+09:00",
    firstExecutableAt: "2026-08-06T09:00:00+09:00",
    evidenceTier: "primary_company",
    status: "active",
    license: "metadata_only",
    storagePolicy: "metadata_only",
    title: "Writer fixture disclosure",
    summary: "Writer fixture primary evidence.",
    retrievalRunId: "retrieval-run-writer",
    parserVersion: "parser-v1",
  });
  return buildEvidenceSnapshot(
    [evidence],
    [],
    "2026-08-06T10:00:00+09:00",
    "system_replay",
    "knowledge",
  );
}

function claim(recordId = "claim:writer:record:001") {
  return withClaimRecordHash({
    schemaVersion: 1,
    recordId,
    claimId: "claim:writer:fact",
    entityIds: ["entity:issuer:writer"],
    claimClass: "fact",
    statement: "The disclosed event changes the implementation schedule.",
    status: "active",
    informationCutoff: "2026-08-05T15:02:00+09:00",
    effectiveFrom: "2026-08-05T15:02:00+09:00",
    observedAt: "2026-08-05T15:03:00+09:00",
    retrievedAt: "2026-08-05T15:04:00+09:00",
    falsificationConditions: [],
    unknownRefs: [],
    modelVersion: "claim-model-v1",
    ruleVersion: "claim-graph-v1",
  });
}

function edge(recordId = "claim-edge:writer:record:001") {
  return withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId,
    edgeId: "claim-edge:writer:support",
    fromKind: "evidence",
    fromId: "evidence:writer:primary",
    toKind: "claim",
    toId: "claim:writer:fact",
    relationType: "supports",
    strength: "material",
    effectiveFrom: "2026-08-05T15:03:00+09:00",
    observedAt: "2026-08-05T15:03:00+09:00",
    retrievedAt: "2026-08-05T15:04:00+09:00",
    sourceEvidenceIds: ["evidence:writer:primary"],
  });
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-writer-"));
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
  };
  try {
    appendClaimGraphRecordsGoverned(
      paths,
      { claims: [claim()], edges: [edge()] },
      "claim-writer-owner",
      schemas,
      evidenceSnapshot(),
      knownEntityIds,
    );
    assert.equal(readFileSync(paths.claims, "utf-8").trim().split("\n").length, 1);
    assert.equal(readFileSync(paths.edges, "utf-8").trim().split("\n").length, 1);
    assert.equal(existsSync(`${paths.claims}.batch-journal.json`), false);
    assert.equal(existsSync(`${paths.claims}.claim-graph.lock`), false);

    const tampered = { ...claim("claim:writer:record:002"), contentHash: "0".repeat(64) };
    assert.throws(
      () => appendClaimGraphRecordsGoverned(
        paths,
        { claims: [tampered], edges: [] },
        "tampered-owner",
        schemas,
        evidenceSnapshot(),
        knownEntityIds,
      ),
      /invalid_claim_hash/,
    );
    assert.equal(existsSync(`${paths.claims}.claim-graph.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-hardening: append/fsync/lock cleanup OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-journal-"));
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
  };
  try {
    writeFileSync(
      `${paths.claims}.batch-journal.json`,
      `${JSON.stringify({ state: "claims_appended" })}\n`,
      "utf-8",
    );
    assert.throws(
      () => appendClaimGraphRecordsGoverned(
        paths,
        { claims: [claim()], edges: [edge()] },
        "journal-owner",
        schemas,
        evidenceSnapshot(),
        knownEntityIds,
      ),
      /incomplete_claim_graph_batch/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-hardening: incomplete journal fail-closed OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-cycle-writer-"));
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
  };
  const first = withClaimRecordHash({
    ...claim(),
    recordId: "claim-cycle-record-a",
    supersedesRecordId: "claim-cycle-record-b",
  });
  const second = withClaimRecordHash({
    ...claim(),
    recordId: "claim-cycle-record-b",
    informationCutoff: "2026-08-05T16:00:00+09:00",
    observedAt: "2026-08-05T16:01:00+09:00",
    retrievedAt: "2026-08-05T16:02:00+09:00",
    supersedesRecordId: "claim-cycle-record-a",
  });
  try {
    assert.throws(
      () => appendClaimGraphRecordsGoverned(
        paths,
        { claims: [first, second], edges: [] },
        "cycle-owner",
        schemas,
        evidenceSnapshot(),
        knownEntityIds,
      ),
      /claim_revision_cycle/,
    );
    assert.equal(existsSync(`${paths.claims}.claim-graph.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-hardening: batch revision cycle block OK");
}

console.log("claim-contradiction-graph-hardening: 全テスト成功");
