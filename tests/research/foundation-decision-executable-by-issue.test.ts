import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withFoundationDecisionHash,
  withFoundationPriceSnapshotHash,
  type FoundationDecisionIntegrationRecord,
} from "../../src/research/foundation-decision-integration.js";
import { validateFoundationDecisionRepository } from "../../src/research/foundation-decision-integration-repository.js";
import { withReplayManifestHash } from "../../src/research/stock-pro-council-replay.js";

const hash = (character: string): string => character.repeat(64);
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

const input: Omit<FoundationDecisionIntegrationRecord, "contentHash"> = {
  schemaVersion: 1,
  decisionId: "decision-executable-after-issue",
  candidateId: "candidate-synthetic",
  listedSecurityEntityId: "security-synthetic",
  issuedAt: "2026-08-06T06:05:00.000000001Z",
  informationCutoff: "2026-08-06T06:00:00.000000001Z",
  firstExecutableAt: "2026-08-06T06:05:00.000000002Z",
  securityMasterSnapshotHash: hash("1"),
  evidenceSnapshotHash: hash("2"),
  claimGraphSnapshotHash: hash("3"),
  documentRevisionSnapshotHash: hash("4"),
  evidencePackageId: "package-synthetic",
  evidencePackageHash: hash("5"),
  evidencePackageStatus: "complete",
  evidencePackageCompleteness: completeness,
  hypothesisId: "hypothesis-synthetic",
  hypothesisHash: hash("6"),
  scenarioSetId: "scenario-set-synthetic",
  scenarioSetHash: hash("7"),
  scenarios: {
    downside: { id: "scenario-downside", hash: hash("8") },
    base: { id: "scenario-base", hash: hash("9") },
    upside: { id: "scenario-upside", hash: hash("a") },
    nullHypothesis: { id: "scenario-null", hash: hash("b") },
  },
  replayId: "replay-synthetic",
  councilRunId: "council-run-synthetic",
  replayManifestHash: hash("c"),
  replayResultHash: hash("d"),
  calibrationHashes: [hash("e")],
  priceSnapshots: {
    issuerPrice: { id: "price-issuer", hash: hash("f") },
    issuerBenchmark: { id: "price-issuer-benchmark", hash: hash("0") },
    topixBenchmark: { id: "price-topix", hash: hash("1") },
    sectorBenchmark: { id: "price-sector", hash: hash("2") },
  },
  status: "blocked",
  eligibleForRecommendationCandidate: false,
  blockers: [],
  automaticTradingAuthorized: false,
};

const root = mkdtempSync(join(tmpdir(), "alpha-pon-foundation-executable-"));
const decisionsPath = join(root, "decisions.jsonl");
const priceSnapshotsPath = join(root, "price-snapshots.jsonl");
const replayManifestDir = join(root, "replay-manifests");
mkdirSync(replayManifestDir, { recursive: true });

try {
  const record = withFoundationDecisionHash(input);
  writeFileSync(decisionsPath, `${JSON.stringify(record)}\n`, "utf-8");
  writeFileSync(priceSnapshotsPath, "", "utf-8");
  const result = validateFoundationDecisionRepository({
    decisionsPath,
    priceSnapshotsPath,
    replayManifestDir,
    includeDependencyIssues: false,
  });
  assert.ok(
    result.issues.some((item) =>
      item.code === "decision_price_not_executable_at_issue"
      && item.target === record.decisionId,
    ),
    "Foundation Decision must fail closed when firstExecutableAt is even 1ns after issuedAt",
  );

  const topixBenchmark = withFoundationPriceSnapshotHash({
    schemaVersion: 1,
    snapshotId: "price-topix",
    candidateId: input.candidateId,
    listedSecurityEntityId: input.listedSecurityEntityId,
    role: "topix_benchmark",
    instrumentId: "TOPIX-synthetic",
    providerId: "provider-synthetic",
    providerRecordId: "provider-record-synthetic",
    tradingDate: "2026-08-06",
    informationCutoff: input.informationCutoff,
    observedAt: input.informationCutoff,
    firstExecutableAt: "2026-08-06T06:05:00.000000002Z",
    value: 1,
    currency: "JPY",
    adjustmentStatus: "raw",
    licenseClass: "local_only",
    rawPayloadHash: hash("3"),
  });
  const benchmarkDecision = withFoundationDecisionHash({
    ...input,
    decisionId: "decision-benchmark-executable-after-issue",
    firstExecutableAt: input.issuedAt,
    priceSnapshots: {
      ...input.priceSnapshots,
      topixBenchmark: { id: topixBenchmark.snapshotId, hash: topixBenchmark.contentHash },
    },
  });
  writeFileSync(decisionsPath, `${JSON.stringify(benchmarkDecision)}\n`, "utf-8");
  writeFileSync(priceSnapshotsPath, `${JSON.stringify(topixBenchmark)}\n`, "utf-8");
  const benchmarkResult = validateFoundationDecisionRepository({
    decisionsPath,
    priceSnapshotsPath,
    replayManifestDir,
    includeDependencyIssues: false,
  });
  assert.ok(
    benchmarkResult.issues.some((item) =>
      item.code === "decision_benchmark_not_executable_at_issue"
      && item.target === `${benchmarkDecision.decisionId}:topixBenchmark`,
    ),
    "Foundation Decision must fail closed when a pinned benchmark becomes executable even 1ns after issuedAt",
  );

  const replayManifest = withReplayManifestHash({
    schemaVersion: 1,
    replayId: input.replayId,
    councilRunId: input.councilRunId,
    caseType: "general",
    informationCutoff: input.informationCutoff,
    createdAt: "2026-08-06T06:05:00.000000002Z",
    evidencePackageHash: input.evidencePackageHash,
    priceSnapshotHash: input.priceSnapshots.issuerPrice.hash,
    codeVersion: "synthetic-code",
    ruleVersion: "synthetic-rule",
    personaCatalogVersion: "synthetic-persona-catalog",
    requiredPersonaIds: [],
    verdictHashes: [],
    dissentHashes: [],
    vetoHashes: [],
    calibrationHashes: input.calibrationHashes,
    automaticTradingAuthorized: false,
  });
  writeFileSync(
    join(replayManifestDir, `${replayManifest.replayId}.json`),
    `${JSON.stringify(replayManifest)}\n`,
    "utf-8",
  );
  const replayDecision = withFoundationDecisionHash({
    ...input,
    decisionId: "decision-replay-created-after-issue",
    firstExecutableAt: input.issuedAt,
    replayManifestHash: replayManifest.contentHash,
  });
  writeFileSync(decisionsPath, `${JSON.stringify(replayDecision)}\n`, "utf-8");
  writeFileSync(priceSnapshotsPath, "", "utf-8");
  const replayResult = validateFoundationDecisionRepository({
    decisionsPath,
    priceSnapshotsPath,
    replayManifestDir,
    includeDependencyIssues: false,
  });
  assert.ok(
    replayResult.issues.some((item) =>
      item.code === "decision_replay_manifest_after_issue"
      && item.target === replayDecision.decisionId,
    ),
    "Foundation Decision must fail closed when its pinned replay manifest is created even 1ns after issuedAt",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("foundation-decision-executable-by-issue: future executable prices, benchmarks, and replay manifests are blocked");
