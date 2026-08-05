import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendDecisionFirewallRecords,
  buildDecisionFirewallRecord,
  validateDecisionFirewallLedger,
  validateDecisionFirewallRecord,
  type DecisionFirewallAssessmentInput,
  type EvidenceReadiness,
  type UnknownBudgetEntry,
} from "../../src/research/decision-firewall.js";
import {
  computeReplayResultHash,
  withReplayManifestHash,
  type CouncilReplayManifest,
  type CouncilReplayResult,
  type CouncilReplayResultInput,
} from "../../src/research/stock-pro-council-replay.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema(
  "research/schemas/decision-firewall-record.schema.json",
);

function manifest(): CouncilReplayManifest {
  return withReplayManifestHash({
    schemaVersion: 1,
    replayId: "replay-firewall-001",
    councilRunId: "council-run-firewall-001",
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
}

function replayResult(
  replayManifest: CouncilReplayManifest,
  overrides: Partial<CouncilReplayResultInput> = {},
): CouncilReplayResult {
  const input: CouncilReplayResultInput = {
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
    ...overrides,
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
  scenarioAssumptionsReproducible: true,
};

function unknownBudget(
  overrides: Partial<Record<UnknownBudgetEntry["category"], Partial<UnknownBudgetEntry>>> = {},
): UnknownBudgetEntry[] {
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
  return categories.map((category) => ({
    category,
    status: "known",
    severity: "informational",
    summary: `${category}を確認済み`,
    evidenceRefs: [`evidence:${category}:001`],
    ...overrides[category],
  }));
}

function input(
  overrides: Partial<DecisionFirewallAssessmentInput> = {},
): DecisionFirewallAssessmentInput {
  return {
    schemaVersion: 1,
    firewallId: "firewall-001",
    candidateId: "candidate-001",
    createdAt: "2026-08-06T00:50:00+09:00",
    securityMasterVersion: "security-master-v1",
    evidenceStoreVersion: "evidence-store-v1",
    marketCalendarVersion: "jpx-calendar-v1",
    ruleVersion: "decision-firewall-v1",
    evidenceReadiness: READY,
    unknownBudget: unknownBudget(),
    portfolioSuitabilityStatus: "not_assessed",
    automaticTradingAuthorized: false,
    ...overrides,
  };
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const record = buildDecisionFirewallRecord(input(), replayManifest, result);
  assert.equal(record.stockRecommendationCandidateEligible, true);
  assert.equal(record.personalRecommendationCandidateEligible, false);
  assert.ok(record.blockers.includes("portfolio_suitability:not_assessed"));
  assert.deepEqual(
    validateDecisionFirewallRecord(record, schema, replayManifest, result)
      .filter((issue) => issue.severity === "error"),
    [],
  );
  console.log("decision-firewall: stock thesis and personal suitability separation OK");
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const record = buildDecisionFirewallRecord(input({
    portfolioSuitabilityStatus: "eligible",
  }), replayManifest, result);
  assert.equal(record.stockRecommendationCandidateEligible, true);
  assert.equal(record.personalRecommendationCandidateEligible, true);
  assert.deepEqual(record.blockers, []);
  console.log("decision-firewall: fully eligible candidate OK");
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const record = buildDecisionFirewallRecord(input({
    unknownBudget: unknownBudget({
      license: {
        status: "unknown",
        severity: "blocking",
        summary: "license境界が未確認",
        evidenceRefs: [],
      },
    }),
    portfolioSuitabilityStatus: "eligible",
  }), replayManifest, result);
  assert.equal(record.stockRecommendationCandidateEligible, false);
  assert.equal(record.personalRecommendationCandidateEligible, false);
  assert.ok(record.blockers.includes("unknown_blocking:license"));
  console.log("decision-firewall: blocking license unknown OK");
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const record = buildDecisionFirewallRecord(input({
    evidenceReadiness: { ...READY, executionRouteComplete: false },
    portfolioSuitabilityStatus: "eligible",
  }), replayManifest, result);
  assert.equal(record.stockRecommendationCandidateEligible, false);
  assert.ok(record.blockers.includes("evidence_not_ready:executionRouteComplete"));
  console.log("decision-firewall: incomplete execution route block OK");
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest, {
    eligibleForRecommendationCandidate: false,
    blockers: ["binding_veto:veto-pit-001"],
    vetoingPersonaIds: ["data_pit_auditor"],
    bindingVetoIds: ["veto-pit-001"],
  });
  const record = buildDecisionFirewallRecord(input({
    portfolioSuitabilityStatus: "eligible",
  }), replayManifest, result);
  assert.equal(record.stockRecommendationCandidateEligible, false);
  assert.ok(record.blockers.includes("binding_veto:veto-pit-001"));
  assert.ok(record.blockers.includes("replay:binding_veto:veto-pit-001"));
  console.log("decision-firewall: replay PIT veto block OK");
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const record = buildDecisionFirewallRecord(input(), replayManifest, result);
  const missingCategory = {
    ...record,
    unknownBudget: record.unknownBudget.filter((entry) => entry.category !== "entity"),
  };
  assert.ok(validateDecisionFirewallRecord(
    missingCategory,
    schema,
    replayManifest,
    result,
  ).some((issue) =>
    issue.code === "schema_violation" || issue.code === "unknown_budget_category_mismatch",
  ));

  const tampered = { ...record, blockers: [] };
  assert.ok(validateDecisionFirewallRecord(tampered, schema, replayManifest, result)
    .some((issue) => issue.code === "invalid_content_hash" || issue.code === "firewall_blocker_set_mismatch"));
  console.log("decision-firewall: unknown budget/hash tamper guards OK");
}

{
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const first = buildDecisionFirewallRecord(input(), replayManifest, result);
  const second = buildDecisionFirewallRecord(input({
    firewallId: "firewall-002",
    createdAt: "2026-08-06T01:10:00+09:00",
    portfolioSuitabilityStatus: "eligible",
    supersedesFirewallId: first.firewallId,
  }), replayManifest, result);
  const manifests = new Map([[replayManifest.contentHash, replayManifest]]);
  const results = new Map([[result.resultHash, result]]);
  assert.deepEqual(
    validateDecisionFirewallLedger([first, second], schema, manifests, results)
      .filter((issue) => issue.severity === "error"),
    [],
  );

  const parallelHead = buildDecisionFirewallRecord(input({
    firewallId: "firewall-003",
    createdAt: "2026-08-06T01:20:00+09:00",
  }), replayManifest, result);
  assert.ok(validateDecisionFirewallLedger(
    [first, parallelHead],
    schema,
    manifests,
    results,
  ).some((issue) => issue.code === "multiple_firewall_heads"));
  console.log("decision-firewall: append-only revision/head guards OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "decision-firewall-"));
  const path = join(dir, "records.jsonl");
  const replayManifest = manifest();
  const result = replayResult(replayManifest);
  const record = buildDecisionFirewallRecord(input(), replayManifest, result);
  const manifests = new Map([[replayManifest.contentHash, replayManifest]]);
  const results = new Map([[result.resultHash, result]]);
  try {
    appendDecisionFirewallRecords(
      path,
      [record],
      "firewall-owner",
      schema,
      manifests,
      results,
    );
    assert.equal(readFileSync(path, "utf-8").trim().split("\n").length, 1);
    assert.throws(
      () => appendDecisionFirewallRecords(
        path,
        [{ ...record, firewallId: "firewall-bad", contentHash: "0".repeat(64) }],
        "bad-owner",
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
  console.log("decision-firewall: single-writer append/fsync guards OK");
}

console.log("decision-firewall: 全テスト成功");
