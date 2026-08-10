import assert from "node:assert/strict";
import {
  assessFoundationDecisionRecord,
  withFoundationDecisionHash,
  type FoundationDecisionContext,
  type FoundationDecisionIntegrationRecord,
} from "../../src/research/foundation-decision-integration.js";
import { testableHypothesis } from "./testable-hypothesis-scenario-fixtures.js";

const hash = (character: string): string => character.repeat(64);

const futureHypothesis = testableHypothesis({
  registeredAt: "2026-08-06T00:36:00.000000002+09:00",
});

const decision = withFoundationDecisionHash({
  schemaVersion: 1,
  decisionId: "decision:hypothesis-registration-fractional",
  candidateId: futureHypothesis.candidateId,
  listedSecurityEntityId: futureHypothesis.listedSecurityEntityId,
  issuedAt: "2026-08-06T00:36:00.000000001+09:00",
  informationCutoff: futureHypothesis.informationCutoff,
  firstExecutableAt: "2026-08-06T00:36:00.000000001+09:00",
  securityMasterSnapshotHash: hash("1"),
  evidenceSnapshotHash: hash("2"),
  claimGraphSnapshotHash: hash("3"),
  documentRevisionSnapshotHash: hash("4"),
  evidencePackageId: futureHypothesis.evidencePackageId,
  evidencePackageHash: futureHypothesis.evidencePackageHash,
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
  hypothesisId: futureHypothesis.hypothesisId,
  hypothesisHash: futureHypothesis.contentHash,
  scenarioSetId: "scenario-set:missing",
  scenarioSetHash: hash("5"),
  scenarios: {
    downside: { id: "scenario:missing:downside", hash: hash("6") },
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
  hypothesesById: new Map([[futureHypothesis.hypothesisId, futureHypothesis]]),
  activeHypothesisIds: new Set([futureHypothesis.hypothesisId]),
  scenariosById: new Map(),
  activeScenarioIds: new Set(),
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
  blockers.includes("hypothesis_registration_time_invalid"),
  "同一millisecond内でもdecision issuedAtより1ns未来のHypothesis登録をfail-closedにする",
);

console.log("research/foundation-decision: hypothesis registration preserves sub-millisecond ordering OK");
