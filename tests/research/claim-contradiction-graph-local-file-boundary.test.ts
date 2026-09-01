import assert from "node:assert/strict";
import {
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  withClaimRecordHash,
  type ClaimGraphSchemas,
} from "../../src/research/claim-contradiction-graph.js";
import { appendClaimGraphRecordsAtCutoffGoverned } from "../../src/research/claim-contradiction-graph-writer.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: ClaimGraphSchemas = {
  claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
  edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
};
const knownEntityIds = new Set(["entity:issuer:claim-local-boundary"]);
const evidence = withEvidenceRecordHash({
  schemaVersion: 1,
  recordId: "evidence:claim-local-boundary:record:001",
  evidenceId: "evidence:claim-local-boundary",
  entityIds: ["entity:issuer:claim-local-boundary"],
  sourceId: "source:claim-local-boundary:ir",
  sourceType: "company_ir",
  sourceLocator: "source:claim-local-boundary",
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
  title: "Claim local boundary evidence",
  summary: "Synthetic claim graph local boundary regression.",
  retrievalRunId: "retrieval-run-claim-local-boundary",
  parserVersion: "parser-v1",
});
const snapshot = buildEvidenceSnapshot(
  [evidence],
  [],
  "2026-08-06T10:00:00+09:00",
  "system_replay",
  "knowledge",
);
const claim = withClaimRecordHash({
  schemaVersion: 1,
  recordId: "claim:local-boundary:record:001",
  claimId: "claim:local-boundary",
  entityIds: ["entity:issuer:claim-local-boundary"],
  claimClass: "fact",
  statement: "Synthetic local boundary claim.",
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

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-symlink-"));
  const target = join(dir, "outside.jsonl");
  const paths = { claims: join(dir, "claims.jsonl"), edges: join(dir, "edges.jsonl") };
  writeFileSync(target, "sentinel\n", "utf-8");
  symlinkSync(target, paths.claims);
  try {
    assert.throws(
      () => appendClaimGraphRecordsAtCutoffGoverned(
        paths,
        { claims: [claim], edges: [] },
        "claim-symlink-owner",
        schemas,
        snapshot,
        knownEntityIds,
      ),
      /single-link regular file/,
    );
    assert.equal(readFileSync(target, "utf-8"), "sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim graph store: symlink path rejected without modifying target OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-hardlink-"));
  const target = join(dir, "outside.jsonl");
  const paths = { claims: join(dir, "claims.jsonl"), edges: join(dir, "edges.jsonl") };
  writeFileSync(target, "sentinel\n", "utf-8");
  linkSync(target, paths.edges);
  try {
    assert.throws(
      () => appendClaimGraphRecordsAtCutoffGoverned(
        paths,
        { claims: [claim], edges: [] },
        "claim-hardlink-owner",
        schemas,
        snapshot,
        knownEntityIds,
      ),
      /single-link regular file/,
    );
    assert.equal(readFileSync(target, "utf-8"), "sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim graph store: hard-link path rejected without modifying target OK");
}

console.log("claim-contradiction-graph-local-file-boundary: all tests passed");
