import assert from "node:assert/strict";
import {
  buildFoundationPilotStructuralStatus,
  renderFoundationPilotStructuralStatus,
  type FoundationPilotStructuralObservation,
} from "../src/research/foundation-pilot-structural-status.js";

const target = {
  candidateId: "sanrio-real-pilot",
  listedSecurityEntityId: "security:81360",
  issuerEntityId: "issuer:E02655",
  informationCutoff: "2026-07-31T06:00:00.000Z",
};

function readyObservation(): FoundationPilotStructuralObservation {
  return {
    validationIssueCounts: {
      securityMaster: 0,
      evidenceStore: 0,
      claimGraph: 0,
      documentRevision: 0,
      evidencePackage: 0,
      hypothesisScenario: 0,
      councilReplay: 0,
      foundationDecision: 0,
    },
    security: {
      listedSecurityPresent: true,
      issuerPresent: true,
      verifiedIssuerRelationshipPresent: true,
      verifiedListingRelationshipPresent: true,
    },
    evidence: {
      targetEvidenceCount: 3,
      primaryEvidenceCount: 3,
      targetRelationCount: 2,
      correctionLikeRelationCount: 1,
    },
    claims: {
      targetClaimCount: 5,
      activeTargetClaimCount: 4,
      classCounts: { fact: 2, assumption: 1, forecast: 0, opinion: 0, unknown: 1 },
    },
    documents: {
      targetRevisionCount: 2,
      targetDiffCount: 1,
      correctionLikeRevisionCount: 1,
      reviewedOrConfirmedDiffCount: 1,
    },
    prices: {
      issuerPriceCount: 1,
      issuerBenchmarkCount: 1,
      topixBenchmarkCount: 1,
      sectorBenchmarkCount: 1,
    },
    packages: {
      targetManifestCount: 1,
      completeTargetPackageCount: 1,
      activeCompleteTargetPackageHashes: ["a".repeat(64)],
    },
    hypotheses: {
      targetHypothesisCount: 1,
      registeredTargetHypothesisCount: 1,
      registeredTargetHypothesisIds: ["hypothesis:001"],
    },
    scenarios: {
      targetScenarioSetCount: 1,
      registeredFourScenarioSetCount: 1,
    },
    replay: {
      targetReplayCount: 1,
      eligibleTargetReplayCount: 1,
    },
    decisions: {
      targetDecisionCount: 1,
      eligibleTargetDecisionCount: 1,
      blockedTargetDecisionCount: 0,
    },
  };
}

{
  const status = buildFoundationPilotStructuralStatus({
    target,
    observation: readyObservation(),
    generatedAt: "2026-08-07T01:30:00.000Z",
  });
  assert.equal(status.structuralStatus, "structurally_complete_manual_proof_pending");
  assert.equal(status.structurallyReadyStageCount, 10);
  assert.equal(status.firstIncompleteStageId, "same_input_same_hash_proof");
  assert.equal(status.nextAction, "rerun_identical_real_local_inputs_and_compare_exact_hashes");
  assert.equal(status.realEvidenceProven, false);
  assert.equal(status.deterministicReplayProven, false);
  assert.equal(status.correctionCutoffImmutabilityProven, false);
  assert.equal(status.milestoneGreenAuthorized, false);
  assert.equal(status.automaticTradingAuthorized, false);
  assert.match(status.contentHash, /^[a-f0-9]{64}$/);
  const markdown = renderFoundationPilotStructuralStatus(status);
  assert.match(markdown, /structural only/);
  assert.match(markdown, /milestoneGreenAuthorized: false/);
  console.log("foundation-pilot-structural-status: structurally complete still requires manual real-data proofs OK");
}

{
  const observation = readyObservation();
  observation.security.listedSecurityPresent = false;
  const status = buildFoundationPilotStructuralStatus({
    target,
    observation,
    generatedAt: "2026-08-07T01:30:00.000Z",
  });
  assert.equal(status.structuralStatus, "in_progress");
  assert.equal(status.firstIncompleteStageId, "security_master_identity");
  assert.equal(status.nextAction, "create_or_fix_governed_security_master_identity");
  assert.ok(status.stages[0]!.blockers.includes("target_listed_security_missing"));
  console.log("foundation-pilot-structural-status: missing target identity fails at stage 1 OK");
}

{
  const observation = readyObservation();
  observation.validationIssueCounts.claimGraph = 2;
  const status = buildFoundationPilotStructuralStatus({
    target,
    observation,
    generatedAt: "2026-08-07T01:30:00.000Z",
  });
  assert.equal(status.structuralStatus, "blocked");
  const claimStage = status.stages.find(item => item.stageId === "classified_claim_graph")!;
  assert.equal(claimStage.status, "blocked_by_validation");
  assert.ok(claimStage.blockers.includes("claim_graph_validation_errors"));
  console.log("foundation-pilot-structural-status: repository validation errors block structural progress OK");
}

{
  const observation = readyObservation();
  observation.documents.correctionLikeRevisionCount = 0;
  observation.evidence.correctionLikeRelationCount = 0;
  const status = buildFoundationPilotStructuralStatus({
    target,
    observation,
    generatedAt: "2026-08-07T01:30:00.000Z",
  });
  const correction = status.stages.find(item => item.stageId === "revision_correction_chain")!;
  assert.equal(correction.status, "partial");
  assert.ok(correction.blockers.includes("correction_chain_missing"));
  assert.equal(status.firstIncompleteStageId, "revision_correction_chain");
  console.log("foundation-pilot-structural-status: correction chain remains explicit partial gate OK");
}

{
  const first = buildFoundationPilotStructuralStatus({
    target,
    observation: readyObservation(),
    generatedAt: "2026-08-07T01:30:00.000Z",
  });
  const second = buildFoundationPilotStructuralStatus({
    target: { ...target },
    observation: readyObservation(),
    generatedAt: "2026-08-07T01:30:00.000Z",
  });
  assert.equal(first.contentHash, second.contentHash);
  console.log("foundation-pilot-structural-status: deterministic structural status hash OK");
}

{
  const offsetStatus = buildFoundationPilotStructuralStatus({
    target: { ...target, informationCutoff: "2026-07-31T15:00:00+09:00" },
    observation: readyObservation(),
    generatedAt: "2026-08-07T10:30:00+09:00",
  });
  assert.equal(offsetStatus.target.informationCutoff, "2026-07-31T15:00:00+09:00");
  console.log("foundation-pilot-structural-status: explicit timezone offsets remain valid OK");
}

assert.throws(() => buildFoundationPilotStructuralStatus({
  target: { ...target, informationCutoff: "not-a-time" },
  observation: readyObservation(),
  generatedAt: "2026-08-07T01:30:00.000Z",
}), /ISO-8601 timestamp with explicit timezone/);

assert.throws(() => buildFoundationPilotStructuralStatus({
  target: { ...target, informationCutoff: "2026-07-31T06:00:00" },
  observation: readyObservation(),
  generatedAt: "2026-08-07T01:30:00.000Z",
}), /explicit timezone/);

assert.throws(() => buildFoundationPilotStructuralStatus({
  target: { ...target, informationCutoff: "2026-02-31T06:00:00Z" },
  observation: readyObservation(),
  generatedAt: "2026-08-07T01:30:00.000Z",
}), /valid Gregorian ISO-8601 timestamp/);

assert.throws(() => buildFoundationPilotStructuralStatus({
  target,
  observation: readyObservation(),
  generatedAt: "2026-08-07T01:30:00",
}), /explicit timezone/);

assert.throws(() => buildFoundationPilotStructuralStatus({
  target,
  observation: readyObservation(),
  generatedAt: "2026-08-07T01:30:00+15:00",
}), /timezone offset within ±14:00/);

console.log("foundation-pilot-structural-status: implicit and impossible instants fail closed OK");
console.log("foundation-pilot-structural-status.test.ts passed");
