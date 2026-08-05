import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendDecisionFirewallRecordsGoverned,
  validateDecisionFirewallLifecycle,
} from "../../src/research/decision-firewall-hardening.js";
import {
  buildDecisionFirewallRecord,
  type DecisionFirewallAssessmentInput,
  type EvidenceReadiness,
  type UnknownBudgetEntry,
} from "../../src/research/decision-firewall.js";
import {
  computeReplayResultHash,
  withReplayManifestHash,
  type CouncilReplayResult,
  type CouncilReplayResultInput,
} from "../../src/research/stock-pro-council-replay.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema("research/schemas/decision-firewall-record.schema.json");
const replayManifest = withReplayManifestHash({
  schemaVersion: 1,
  replayId: "replay-firewall-hardening",
  councilRunId: "council-run-firewall-hardening",
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
    "cio_synthesizer",
  ],
  verdictHashes: ["c".repeat(64)],
  dissentHashes: [],
  vetoHashes: [],
  calibrationHashes: [],
  automaticTradingAuthorized: false,
});
const replayInput: CouncilReplayResultInput = {
  schemaVersion: 1,
  replayId: replayManifest.replayId,
  councilRunId: replayManifest.councilRunId,
  caseType: replayManifest.caseType,
  informationCutoff: replayManifest.informationCutoff,
  eligibleForRecommendationCandidate: true,
  blockers: [],
  requiredPersonaIds: replayManifest.requiredPersonaIds,
  presentPersonaIds: replayManifest.requiredPersonaIds,
  missingPersonaIds: [],
  abstainingPersonaIds: [],
  vetoingPersonaIds: [],
  bindingVetoIds: [],
  dissentIds: [],
  manifestHash: replayManifest.contentHash,
  automaticTradingAuthorized: false,
};
const replayResult: CouncilReplayResult = {
  ...replayInput,
  resultHash: computeReplayResultHash(replayInput),
};

const READY: EvidenceReadiness = {
  normalizedEvidence: true,
  claimGraph: true,
  falsifiableHypothesis: true,
  primarySources: true,
  contradictionsReviewed: true,
  correctionChainComplete: true,
  benchmarkComplete: true,
  executionRouteComplete: true,
  scenarioAssumptionsReproducible: true,
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
  "portfolio_exposure",
];

function assessment(
  overrides: Partial<DecisionFirewallAssessmentInput> = {},
): DecisionFirewallAssessmentInput {
  return {
    schemaVersion: 1,
    firewallId: "firewall-hardening-001",
    candidateId: "candidate-hardening-001",
    createdAt: "2026-08-06T00:50:00+09:00",
    securityMasterVersion: "security-master-v1",
    evidenceStoreVersion: "evidence-store-v1",
    marketCalendarVersion: "jpx-calendar-v1",
    ruleVersion: "decision-firewall-v1",
    evidenceReadiness: READY,
    unknownBudget: categories.map((category) => ({
      category,
      status: "known",
      severity: "informational",
      summary: `${category}確認済み`,
      evidenceRefs: [`evidence:${category}:hardening`],
    })),
    portfolioSuitabilityStatus: "eligible",
    automaticTradingAuthorized: false,
    ...overrides,
  };
}

{
  const self = buildDecisionFirewallRecord(assessment({
    supersedesFirewallId: "firewall-hardening-001",
  }), replayManifest, replayResult);
  assert.ok(validateDecisionFirewallLifecycle([self])
    .some((issue) => issue.code === "firewall_self_supersession"));

  const first = buildDecisionFirewallRecord(assessment({
    firewallId: "firewall-cycle-a",
    supersedesFirewallId: "firewall-cycle-b",
  }), replayManifest, replayResult);
  const second = buildDecisionFirewallRecord(assessment({
    firewallId: "firewall-cycle-b",
    createdAt: "2026-08-06T01:00:00+09:00",
    supersedesFirewallId: "firewall-cycle-a",
  }), replayManifest, replayResult);
  assert.ok(validateDecisionFirewallLifecycle([first, second])
    .some((issue) => issue.code === "firewall_revision_cycle"));
  console.log("decision-firewall-hardening: self/cycle guards OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "decision-firewall-hardening-"));
  const path = join(dir, "records.jsonl");
  const record = buildDecisionFirewallRecord(assessment(), replayManifest, replayResult);
  const manifests = new Map([[replayManifest.contentHash, replayManifest]]);
  const results = new Map([[replayResult.resultHash, replayResult]]);
  try {
    appendDecisionFirewallRecordsGoverned(
      path,
      [record],
      "governed-firewall-owner",
      schema,
      manifests,
      results,
    );
    assert.throws(
      () => appendDecisionFirewallRecordsGoverned(
        path,
        [{ ...record, firewallId: "firewall-hardening-bad", contentHash: "0".repeat(64) }],
        "bad-firewall-owner",
        schema,
        manifests,
        results,
      ),
      /invalid_content_hash|duplicate_content_hash/,
    );
    assert.equal(existsSync(`${path}.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("decision-firewall-hardening: governed writer/lock cleanup OK");
}

console.log("decision-firewall-hardening: 全テスト成功");
