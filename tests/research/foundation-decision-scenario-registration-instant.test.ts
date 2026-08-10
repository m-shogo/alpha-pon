import assert from "node:assert/strict";
import {
  assessFoundationDecisionRecord,
  withFoundationDecisionHash,
  type FoundationDecisionContext,
  type FoundationDecisionIntegrationRecord,
} from "../../src/research/foundation-decision-integration.js";
import { hypothesisScenario } from "./testable-hypothesis-scenario-fixtures.js";

const hash = (character: string): string => character.repeat(64);

const futureScenario = hypothesisScenario("downside", {
  registeredAt: "2026-08-06T00:38:00.000000002+09:00",
});

const decision = withFoundationDecisionHash({
  schemaVersion: 1,
  decisionId: "decision:scenario-registration-fractional",
  candidateId: "candidate:scenario-registration-fractional",
  listedSecurityEntityId: "security:scenario-registration-fractional",
  issuedAt: "2026-08-06T00:38:00.000000001+09:00",
  informationCutoff: futureScenario.informationCutoff,
  firstExecutableAt: "2026-08-06T00:38:00.000000001+09:00",
  securityMasterSnapshotHash: hash("1"),
  evidenceSnapshotHash: hash("2"),
  claimGraphSnapshotHash: hash("3"),
  documentRevisionSnapshotHash: hash("4"),
  evidencePackageId: "evidence-package:missing",
  evidencePackageHash: futureScenario.evidencePackageHash,
  evidencePackageStatus: "complete",
  evidencePackageCompleteness: {
    securityResolved: true,
    normalizedEvidence: true,
    correctionChainComplete: true,
    claimGraphComplete: true,
    documentDiffReviewed: true,
    benchmarkComplete: true,
    priceSnapshotComplete: true,
    executionRouteComplete: true,
    licenseComplete: true,
    contradictionsReviewed: true,
  },
  hypothesisId: futureScenario.hypothesisId,
  hypothesisHash: hash("5"),
  scenarioSetId: "scenario-set:missing",
  scenarioSetHash: hash("6"),
  scenarios: {
    downside: { id: futureScenario.scenarioId, hash: futureScenario.contentHash },
    base: { id: "scenario:missing:base", hash: hash("7") },
    upside: { id: "scenario:missing:upside", hash: hash("8") },
    nullHypothesis: { id: "scenario:missing:null", hash: hash("9") },
  },
  replayId: "replay:missing",
  councilRunId: "council-run:missing",
  replayManifestHash: hash("a"),
  replayResultHash: hash("b"),
  calibrationHashes: [],
  priceSnapshots: {
    issuerPrice: { id: "price:missing:issuer", hash: hash("c") },
    issuerBenchmark: { id: "price:missing:issuer-benchmark", hash: hash("d") },
    topixBenchmark: { id: "price:missing:topix", hash: hash("e") },
    sectorBenchmark: { id: "price:missing:sector", hash: hash("f") },
  },
  status: "blocked",
  eligibleForRecommendationCandidate: false,
  blockers: [],
  automaticTradingAuthorized: false,
} satisfies Omit<FoundationDecisionIntegrationRecord, "contentHash">);

const context: FoundationDecisionContext = {
  evidencePackagesById: new Map(),
  activeEvidencePackageIds: new Set(),
  hypothesesById: new Map(),
  activeHypothesisIds: new Set(),
  scenariosById: new Map([[futureScenario.scenarioId, futureScenario]]),
  activeScenarioIds: new Set([futureScenario.scenarioId]),
  scenarioSetsById: new Map(),
  activeScenarioSetIds: new Set(),
  replayManifestsById: new Map(),
  replayResultsById: new Map(),
  calibrationsByHash: new Map(),
  activeCalibrationHashes: new Set(),
  priceSnapshotsById: new Map(),
};

const blockers = assessFoundationDecisionRecord(decision, context);
assert.ok(
  blockers.includes("scenario_registration_time_invalid:downside"),
  "同一millisecond内でもdecision issuedAtより1ns未来のScenario登録をfail-closedにする",
);

console.log("research/foundation-decision: scenario registration preserves sub-millisecond ordering OK");
