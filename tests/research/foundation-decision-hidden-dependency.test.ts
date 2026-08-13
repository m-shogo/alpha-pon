import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFoundationDecisionRepository } from "../../src/research/foundation-decision-integration-repository.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-foundation-hidden-dependency-"));
const decisionsPath = join(root, "decisions.jsonl");
const priceSnapshotsPath = join(root, "price-snapshots.jsonl");
const replayManifestDir = join(root, "replay-manifests");

try {
  mkdirSync(replayManifestDir, { recursive: true });
  writeFileSync(decisionsPath, "", "utf-8");
  writeFileSync(priceSnapshotsPath, "", "utf-8");
  writeFileSync(join(replayManifestDir, "broken.json"), "{not-json}\n", "utf-8");

  const result = validateFoundationDecisionRepository({
    decisionsPath,
    priceSnapshotsPath,
    replayManifestDir,
    includeDependencyIssues: false,
  });

  assert.ok(
    result.issues.some((item) => item.code === "foundation_decision_dependency_invalid"),
    "dependency detail suppression must not turn an invalid Foundation dependency graph into a clean validation result",
  );
  assert.ok(
    !result.issues.some((item) => item.code === "invalid_replay_manifest_json"),
    "includeDependencyIssues=false remains reporting-only and suppresses detailed dependency errors",
  );
  assert.equal(result.eligibleDecisionHeadCount, 0);

  console.log("research/foundation-decision hidden dependency: fail-closed summary OK");
} finally {
  rmSync(root, { recursive: true, force: true });
}
