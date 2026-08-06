import assert from "node:assert/strict";
import {
  computeGovernedClaimGraphSnapshotHash,
  validateGovernedClaimGraphSnapshot,
} from "../../src/research/claim-contradiction-graph-snapshot.js";
import type {
  GovernedClaimGraphSnapshot,
} from "../../src/research/claim-contradiction-graph-hardening.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema(
  "research/schemas/claim-graph-snapshot.schema.json",
);

function snapshot(
  overrides: Partial<Omit<GovernedClaimGraphSnapshot, "contentHash">> = {},
): GovernedClaimGraphSnapshot {
  const input: Omit<GovernedClaimGraphSnapshot, "contentHash"> = {
    asOf: "2026-08-06T10:00:00+09:00",
    mode: "system_replay",
    claimSnapshotHash: "a".repeat(64),
    evidenceSnapshotHash: "b".repeat(64),
    claimIds: ["claim:snapshot:a", "claim:snapshot:b"],
    edgeIds: ["claim-edge:snapshot:a", "claim-edge:snapshot:b"],
    evidenceIds: ["evidence:snapshot:a", "evidence:snapshot:b"],
    ...overrides,
  };
  return {
    ...input,
    contentHash: computeGovernedClaimGraphSnapshotHash(input),
  };
}

{
  const valid = snapshot();
  assert.deepEqual(validateGovernedClaimGraphSnapshot(valid, schema), []);
  assert.equal(
    computeGovernedClaimGraphSnapshotHash(valid),
    valid.contentHash,
  );
  console.log("claim-contradiction-graph-snapshot: valid deterministic hash OK");
}

{
  const valid = snapshot();
  const tampered = {
    ...valid,
    evidenceSnapshotHash: "c".repeat(64),
  };
  assert.ok(validateGovernedClaimGraphSnapshot(tampered, schema)
    .some((item) => item.code === "invalid_claim_snapshot_hash"));
  console.log("claim-contradiction-graph-snapshot: tamper block OK");
}

{
  const unsorted = snapshot({
    claimIds: ["claim:snapshot:b", "claim:snapshot:a"],
  });
  assert.ok(validateGovernedClaimGraphSnapshot(unsorted, schema)
    .some((item) =>
      item.code === "non_canonical_claim_snapshot_array" &&
      item.target === "claimIds",
    ));
  console.log("claim-contradiction-graph-snapshot: non-canonical ordering block OK");
}

{
  const duplicatedInput: Omit<GovernedClaimGraphSnapshot, "contentHash"> = {
    asOf: "2026-08-06T10:00:00+09:00",
    mode: "system_replay",
    claimSnapshotHash: "a".repeat(64),
    evidenceSnapshotHash: "b".repeat(64),
    claimIds: ["claim:snapshot:a", "claim:snapshot:a"],
    edgeIds: [],
    evidenceIds: [],
  };
  const duplicated: GovernedClaimGraphSnapshot = {
    ...duplicatedInput,
    contentHash: computeGovernedClaimGraphSnapshotHash(duplicatedInput),
  };
  assert.ok(validateGovernedClaimGraphSnapshot(duplicated, schema)
    .some((item) => item.code === "schema_violation"));
  console.log("claim-contradiction-graph-snapshot: duplicate ID block OK");
}

console.log("claim-contradiction-graph-snapshot: 全テスト成功");
