import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FOUNDATION_DECISION_PATHS,
  assessFoundationDecisionRecord,
  validateFoundationDecisionRecord,
  validateFoundationPriceSnapshotRecord,
  withFoundationDecisionHash,
  withFoundationPriceSnapshotHash,
  type FoundationDecisionContext,
  type FoundationDecisionIntegrationRecord,
} from "../../src/research/foundation-decision-integration.js";
import { validateFoundationDecisionRepository } from "../../src/research/foundation-decision-integration-repository.js";
import type { JsonSchema } from "../../src/research/schema.js";

const decisionSchema = JSON.parse(
  readFileSync(FOUNDATION_DECISION_PATHS.recordSchema, "utf-8"),
) as JsonSchema;
const priceSchema = JSON.parse(
  readFileSync(FOUNDATION_DECISION_PATHS.priceSchema, "utf-8"),
) as JsonSchema;
const hash = (character: string): string => character.repeat(64);

const emptyContext: FoundationDecisionContext = {
  evidencePackagesById: new Map(),
  activeEvidencePackageIds: new Set(),
  hypothesesById: new Map(),
  activeHypothesisIds: new Set(),
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

const price = withFoundationPriceSnapshotHash({
  schemaVersion: 1,
  snapshotId: "price-issuer-1",
  candidateId: "candidate-sanrio",
  listedSecurityEntityId: "security-8136",
  role: "issuer_price",
  instrumentId: "8136-TSE",
  providerId: "synthetic-provider",
  providerRecordId: "synthetic-record-1",
  tradingDate: "2026-08-06",
  informationCutoff: "2026-08-06T06:00:00.000Z",
  observedAt: "2026-08-06T05:59:00.000Z",
  firstExecutableAt: "2026-08-06T06:00:00.000Z",
  value: 100,
  currency: "JPY",
  adjustmentStatus: "raw",
  licenseClass: "local_only",
  rawPayloadHash: hash("a"),
});
assert.deepEqual(validateFoundationPriceSnapshotRecord(price, priceSchema), []);

const futurePrice = {
  ...price,
  observedAt: "2026-08-06T06:01:00.000Z",
};
const futureIssues = validateFoundationPriceSnapshotRecord(futurePrice, priceSchema);
assert.ok(futureIssues.some((item) => item.code === "invalid_price_snapshot_hash"));
assert.ok(futureIssues.some((item) => item.code === "future_price_observation"));

const completeness = {
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
};

const baseDecision: Omit<FoundationDecisionIntegrationRecord, "contentHash"> = {
  schemaVersion: 1,
  decisionId: "decision-1",
  candidateId: "candidate-sanrio",
  listedSecurityEntityId: "security-8136",
  issuedAt: "2026-08-06T06:05:00.000Z",
  informationCutoff: "2026-08-06T06:00:00.000Z",
  firstExecutableAt: "2026-08-06T06:00:00.000Z",
  securityMasterSnapshotHash: hash("1"),
  evidenceSnapshotHash: hash("2"),
  claimGraphSnapshotHash: hash("3"),
  documentRevisionSnapshotHash: hash("4"),
  evidencePackageId: "package-1",
  evidencePackageHash: hash("5"),
  evidencePackageStatus: "complete",
  evidencePackageCompleteness: completeness,
  hypothesisId: "hypothesis-1",
  hypothesisHash: hash("6"),
  scenarioSetId: "scenario-set-1",
  scenarioSetHash: hash("7"),
  scenarios: {
    downside: { id: "scenario-downside", hash: hash("8") },
    base: { id: "scenario-base", hash: hash("9") },
    upside: { id: "scenario-upside", hash: hash("a") },
    nullHypothesis: { id: "scenario-null", hash: hash("b") },
  },
  replayId: "replay-1",
  councilRunId: "council-run-1",
  replayManifestHash: hash("c"),
  replayResultHash: hash("d"),
  calibrationHashes: [hash("e")],
  priceSnapshots: {
    issuerPrice: { id: "price-issuer-1", hash: hash("f") },
    issuerBenchmark: { id: "price-issuer-benchmark", hash: hash("0") },
    topixBenchmark: { id: "price-topix", hash: hash("1") },
    sectorBenchmark: { id: "price-sector", hash: hash("2") },
  },
  status: "blocked",
  eligibleForRecommendationCandidate: false,
  blockers: [],
  automaticTradingAuthorized: false,
};

const unresolvedDraft = withFoundationDecisionHash(baseDecision);
const expectedBlockers = assessFoundationDecisionRecord(unresolvedDraft, emptyContext);
assert.ok(expectedBlockers.includes("missing_evidence_package"));
assert.ok(expectedBlockers.includes("missing_hypothesis"));
assert.ok(expectedBlockers.includes("missing_scenario_set"));
assert.ok(expectedBlockers.includes("missing_replay_manifest"));
assert.ok(expectedBlockers.includes("missing_replay_result"));
assert.ok(expectedBlockers.some((value) => value.startsWith("missing_calibration:")));
assert.ok(expectedBlockers.includes("missing_price_snapshot:issuer_price"));

{
  const malformedDecision = withFoundationDecisionHash({
    ...baseDecision,
    issuedAt: "2026-08-06T06:05:00",
  });
  assert.throws(
    () => assessFoundationDecisionRecord(malformedDecision, emptyContext),
    /decision\.issuedAt must be an ISO-8601 timestamp with explicit timezone/,
  );
  console.log("research/foundation-decision-integration: direct assessor rejects timezone-less Decision instant OK");
}

{
  const { contentHash: _ignored, ...priceWithoutHash } = price;
  const malformedPrice = withFoundationPriceSnapshotHash({
    ...priceWithoutHash,
    observedAt: "2026-08-06T05:59:00",
  });
  const contextWithMalformedReferencedPrice: FoundationDecisionContext = {
    ...emptyContext,
    priceSnapshotsById: new Map([[malformedPrice.snapshotId, malformedPrice]]),
  };
  assert.throws(
    () => assessFoundationDecisionRecord(unresolvedDraft, contextWithMalformedReferencedPrice),
    /priceSnapshot\.issuerPrice\.observedAt must be an ISO-8601 timestamp with explicit timezone/,
  );
  console.log("research/foundation-decision-integration: direct assessor rejects malformed referenced context instant OK");
}

const blockedDecision = withFoundationDecisionHash({
  ...baseDecision,
  blockers: expectedBlockers,
});
assert.deepEqual(
  validateFoundationDecisionRecord(blockedDecision, decisionSchema, emptyContext),
  [],
  "hash文字列だけではeligibleにならず、実object未解決blockerを正しく保存できる",
);

const falselyEligible = withFoundationDecisionHash({
  ...baseDecision,
  status: "eligible",
  eligibleForRecommendationCandidate: true,
  blockers: [],
});
const eligibleIssues = validateFoundationDecisionRecord(falselyEligible, decisionSchema, emptyContext);
assert.ok(eligibleIssues.some((item) => item.code === "decision_blocker_set_mismatch"));
assert.ok(eligibleIssues.some((item) => item.code === "decision_eligibility_mismatch"));
assert.ok(eligibleIssues.some((item) => item.code === "decision_status_mismatch"));

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-foundation-decision-ledger-"));
  const decisionsPath = join(root, "decisions.jsonl");
  const priceSnapshotsPath = join(root, "price-snapshots.jsonl");
  const replayManifestDir = join(root, "replay-manifests");
  mkdirSync(replayManifestDir, { recursive: true });
  writeFileSync(priceSnapshotsPath, "", "utf-8");
  try {
    const previous = withFoundationDecisionHash({
      ...baseDecision,
      decisionId: "decision-fractional-previous",
      issuedAt: "2026-08-06T06:05:00.000000002Z",
      informationCutoff: "2026-08-06T06:00:00.000000002Z",
      firstExecutableAt: "2026-08-06T06:00:00.000000002Z",
    });
    const regressed = withFoundationDecisionHash({
      ...baseDecision,
      decisionId: "decision-fractional-regressed",
      issuedAt: "2026-08-06T06:05:00.000000001Z",
      informationCutoff: "2026-08-06T06:00:00.000000001Z",
      firstExecutableAt: "2026-08-06T06:00:00.000000001Z",
      supersedesDecisionId: previous.decisionId,
    });
    writeFileSync(decisionsPath, `${JSON.stringify(previous)}\n${JSON.stringify(regressed)}\n`, "utf-8");
    const result = validateFoundationDecisionRepository({
      decisionsPath,
      priceSnapshotsPath,
      replayManifestDir,
      includeDependencyIssues: false,
    });
    assert.ok(
      result.issues.some((item) =>
        item.code === "decision_supersession_time_regression"
        && item.target === regressed.decisionId,
      ),
      "同一millisecond内でも1nsのsupersession時刻逆行をfail-closedにする",
    );
    console.log("research/foundation-decision-integration: supersession ledger preserves sub-millisecond ordering OK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("research/foundation-decision-integration: 全テスト成功");
