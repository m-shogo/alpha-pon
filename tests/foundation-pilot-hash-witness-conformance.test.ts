import assert from "node:assert/strict";
import { withDocumentRevisionHash, type DocumentRevisionRecord } from "../src/research/document-revision-diff.js";
import { withFoundationDecisionHash, type FoundationDecisionIntegrationRecord } from "../src/research/foundation-decision-integration.js";
import {
  auditFoundationPilotHashWitnessConformance,
  buildFoundationPilotProofRun,
  renderFoundationPilotHashWitnessConformance,
} from "../src/research/foundation-pilot-hash-witness-conformance.js";
import { buildFoundationPilotHashWitness } from "../src/research/foundation-pilot-hash-witness.js";

const h = (c: string): string => c.repeat(64);

function decision(): FoundationDecisionIntegrationRecord {
  return withFoundationDecisionHash({
    schemaVersion: 1,
    decisionId: "decision-real-pilot-001",
    candidateId: "candidate-sanrio",
    listedSecurityEntityId: "security-8136",
    issuedAt: "2026-08-06T06:05:00.000Z",
    informationCutoff: "2026-08-06T06:00:00.000Z",
    firstExecutableAt: "2026-08-06T06:00:00.000Z",
    securityMasterSnapshotHash: h("1"),
    evidenceSnapshotHash: h("2"),
    claimGraphSnapshotHash: h("3"),
    documentRevisionSnapshotHash: h("4"),
    evidencePackageId: "package-1",
    evidencePackageHash: h("5"),
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
    hypothesisHash: h("6"),
    scenarioSetId: "scenario-set-1",
    scenarioSetHash: h("7"),
    scenarios: {
      downside: { id: "scenario-downside", hash: h("8") },
      base: { id: "scenario-base", hash: h("9") },
      upside: { id: "scenario-upside", hash: h("a") },
      nullHypothesis: { id: "scenario-null", hash: h("b") },
    },
    replayId: "replay-1",
    councilRunId: "council-run-1",
    replayManifestHash: h("c"),
    replayResultHash: h("d"),
    calibrationHashes: [h("e")],
    priceSnapshots: {
      issuerPrice: { id: "price-issuer", hash: h("f") },
      issuerBenchmark: { id: "price-issuer-benchmark", hash: h("0") },
      topixBenchmark: { id: "price-topix", hash: h("1") },
      sectorBenchmark: { id: "price-sector", hash: h("2") },
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
    sourceContentHash: h("3"),
    normalizedStructureHash: h("4"),
    publishedAt: "2026-08-06T05:00:00.000Z",
    observedAt: "2026-08-06T05:00:00.000Z",
    retrievedAt: "2026-08-06T05:01:00.000Z",
    effectiveFrom: "2026-08-06T05:00:00.000Z",
    language: "ja",
    storagePolicy: "local_only_content",
    parserVersion: "parser-v1",
    normalizationVersion: "normalization-v1",
    sections: [{ sectionId: "section-1", path: "XBRL/PublicDoc/main.htm", ordinal: 1, titleHash: h("5"), contentHash: h("6") }],
  });
}

function correctionRevision(prior: DocumentRevisionRecord, supersedesRecordId = prior.recordId): DocumentRevisionRecord {
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
    sourceContentHash: h("7"),
    normalizedStructureHash: h("8"),
    publishedAt: "2026-08-06T07:00:00.000Z",
    observedAt: "2026-08-06T07:00:00.000Z",
    retrievedAt: "2026-08-06T07:01:00.000Z",
    effectiveFrom: "2026-08-06T07:00:00.000Z",
    language: "ja",
    storagePolicy: "local_only_content",
    parserVersion: "parser-v1",
    normalizationVersion: "normalization-v1",
    sections: [{ sectionId: "section-1", path: "XBRL/PublicDoc/main.htm", ordinal: 1, titleHash: h("9"), contentHash: h("a") }],
    supersedesRecordId,
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
  assert.equal(audit.deterministicReplayProven, false);
  assert.equal(audit.correctionCutoffImmutabilityProven, false);
  assert.equal(audit.milestoneGreenAuthorized, false);
  assert.equal(audit.proofPromotionAuthorized, false);
  assert.match(audit.contentHash, /^[a-f0-9]{64}$/);
  assert.match(renderFoundationPilotHashWitnessConformance(audit), /Human confirmation/);
  console.log("foundation-pilot-hash-witness-conformance: canonical conformance stays non-authorizing OK");
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
      baselineResultHash: h("0"),
      rerunResultHash: h("0"),
    },
    correctionCutoff: input.witness.correctionCutoff,
  });
  const audit = auditFoundationPilotHashWitnessConformance(input);
  assert.equal(audit.sameInput.resultHashesMatchWitness, false);
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
      beforeCurrentRevisionHeadHash: h("1"),
      afterCurrentRevisionHeadHash: h("2"),
    },
  });
  const audit = auditFoundationPilotHashWitnessConformance(input);
  assert.equal(audit.correctionCutoff.revisionHeadHashesMatchWitness, false);
  assert.equal(audit.correctionCutoff.status, "nonconformant");
  console.log("foundation-pilot-hash-witness-conformance: revision-head witness hashes require canonical chain OK");
}

{
  const input = setup();
  input.correctionRevision = correctionRevision(input.priorRevision, "some-other-record");
  assert.throws(() => auditFoundationPilotHashWitnessConformance(input), /does not directly supersede priorRevision/);
  console.log("foundation-pilot-hash-witness-conformance: direct revision chain required OK");
}

{
  const input = setup();
  input.historicalPostCorrection = run("historical-after-correction-too-early", "2026-08-06T06:50:00.000Z");
  const audit = auditFoundationPilotHashWitnessConformance(input);
  assert.equal(audit.correctionCutoff.postRunCapturedAfterCorrectionRetrieval, false);
  assert.equal(audit.correctionCutoff.status, "nonconformant");
  console.log("foundation-pilot-hash-witness-conformance: post-correction timing must follow canonical retrieval OK");
}

console.log("foundation-pilot-hash-witness-conformance.test.ts passed");
