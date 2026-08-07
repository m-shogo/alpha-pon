import assert from "node:assert/strict";
import {
  withDocumentRevisionHash,
  type DocumentRevisionRecord,
} from "../src/research/document-revision-diff.js";
import {
  withFoundationDecisionHash,
  type FoundationDecisionIntegrationRecord,
} from "../src/research/foundation-decision-integration.js";
import {
  auditFoundationPilotReplayProof,
  buildFoundationPilotProofRun,
  renderFoundationPilotReplayProofAudit,
} from "../src/research/foundation-pilot-replay-proof.js";

const hash = (character: string): string => character.repeat(64);

function decision(): FoundationDecisionIntegrationRecord {
  return withFoundationDecisionHash({
    schemaVersion: 1,
    decisionId: "decision-real-pilot-001",
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
      issuerPrice: { id: "price-issuer", hash: hash("f") },
      issuerBenchmark: { id: "price-issuer-benchmark", hash: hash("0") },
      topixBenchmark: { id: "price-topix", hash: hash("1") },
      sectorBenchmark: { id: "price-sector", hash: hash("2") },
    },
    status: "eligible",
    eligibleForRecommendationCandidate: true,
    blockers: [],
    automaticTradingAuthorized: false,
  });
}

function correction(overrides: Partial<DocumentRevisionRecord> = {}): DocumentRevisionRecord {
  const base = withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: "document-revision-record-2",
    documentRevisionId: "document-revision-2",
    documentId: "document-sanrio-1",
    entityIds: ["issuer:E02655", "security-8136"],
    evidenceId: "evidence-correction-1",
    documentType: "statutory_filing",
    revisionKind: "correction",
    revisionSequence: 2,
    status: "active",
    sourceContentHash: hash("3"),
    normalizedStructureHash: hash("4"),
    publishedAt: "2026-08-06T07:00:00.000Z",
    observedAt: "2026-08-06T07:00:00.000Z",
    retrievedAt: "2026-08-06T07:01:00.000Z",
    effectiveFrom: "2026-08-06T07:00:00.000Z",
    language: "ja",
    storagePolicy: "local_only_content",
    parserVersion: "parser-v1",
    normalizationVersion: "normalization-v1",
    sections: [{
      sectionId: "section-1",
      path: "XBRL/PublicDoc/main.htm",
      ordinal: 1,
      titleHash: hash("5"),
      contentHash: hash("6"),
    }],
    supersedesRecordId: "document-revision-record-1",
  });
  if (Object.keys(overrides).length === 0) return base;
  const { contentHash: _oldHash, ...withoutHash } = { ...base, ...overrides };
  return withDocumentRevisionHash(withoutHash);
}

function proofRun(runId: string, capturedAt: string, record = decision()) {
  return buildFoundationPilotProofRun({ runId, capturedAt, decision: record });
}

function setup() {
  return {
    target: {
      candidateId: "candidate-sanrio",
      listedSecurityEntityId: "security-8136",
      issuerEntityId: "issuer:E02655",
      informationCutoff: "2026-08-06T06:00:00.000Z",
    },
    sameInputBaseline: proofRun("same-baseline", "2026-08-06T06:10:00.000Z"),
    sameInputRerun: proofRun("same-rerun", "2026-08-06T06:20:00.000Z"),
    historicalBaseline: proofRun("historical-baseline", "2026-08-06T06:30:00.000Z"),
    historicalPostCorrection: proofRun("historical-post-correction", "2026-08-06T07:10:00.000Z"),
    correctionWitness: correction(),
    generatedAt: "2026-08-06T07:20:00.000Z",
  };
}

{
  const audit = auditFoundationPilotReplayProof(setup());
  assert.equal(audit.sameInput.machineStatus, "passed");
  assert.equal(audit.correctionCutoff.machineStatus, "passed");
  assert.equal(audit.machineProofStatus, "passed");
  assert.equal(audit.realLocalExecutionConfirmed, false);
  assert.equal(audit.realEvidenceProven, false);
  assert.equal(audit.deterministicReplayProven, false);
  assert.equal(audit.correctionCutoffImmutabilityProven, false);
  assert.equal(audit.milestoneGreenAuthorized, false);
  assert.equal(audit.automaticTradingAuthorized, false);
  assert.ok(audit.blockers.includes("human_must_confirm_runs_were_real_local_pipeline_executions"));
  assert.match(audit.proofHash, /^[a-f0-9]{64}$/);
  assert.match(renderFoundationPilotReplayProofAudit(audit), /separate human finalization/);
  console.log("foundation-pilot-replay-proof: machine equality cannot self-authorize real proof OK");
}

{
  const input = setup();
  const divergent = decision();
  divergent.blockers = ["synthetic-output-difference"];
  divergent.contentHash = withFoundationDecisionHash({
    ...divergent,
    blockers: divergent.blockers,
  }).contentHash;
  input.sameInputRerun = proofRun("same-rerun-divergent", "2026-08-06T06:20:00.000Z", divergent);
  const audit = auditFoundationPilotReplayProof(input);
  assert.equal(audit.sameInput.inputFingerprintMatch, true);
  assert.equal(audit.sameInput.decisionContentHashMatch, false);
  assert.equal(audit.sameInput.machineStatus, "failed");
  assert.equal(audit.machineProofStatus, "failed");
  console.log("foundation-pilot-replay-proof: same inputs with divergent output fail determinism proof OK");
}

{
  const input = setup();
  input.correctionWitness = correction({
    observedAt: "2026-08-06T05:50:00.000Z",
    retrievedAt: "2026-08-06T05:55:00.000Z",
  });
  const audit = auditFoundationPilotReplayProof(input);
  assert.equal(audit.correctionCutoff.correctionObservedAfterHistoricalCutoff, false);
  assert.equal(audit.correctionCutoff.machineStatus, "failed");
  console.log("foundation-pilot-replay-proof: correction visible before historical cutoff cannot prove past-cutoff immutability OK");
}

{
  const input = setup();
  input.historicalPostCorrection = proofRun(
    "historical-post-too-early",
    "2026-08-06T06:50:00.000Z",
  );
  const audit = auditFoundationPilotReplayProof(input);
  assert.equal(audit.correctionCutoff.postRunCapturedAfterCorrectionRetrieval, false);
  assert.equal(audit.correctionCutoff.machineStatus, "failed");
  console.log("foundation-pilot-replay-proof: post-correction replay must be observed after correction retrieval OK");
}

{
  const input = setup();
  input.sameInputRerun = structuredClone(input.sameInputBaseline);
  assert.throws(
    () => auditFoundationPilotReplayProof(input),
    /duplicate proof runId/,
  );
  console.log("foundation-pilot-replay-proof: distinct run observations required OK");
}

{
  const run = proofRun("hash-tamper", "2026-08-06T06:20:00.000Z");
  run.decisionContentHash = hash("0");
  const input = setup();
  input.sameInputRerun = run;
  assert.throws(
    () => auditFoundationPilotReplayProof(input),
    /envelopeHash mismatch/,
  );
  console.log("foundation-pilot-replay-proof: proof envelope tampering blocked OK");
}

console.log("foundation-pilot-replay-proof.test.ts passed");
