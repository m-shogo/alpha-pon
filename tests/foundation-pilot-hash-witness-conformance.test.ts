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
  auditFoundationPilotHashWitnessConformance,
  buildFoundationPilotProofRun,
  renderFoundationPilotHashWitnessConformance,
} from "../src/research/foundation-pilot-hash-witness-conformance.js";
import { buildFoundationPilotHashWitness } from "../src/research/foundation-pilot-hash-witness.js";

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

function priorRevision(): DocumentRevisionRecord {
  return withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: "revision-record-1",
    documentRevisionId: "revision-1",
    documentId: "document-sanrio-1",
    entityIds: ["issuer:E02655", "security-8136"],
    evidenceId: "evidence-original-1",
    documentType: "statutory_filing",
    revisionKind: "initial",
    revisionSequence: 1,
    status: "superseded",
    sourceContentHash: hash("3"),
    normalizedStructureHash: hash("4"),
    publishedAt: "2026-08-06T05:00:00.000Z",
    observedAt: "2026-08-06T05:00:00.000Z",
    retrievedAt: "2026-08-06T05:01:00.000Z",
    effectiveFrom: "2026-08-06T05:00:00.000Z",
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
  });
}

function correctionRevision(prior: DocumentRevisionRecord): DocumentRevisionRecord {
  return withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: "revision-record-2",
    documentRevisionId: "revision-2",
    documentId: prior.documentId,
    entityIds: [...prior.entityIds],
    evidenceId: "evidence-correction-1",
    documentType: prior.documentType,
    revisionKind: "correction",
    revisionSequence: 2,
    status: "active",
    sourceContentHash: hash("7"),
    normalizedStructureHash: hash("8"),
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
      titleHash: hash("9"),
      contentHash: hash("a"),
    }],
    supersedesRecordId: prior.recordId,
  });
}

function run(runId: string, capturedAt: string) {
  return buildFoundationPilotProofRun({ runId, capturedAt, decision: decision() });
}

function setup() {
  const sameInputBaseline = run("same-input-baseline", "2026-08-06T06:10:00.000Z");
  const sameInputRerun = run("same-input-rerun", "2026-08-06T06:20:00.000Z");
  const historicalBaseline = run("historical-before-correction", "2026-08-06T06:30:00.000Z");
  const historicalPostCorrection = run("historical-after-correction", "2026-08-06T07:10:00.000Z");
  const prior = priorRevision();
  const correction = correctionRevision(prior);
  const target = {
    candidateId: "candidate-sanrio",
    listedSecurityEntityId: "security-8136",
    issuerEntityId: "issuer:E02655",
    informationCutoff: "2026-08-06T06:00:00.000Z",
  };
  const witness = buildFoundationPilotHashWitness({
    target,
    generatedAt: "2026-08-06T07:15:00.000Z",
    witnessedBy: "local-human",
    witnessedAt: "2026-08-06T07:15:00.000Z",
    sameInputReplay: {
      baselineRunId: sameInputBaseline.runId,
      rerunRunId: sameInputRerun.runId,
      baselineInputFingerprintHash: sameInputBaseline.decisionInputFingerprint,
      rerunInputFingerprintHash: sameInputRerun.decisionInputFingerprint,
      baselineResultHash: sameInputBaseline.decisionContentHash,
      rerunResultHash: sameInputRerun.decisionContentHash,
    },
    correctionCutoff: {
      historicalCutoff: target.informationCutoff,
      beforeCorrectionRunId: historicalBaseline.runId,
      afterCorrectionRunId: historicalPostCorrection.runId,
      beforeHistoricalResultHash: historicalBaseline.decisionContentHash,
      afterHistoricalResultHash: historicalPostCorrection.decisionContentHash,
      beforeCurrentRevisionHeadHash: prior.contentHash,
      afterCurrentRevisionHeadHash: correction.contentHash,
    },
  });
  return {
    witness,
    sameInputBaseline,
    sameInputRerun,
    historicalBaseline,
    historicalPostCorrection,
    priorRevision: prior,
    correctionRevision: correction,
    generatedAt: "2026-08-06T07:20:00.000Z",
  };
}

{
  const audit = auditFoundationPilotHashWitnessConformance(setup());
  assert.equal(audit.sameInput.status, "conformant");
  assert.equal(audit.correctionCutoff.status, "conformant");
  assert.equal(audit.conformanceStatus, "passed");
  assert.equal(audit.realLocalExecutionConfirmed, false);
  assert.equal(audit.realEvidenceProven, false);
  assert.equal(audit.deterministicReplayProven, false);
  assert.equal(audit.correctionCutoffImmutabilityProven, false);
  assert.equal(audit.milestoneGreenAuthorized, false);
  assert.equal(audit.automaticTradingAuthorized, false);
  assert.equal(audit.proofPromotionAuthorized, false);
  assert.equal(audit.governedStoreAppendAuthorized, false);
  assert.match(audit.contentHash, /^[a-f0-9]{64}$/);
  assert.match(renderFoundationPilotHashWitnessConformance(audit), /Human confirmation/);
  console.log("foundation-pilot-hash-witness-conformance: canonical artifacts conform but proof promotion remains blocked OK");
}

{
  const input = setup();
  input.witness = buildFoundationPilotHashWitness({
    target: input.witness.target,
    generatedAt: input.witness.generatedAt,
    witnessedBy: input.witness.witnessedBy,
    witnessedAt: input.witness.witnessedAt,
    sameInputReplay: {
      ...input.witness.sameInputReplay,
      baselineResultHash: hash("0"),
      rerunResultHash: hash("0"),
    },
    correctionCutoff: input.witness.correctionCutoff,
  });
  const audit = auditFoundationPilotHashWitnessConformance(input);
  assert.equal(audit.sameInput.resultHashesMatchWitness, false);
  assert.equal(audit.sameInput.status, "nonconformant");
  assert.equal(audit.conformanceStatus, "failed");
  console.log("foundation-pilot-hash-witness-conformance: self-consistent manual hashes must match canonical Decisions OK");
}

{
  const input = setup();
  input.witness = buildFoundationPilotHashWitness({
    target: input.witness.target,
    generatedAt: input.witness.generatedAt,
    witnessedBy: input.witness.witnessedBy,
    witnessedAt: input.witness.witnessedAt,
    sameInputReplay: input.witness.sameInputReplay,
    correctionCutoff: {
      ...input.witness.correctionCutoff,
      beforeCurrentRevisionHeadHash: hash("1"),
      afterCurrentRevisionHeadHash: hash("2"),
    },
  });
  const audit = auditFoundationPilotHashWitnessConformance(input);
  assert.equal(audit.correctionCutoff.revisionHeadHashesMatchWitness, false);
  assert.equal(audit.correctionCutoff.status, "nonconformant");
  console.log("foundation-pilot-hash-witness-conformance: supplied revision-head hashes must match canonical chain OK");
}

{
  const input = setup();
  input.correctionRevision = withDocumentRevisionHash({
    ...input.correctionRevision,
    supersedesRecordId: "some-other-record",
    contentHash: undefined as never,
  });
  assert.throws(
    () => auditFoundationPilotHashWitnessConformance(input),
    /does not directly supersede priorRevision/,
  );
  console.log("foundation-pilot-hash-witness-conformance: direct revision chain required OK");
}

{
  const input = setup();
  input.historicalPostCorrection = buildFoundationPilotProofRun({
    runId: "historical-after-correction-too-early",
    capturedAt: "2026-08-06T06:50:00.000Z",
    decision: decision(),
  });
  const audit = auditFoundationPilotHashWitnessConformance(input);
  assert.equal(audit.correctionCutoff.postRunCapturedAfterCorrectionRetrieval, false);
  assert.equal(audit.correctionCutoff.status, "nonconformant");
  console.log("foundation-pilot-hash-witness-conformance: post-correction capture timing must follow canonical correction retrieval OK");
}

console.log("foundation-pilot-hash-witness-conformance.test.ts passed");
