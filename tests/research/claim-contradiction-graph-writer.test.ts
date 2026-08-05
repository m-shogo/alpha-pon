import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
  type ClaimGraphSchemas,
} from "../../src/research/claim-contradiction-graph.js";
import {
  appendClaimGraphRecordsAtCutoffGoverned,
} from "../../src/research/claim-contradiction-graph-writer.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: ClaimGraphSchemas = {
  claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
  edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
};
const knownEntityIds = new Set(["entity:issuer:writer-v2"]);
const evidence = withEvidenceRecordHash({
  schemaVersion: 1,
  recordId: "evidence:writer-v2:record:001",
  evidenceId: "evidence:writer-v2:primary",
  entityIds: ["entity:issuer:writer-v2"],
  sourceId: "source:writer-v2:ir",
  sourceType: "company_ir",
  sourceLocator: "https://example.com/writer-v2/ir",
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
  title: "Writer v2 disclosure",
  summary: "Primary evidence for authoritative writer.",
  retrievalRunId: "retrieval-run-writer-v2",
  parserVersion: "parser-v1",
});
const evidenceSnapshot = buildEvidenceSnapshot(
  [evidence],
  [],
  "2026-08-06T10:00:00+09:00",
  "system_replay",
  "knowledge",
);

function claim() {
  return withClaimRecordHash({
    schemaVersion: 1,
    recordId: "claim:writer-v2:record:001",
    claimId: "claim:writer-v2:fact",
    entityIds: ["entity:issuer:writer-v2"],
    claimClass: "fact",
    statement: "The implementation milestone changed.",
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

function edge(observedAt = "2026-08-05T15:05:00+09:00") {
  return withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: "claim-edge:writer-v2:record:001",
    edgeId: "claim-edge:writer-v2:support",
    fromKind: "evidence",
    fromId: evidence.evidenceId,
    toKind: "claim",
    toId: "claim:writer-v2:fact",
    relationType: "supports",
    strength: "material",
    effectiveFrom: observedAt,
    observedAt,
    retrievedAt: observedAt,
    sourceEvidenceIds: [evidence.evidenceId],
  });
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-writer-authoritative-"));
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
  };
  try {
    appendClaimGraphRecordsAtCutoffGoverned(
      paths,
      { claims: [claim()], edges: [] },
      "authoritative-claim-owner",
      schemas,
      evidenceSnapshot,
      knownEntityIds,
    );
    appendClaimGraphRecordsAtCutoffGoverned(
      paths,
      { claims: [], edges: [edge()] },
      "authoritative-edge-owner",
      schemas,
      evidenceSnapshot,
      knownEntityIds,
    );
    assert.equal(readFileSync(paths.claims, "utf-8").trim().split("\n").length, 1);
    assert.equal(readFileSync(paths.edges, "utf-8").trim().split("\n").length, 1);
    assert.equal(existsSync(`${paths.claims}.batch-journal.json`), false);
    assert.equal(existsSync(`${paths.claims}.claim-graph.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-writer: edge-only append against existing claim OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-writer-future-"));
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
  };
  const future = withClaimRecordHash({
    ...claim(),
    recordId: "claim:writer-v2:future:record:001",
    claimId: "claim:writer-v2:future",
    informationCutoff: "2026-08-06T11:00:00+09:00",
    effectiveFrom: "2026-08-06T11:00:00+09:00",
    observedAt: "2026-08-06T11:01:00+09:00",
    retrievedAt: "2026-08-06T11:02:00+09:00",
  });
  try {
    assert.throws(
      () => appendClaimGraphRecordsAtCutoffGoverned(
        paths,
        { claims: [future], edges: [] },
        "future-owner",
        schemas,
        evidenceSnapshot,
        knownEntityIds,
      ),
      /incoming_claim_after_snapshot_cutoff/,
    );
    assert.equal(existsSync(`${paths.claims}.claim-graph.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-writer: future record blocked and lock released OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-writer-chronology-"));
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
  };
  try {
    assert.throws(
      () => appendClaimGraphRecordsAtCutoffGoverned(
        paths,
        {
          claims: [claim()],
          edges: [edge("2026-08-05T15:02:30+09:00")],
        },
        "chronology-owner",
        schemas,
        evidenceSnapshot,
        knownEntityIds,
      ),
      /claim_edge_observed_before_claim_endpoint/,
    );
    assert.equal(existsSync(`${paths.claims}.claim-graph.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-writer: endpoint chronology blocked OK");
}

console.log("claim-contradiction-graph-writer: 全テスト成功");
