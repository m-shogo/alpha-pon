import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateGovernedDecisionFirewallRepository,
} from "../../src/research/decision-firewall-governed-repository.js";

{
  const dir = mkdtempSync(join(tmpdir(), "governed-firewall-empty-"));
  try {
    const result = validateGovernedDecisionFirewallRepository({
      recordsPath: join(dir, "missing-records.jsonl"),
      replayManifestDir: join(dir, "missing-replays"),
      verdictDir: join(dir, "missing-verdicts"),
      dissentPath: join(dir, "missing-dissent.jsonl"),
      vetoPath: join(dir, "missing-veto.jsonl"),
      calibrationDir: join(dir, "missing-calibrations")
    });
    assert.equal(result.recordCount, 0);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("decision-firewall-governed-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "governed-firewall-spoof-"));
  const replayDir = join(dir, "replays");
  const recordsPath = join(dir, "records.jsonl");
  try {
    mkdirSync(replayDir, { recursive: true });
    const record = {
      schemaVersion: 1,
      firewallId: "firewall-spoof-001",
      candidateId: "candidate-spoof-001",
      replayId: "replay-spoof-001",
      councilRunId: "council-run-spoof-001",
      createdAt: "2026-08-06T01:00:00+09:00",
      informationCutoff: "2026-08-06T00:25:00+09:00",
      replayManifestHash: "a".repeat(64),
      replayResultHash: "b".repeat(64),
      evidencePackageHash: "c".repeat(64),
      priceSnapshotHash: "d".repeat(64),
      securityMasterVersion: "security-master-v1",
      evidenceStoreVersion: "evidence-store-v1",
      marketCalendarVersion: "jpx-calendar-v1",
      ruleVersion: "decision-firewall-v1",
      evidenceReadiness: {
        normalizedEvidence: true,
        claimGraph: true,
        falsifiableHypothesis: true,
        primarySources: true,
        contradictionsReviewed: true,
        correctionChainComplete: true,
        benchmarkComplete: true,
        executionRouteComplete: true,
        scenarioAssumptionsReproducible: true
      },
      unknownBudget: [
        "entity",
        "time",
        "license",
        "source",
        "evidence_gap",
        "execution",
        "confounder",
        "counterfactual",
        "valuation",
        "liquidity",
        "portfolio_exposure"
      ].map((category) => ({
        category,
        status: category === "license" ? "unknown" : "known",
        severity: "informational",
        summary: `${category} status`,
        evidenceRefs: category === "license" ? [] : [`evidence:${category}:spoof`]
      })),
      bindingVetoIds: [],
      stockRecommendationCandidateEligible: true,
      personalRecommendationCandidateEligible: true,
      portfolioSuitabilityStatus: "eligible",
      blockers: [],
      automaticTradingAuthorized: false,
      contentHash: "e".repeat(64)
    };
    writeFileSync(recordsPath, `${JSON.stringify(record)}\n`, "utf-8");
    const result = validateGovernedDecisionFirewallRepository({
      recordsPath,
      replayManifestDir: replayDir,
      verdictDir: join(dir, "verdicts"),
      dissentPath: join(dir, "dissent.jsonl"),
      vetoPath: join(dir, "veto.jsonl"),
      calibrationDir: join(dir, "calibrations"),
      includeReplayIssues: false
    });
    assert.ok(result.issues.some((issue) => issue.code === "missing_firewall_replay_input"));
    assert.equal(result.stockEligibleHeadCount, 1, "stored flag is reported but validation still fails closed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("decision-firewall-governed-repository: unresolved strict record block OK");
}

console.log("decision-firewall-governed-repository: 全テスト成功");
