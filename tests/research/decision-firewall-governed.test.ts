import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendDecisionFirewallRecordsGovernedStrict,
  buildDecisionFirewallRecordGoverned,
  validateDecisionFirewallRecordGoverned,
} from "../../src/research/decision-firewall-governed.js";
import type {
  DecisionFirewallAssessmentInput,
  EvidenceReadiness,
  UnknownBudgetEntry,
} from "../../src/research/decision-firewall.js";
import {
  computeReplayResultHash,
  withReplayManifestHash,
  type CouncilReplayManifest,
  type CouncilReplayResult,
  type CouncilReplayResultInput,
} from "../../src/research/stock-pro-council-replay.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema("research/schemas/decision-firewall-record.schema.json");

function replayManifest(): CouncilReplayManifest {
  return withReplayManifestHash({
    schemaVersion: 1,
    replayId: "replay-governed-firewall-001",
    councilRunId: "council-run-governed-firewall-001",
    caseType: "general",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    createdAt: "2026-08-06T00:40:00+09:00",
    evidencePackageHash: "a".repeat(64),
    priceSnapshotHash: "b".repeat(64),
    codeVersion: "fixture-code-v1",
    ruleVersion: "council-firewall-v1",
    personaCatalogVersion: "2",
    requiredPersonaIds: [
      "valuation_expectations_analyst",
      "short_red_team",
      "portfolio_risk_allocator",
      "data_pit_auditor",
      "cio_synthesizer"
    ],
    verdictHashes: ["c".repeat(64)],
    dissentHashes: [],
    vetoHashes: [],
    calibrationHashes: [],
    automaticTradingAuthorized: false
  });
}

function replayResult(manifest: CouncilReplayManifest): CouncilReplayResult {
  const input: CouncilReplayResultInput = {
    schemaVersion: 1,
    replayId: manifest.replayId,
    councilRunId: manifest.councilRunId,
    caseType: manifest.caseType,
    informationCutoff: manifest.informationCutoff,
    eligibleForRecommendationCandidate: true,
    blockers: [],
    requiredPersonaIds: manifest.requiredPersonaIds,
    presentPersonaIds: manifest.requiredPersonaIds,
    missingPersonaIds: [],
    abstainingPersonaIds: [],
    vetoingPersonaIds: [],
    bindingVetoIds: [],
    dissentIds: [],
    manifestHash: manifest.contentHash,
    automaticTradingAuthorized: false
  };
  return { ...input, resultHash: computeReplayResultHash(input) };
}

const READY: EvidenceReadiness = {
  normalizedEvidence: true,
  claimGraph: true,
  falsifiableHypothesis: true,
  primarySources: true,
  contradictionsReviewed: true,
  correctionChainComplete: true,
  benchmarkComplete: true,
  executionRouteComplete: true,
  scenarioAssumptionsReproducible: true
};

const categories: UnknownBudgetEntry["category"][] = [
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
];

function unknownBudget(): UnknownBudgetEntry[] {
  return categories.map((category) => ({
    category,
    status: "known",
    severity: "informational",
    summary: `${category}を確認済み`,
    evidenceRefs: [`evidence:${category}:governed`]
  }));
}

function assessment(
  overrides: Partial<DecisionFirewallAssessmentInput> = {}
): DecisionFirewallAssessmentInput {
  return {
    schemaVersion: 1,
    firewallId: "firewall-governed-001",
    candidateId: "candidate-governed-001",
    createdAt: "2026-08-06T00:50:00+09:00",
    securityMasterVersion: "security-master-v1",
    evidenceStoreVersion: "evidence-store-v1",
    marketCalendarVersion: "jpx-calendar-v1",
    ruleVersion: "decision-firewall-v1",
    evidenceReadiness: READY,
    unknownBudget: unknownBudget(),
    portfolioSuitabilityStatus: "eligible",
    automaticTradingAuthorized: false,
    ...overrides
  };
}

{
  const manifest = replayManifest();
  const result = replayResult(manifest);
  const record = buildDecisionFirewallRecordGoverned(assessment(), manifest, result);
  assert.equal(record.stockRecommendationCandidateEligible, true);
  assert.equal(record.personalRecommendationCandidateEligible, true);
  assert.deepEqual(
    validateDecisionFirewallRecordGoverned(record, schema, manifest, result)
      .filter((issue) => issue.severity === "error"),
    []
  );
  console.log("decision-firewall-governed: valid strict record OK");
}

{
  const manifest = replayManifest();
  const result = replayResult(manifest);
  const entries = unknownBudget().map((entry) => entry.category === "license"
    ? {
      ...entry,
      status: "unknown" as const,
      severity: "informational" as const,
      summary: "licenseが未確認",
      evidenceRefs: []
    }
    : entry);
  assert.throws(
    () => buildDecisionFirewallRecordGoverned(
      assessment({ unknownBudget: entries }),
      manifest,
      result
    ),
    /unknown_not_marked_blocking/
  );
  console.log("decision-firewall-governed: informational unknown spoof block OK");
}

{
  const manifest = replayManifest();
  const result = replayResult(manifest);
  const tampered = { ...manifest, evidencePackageHash: "f".repeat(64) };
  assert.throws(
    () => buildDecisionFirewallRecordGoverned(assessment(), tampered, result),
    /invalid_replay_manifest_hash/
  );
  console.log("decision-firewall-governed: tampered manifest block OK");
}

{
  const manifest = replayManifest();
  const result = replayResult(manifest);
  const record = buildDecisionFirewallRecordGoverned(assessment(), manifest, result);
  const downgradedUnknown = {
    ...record,
    unknownBudget: record.unknownBudget.map((entry) => entry.category === "execution"
      ? {
        ...entry,
        status: "unknown" as const,
        severity: "informational" as const,
        summary: "executionが未確認",
        evidenceRefs: []
      }
      : entry)
  };
  assert.ok(validateDecisionFirewallRecordGoverned(
    downgradedUnknown,
    schema,
    manifest,
    result
  ).some((issue) => issue.code === "unknown_not_marked_blocking"));
  console.log("decision-firewall-governed: persisted unknown severity spoof detection OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "decision-firewall-governed-"));
  const path = join(dir, "records.jsonl");
  const manifest = replayManifest();
  const result = replayResult(manifest);
  const record = buildDecisionFirewallRecordGoverned(assessment(), manifest, result);
  const manifests = new Map([[manifest.contentHash, manifest]]);
  const results = new Map([[result.resultHash, result]]);
  try {
    appendDecisionFirewallRecordsGovernedStrict(
      path,
      [record],
      "strict-firewall-owner",
      schema,
      manifests,
      results
    );
    assert.throws(
      () => appendDecisionFirewallRecordsGovernedStrict(
        path,
        [{ ...record, firewallId: "firewall-governed-bad", contentHash: "0".repeat(64) }],
        "strict-firewall-bad-owner",
        schema,
        manifests,
        results
      ),
      /invalid_content_hash|duplicate_content_hash/
    );
    assert.equal(existsSync(`${path}.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("decision-firewall-governed: strict writer/lock cleanup OK");
}

console.log("decision-firewall-governed: 全テスト成功");
