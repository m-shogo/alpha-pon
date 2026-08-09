import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FoundationPilotHashWitnessConformanceAudit } from "../src/research/foundation-pilot-hash-witness-conformance.js";
import {
  buildFoundationPilotHumanReplayProofTemplate,
  finalizeFoundationPilotHumanReplayProof,
  renderFoundationPilotHumanReplayProof,
  type FoundationPilotHumanReplayProofRecord,
} from "../src/research/foundation-pilot-human-replay-proof.js";

type JsonObject = Record<string, unknown>;
const h = (c: string): string => c.repeat(64);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function conformance(status: "passed" | "failed" = "passed"): FoundationPilotHashWitnessConformanceAudit {
  const conformant = status === "passed";
  const base = {
    schemaVersion: 1 as const,
    target: {
      candidateId: "candidate-sanrio",
      listedSecurityEntityId: "security-8136",
      issuerEntityId: "issuer:E02655",
      informationCutoff: "2026-08-06T06:00:00.000Z",
    },
    generatedAt: "2026-08-07T02:00:00.000Z",
    sourceWitnessHash: h("a"),
    sameInput: {
      runIdsMatchWitness: conformant,
      fingerprintsMatchWitness: conformant,
      resultHashesMatchWitness: conformant,
      canonicalDecisionsMatch: conformant,
      status: conformant ? "conformant" as const : "nonconformant" as const,
    },
    correctionCutoff: {
      runIdsMatchWitness: conformant,
      historicalResultHashesMatchWitness: conformant,
      priorRevisionId: "revision-1",
      priorRevisionHash: h("b"),
      correctionRevisionId: "revision-2",
      correctionRevisionHash: h("c"),
      revisionHeadHashesMatchWitness: conformant,
      directRevisionChainVerified: conformant,
      correctionObservedAfterHistoricalCutoff: conformant,
      baselineCapturedBeforeCorrectionRetrieval: conformant,
      postRunCapturedAfterCorrectionRetrieval: conformant,
      canonicalHistoricalDecisionsMatch: conformant,
      status: conformant ? "conformant" as const : "nonconformant" as const,
    },
    conformanceStatus: status,
    humanRealLocalExecutionConfirmationRequired: true as const,
    realLocalExecutionConfirmed: false as const,
    realEvidenceProven: false as const,
    deterministicReplayProven: false as const,
    correctionCutoffImmutabilityProven: false as const,
    milestoneGreenAuthorized: false as const,
    automaticTradingAuthorized: false as const,
    proofPromotionAuthorized: false as const,
    governedStoreAppendAuthorized: false as const,
    blockers: ["human_must_confirm_captures_followed_intended_real_local_pipeline_runs"],
  };
  return { ...base, contentHash: digest(base) };
}

function conformanceWithGeneratedAt(generatedAt: string): FoundationPilotHashWitnessConformanceAudit {
  const current = conformance();
  const { contentHash: _ignored, ...withoutHash } = current;
  const base = { ...withoutHash, generatedAt };
  return { ...base, contentHash: digest(base) };
}

function template() {
  return buildFoundationPilotHumanReplayProofTemplate({
    conformance: conformance(),
    sourceConformanceFile: "foundation-pilot-hash-witness-conformance-v1.20260807T020000Z.json",
    generatedAt: "2026-08-07T02:01:00.000Z",
  });
}

function completeInput(): FoundationPilotHumanReplayProofRecord {
  const input = structuredClone(template());
  input.reviewer = "local-human-reviewer";
  input.reviewedAt = "2026-08-07T02:05:00.000Z";
  input.confirmations = {
    fourDistinctRealLocalExecutionsConfirmed: true,
    sameInputPinsActuallyIdentical: true,
    historicalBaselineExecutedBeforeCorrectionRetrieval: true,
    correctionRevisionIsActualObservedSourceChange: true,
    postCorrectionHistoricalReplayExecutedAfterCorrectionRetrieval: true,
    noSyntheticFixtureOrMockArtifactsUsed: true,
    intendedLocalPipelineAndEnvironmentConfirmed: true,
  };
  input.humanNotes = "Confirmed all four intended local executions and the real correction sequence against local records.";
  return input;
}

function finalize(input = completeInput(), source = conformance()) {
  return finalizeFoundationPilotHumanReplayProof({
    conformance: source,
    sourceConformanceFile: "foundation-pilot-hash-witness-conformance-v1.20260807T020000Z.json",
    editedReviewInput: input,
    generatedAt: "2026-08-07T02:06:00.000Z",
  });
}

{
  const draft = template();
  assert.equal(draft.reviewStatus, "draft_human_input");
  assert.equal(draft.realLocalExecutionConfirmed, false);
  assert.equal(draft.deterministicReplayProven, false);
  assert.equal(draft.correctionCutoffImmutabilityProven, false);
  assert.equal(draft.realEvidenceProven, false);
  assert.equal(draft.milestoneGreenAuthorized, false);
  assert.ok(Object.values(draft.confirmations).every(value => value === false));
  console.log("foundation-pilot-human-replay-proof: template starts fully unconfirmed OK");
}

{
  const record = finalize();
  assert.equal(record.reviewStatus, "complete_human_replay_proof");
  assert.equal(record.realLocalExecutionConfirmed, true);
  assert.equal(record.deterministicReplayProven, true);
  assert.equal(record.correctionCutoffImmutabilityProven, true);
  assert.equal(record.realEvidenceProven, false);
  assert.equal(record.milestoneGreenAuthorized, false);
  assert.equal(record.automaticTradingAuthorized, false);
  assert.equal(record.proofPromotionAuthorized, false);
  assert.equal(record.governedStoreAppendAuthorized, false);
  assert.match(record.recordHash, /^[a-f0-9]{64}$/);
  assert.match(renderFoundationPilotHumanReplayProof(record), /realEvidenceProven: false/);
  console.log("foundation-pilot-human-replay-proof: human-confirmed replay proofs remain milestone-non-authorizing OK");
}

assert.throws(
  () => buildFoundationPilotHumanReplayProofTemplate({
    conformance: conformance(),
    sourceConformanceFile: "foundation-pilot-hash-witness-conformance-v1.20260807T020000Z.json",
    generatedAt: "2026-08-07T02:01:00",
  }),
  /explicit timezone/,
);
console.log("foundation-pilot-human-replay-proof: timezone-less template generatedAt blocked OK");

assert.throws(
  () => buildFoundationPilotHumanReplayProofTemplate({
    conformance: conformanceWithGeneratedAt("2026-02-31T02:00:00Z"),
    sourceConformanceFile: "foundation-pilot-hash-witness-conformance-v1.20260807T020000Z.json",
    generatedAt: "2026-08-07T02:01:00Z",
  }),
  /valid Gregorian ISO-8601 timestamp/,
);
console.log("foundation-pilot-human-replay-proof: impossible upstream conformance generatedAt blocked OK");

{
  const input = completeInput();
  input.reviewedAt = "2026-08-07T02:05:00+15:00";
  assert.throws(() => finalize(input), /timezone offset within ±14:00/);
  console.log("foundation-pilot-human-replay-proof: invalid human reviewedAt offset blocked OK");
}

assert.throws(
  () => finalizeFoundationPilotHumanReplayProof({
    conformance: conformance(),
    sourceConformanceFile: "foundation-pilot-hash-witness-conformance-v1.20260807T020000Z.json",
    editedReviewInput: completeInput(),
    generatedAt: "2026-08-07T02:06:00",
  }),
  /explicit timezone/,
);
console.log("foundation-pilot-human-replay-proof: timezone-less final generatedAt blocked OK");

{
  const input = completeInput();
  input.confirmations.noSyntheticFixtureOrMockArtifactsUsed = false;
  assert.throws(() => finalize(input), /requires all real-local execution confirmations/);
  console.log("foundation-pilot-human-replay-proof: every real-local confirmation is mandatory OK");
}

{
  const input = completeInput();
  input.target.candidateId = "tampered-candidate";
  assert.throws(() => finalize(input), /immutable source\/safety fields changed/);
  console.log("foundation-pilot-human-replay-proof: source target lineage is immutable OK");
}

{
  const input = completeInput();
  input.deterministicReplayProven = true;
  assert.throws(() => finalize(input), /proof flags must remain false before finalization/);
  console.log("foundation-pilot-human-replay-proof: proof flags cannot be pre-authorized in edited input OK");
}

{
  assert.throws(
    () => buildFoundationPilotHumanReplayProofTemplate({
      conformance: conformance("failed"),
      sourceConformanceFile: "foundation-pilot-hash-witness-conformance-v1.20260807T020000Z.json",
      generatedAt: "2026-08-07T02:01:00.000Z",
    }),
    /conformance safety\/status boundary is invalid/,
  );
  console.log("foundation-pilot-human-replay-proof: failed machine conformance cannot enter human proof review OK");
}

{
  const input = completeInput();
  input.humanNotes = "";
  assert.throws(() => finalize(input), /humanNotes must be a non-empty string/);
  console.log("foundation-pilot-human-replay-proof: human evidence notes required OK");
}

console.log("foundation-pilot-human-replay-proof.test.ts passed");