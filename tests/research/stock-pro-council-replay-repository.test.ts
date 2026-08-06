import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateCouncilReplayRepository,
} from "../../src/research/stock-pro-council-replay-repository.js";
import {
  requiredPersonaIdsForCase,
  withReplayManifestHash,
} from "../../src/research/stock-pro-council-replay.js";

{
  const dir = mkdtempSync(join(tmpdir(), "council-replay-empty-"));
  try {
    const result = validateCouncilReplayRepository({
      manifestDir: join(dir, "missing-manifests"),
      verdictDir: join(dir, "missing-verdicts"),
      dissentPath: join(dir, "missing-dissent.jsonl"),
      vetoPath: join(dir, "missing-veto.jsonl"),
    });
    assert.equal(result.replayCount, 0);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-replay-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "council-replay-invalid-"));
  const manifestDir = join(dir, "manifests");
  try {
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(join(manifestDir, "invalid.json"), "{}\n", "utf-8");
    const result = validateCouncilReplayRepository({
      manifestDir,
      verdictDir: join(dir, "verdicts"),
      dissentPath: join(dir, "dissent.jsonl"),
      vetoPath: join(dir, "veto.jsonl"),
    });
    assert.ok(result.issues.some((issue) => issue.code === "schema_violation"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-replay-repository: invalid manifest schema block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "council-replay-unresolved-"));
  const manifestDir = join(dir, "manifests");
  try {
    mkdirSync(manifestDir, { recursive: true });
    const manifest = withReplayManifestHash({
      schemaVersion: 1,
      replayId: "replay-unresolved-001",
      councilRunId: "council-run-unresolved",
      caseType: "general",
      informationCutoff: "2026-08-06T00:25:00+09:00",
      createdAt: "2026-08-06T01:00:00+09:00",
      evidencePackageHash: "a".repeat(64),
      priceSnapshotHash: "b".repeat(64),
      codeVersion: "fixture-code-v1",
      ruleVersion: "council-firewall-v1",
      personaCatalogVersion: "2",
      requiredPersonaIds: requiredPersonaIdsForCase("general"),
      verdictHashes: ["c".repeat(64)],
      dissentHashes: [],
      vetoHashes: [],
      automaticTradingAuthorized: false,
    });
    writeFileSync(
      join(manifestDir, "unresolved.json"),
      `${JSON.stringify(manifest)}\n`,
      "utf-8",
    );
    const result = validateCouncilReplayRepository({
      manifestDir,
      verdictDir: join(dir, "verdicts"),
      dissentPath: join(dir, "dissent.jsonl"),
      vetoPath: join(dir, "veto.jsonl"),
    });
    assert.equal(result.replayCount, 1);
    assert.ok(result.issues.some((issue) => issue.code === "verdict_hash_set_mismatch"));
    assert.equal(result.results.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-replay-repository: unresolved hash block OK");
}

console.log("stock-pro-council-replay-repository: 全テスト成功");
