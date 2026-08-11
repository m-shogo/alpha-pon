import assert from "node:assert/strict";
import {
  buildFoundationPilotHashWitness,
  renderFoundationPilotHashWitness,
} from "../src/research/foundation-pilot-hash-witness.js";

function input() {
  return {
    target: {
      candidateId: "candidate:sanrio:fixture",
      listedSecurityEntityId: "listed-security:8136",
      issuerEntityId: "issuer:E02655",
      informationCutoff: "2026-07-31T06:00:00.000Z",
    },
    generatedAt: "2026-08-07T01:40:00.000Z",
    witnessedBy: "local-pilot-reviewer",
    witnessedAt: "2026-08-07T01:39:00.000Z",
    sameInputReplay: {
      baselineRunId: "run:baseline",
      rerunRunId: "run:rerun",
      baselineInputFingerprintHash: "1".repeat(64),
      rerunInputFingerprintHash: "1".repeat(64),
      baselineResultHash: "2".repeat(64),
      rerunResultHash: "2".repeat(64),
    },
    correctionCutoff: {
      historicalCutoff: "2026-07-31T06:00:00.000Z",
      beforeCorrectionRunId: "run:before-correction",
      afterCorrectionRunId: "run:after-correction",
      beforeHistoricalResultHash: "3".repeat(64),
      afterHistoricalResultHash: "3".repeat(64),
      beforeCurrentRevisionHeadHash: "4".repeat(64),
      afterCurrentRevisionHeadHash: "5".repeat(64),
    },
  };
}

{
  const record = buildFoundationPilotHashWitness(input());
  assert.equal(record.sameInputReplay.status, "verified_same_input_same_result_hash_unproven_realness");
  assert.equal(record.correctionCutoff.status, "verified_historical_cutoff_hash_unchanged_unproven_realness");
  assert.equal(record.sameInputHashEqualityVerified, true);
  assert.equal(record.correctionCutoffHashImmutabilityVerified, true);
  assert.equal(record.witnessStatus, "hash_witness_complete_unproven_realness");
  assert.equal(record.realEvidenceProven, false);
  assert.equal(record.deterministicReplayProven, false);
  assert.equal(record.correctionCutoffImmutabilityProven, false);
  assert.equal(record.milestoneGreenAuthorized, false);
  assert.equal(record.automaticTradingAuthorized, false);
  assert.equal(record.proofPromotionAuthorized, false);
  assert.equal(record.governedStoreAppendAuthorized, false);
  assert.match(record.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(record.blockers.includes("hash_equality_does_not_prove_real_evidence"));
  const markdown = renderFoundationPilotHashWitness(record);
  assert.match(markdown, /realEvidenceProven: false/);
  assert.match(markdown, /does not prove that the inputs came from real/);
  console.log("foundation-pilot-hash-witness: successful hash relationships remain unproven-realness OK");
}

{
  const value = input();
  value.target.informationCutoff = "2026-07-31T15:00:00+09:00";
  value.correctionCutoff.historicalCutoff = "2026-07-31T15:00:00+09:00";
  value.generatedAt = "2026-08-07T10:40:00+09:00";
  value.witnessedAt = "2026-08-07T10:39:00+09:00";
  const record = buildFoundationPilotHashWitness(value);
  assert.equal(record.target.informationCutoff, "2026-07-31T06:00:00.000Z");
  assert.equal(record.correctionCutoff.historicalCutoff, "2026-07-31T06:00:00.000Z");
  assert.equal(record.generatedAt, "2026-08-07T01:40:00.000Z");
  assert.equal(record.witnessedAt, "2026-08-07T01:39:00.000Z");
  console.log("foundation-pilot-hash-witness: explicit offsets canonicalize deterministically OK");
}

{
  const value = input();
  value.generatedAt = "2026-08-07T01:40:00.123456788Z";
  value.witnessedAt = "2026-08-07T01:40:00.123456789Z";
  assert.throws(
    () => buildFoundationPilotHashWitness(value),
    /witnessedAt must not be after generatedAt/,
  );
  console.log("foundation-pilot-hash-witness: sub-millisecond witness chronology blocked OK");
}

{
  const value = input();
  value.target.informationCutoff = "2026-07-31T06:00:00";
  assert.throws(() => buildFoundationPilotHashWitness(value), /explicit timezone/);
  console.log("foundation-pilot-hash-witness: timezone-less cutoff blocked OK");
}

{
  const value = input();
  value.witnessedAt = "2026-02-31T01:39:00Z";
  assert.throws(() => buildFoundationPilotHashWitness(value), /valid Gregorian ISO-8601 timestamp/);
  console.log("foundation-pilot-hash-witness: impossible witness time blocked OK");
}

{
  const value = input();
  value.generatedAt = "2026-08-07T01:40:00+15:00";
  assert.throws(() => buildFoundationPilotHashWitness(value), /timezone offset within ±14:00/);
  console.log("foundation-pilot-hash-witness: invalid timezone offset blocked OK");
}

{
  const value = input();
  value.sameInputReplay.rerunInputFingerprintHash = "6".repeat(64);
  const record = buildFoundationPilotHashWitness(value);
  assert.equal(record.sameInputReplay.status, "failed_input_fingerprint_mismatch");
  assert.equal(record.sameInputHashEqualityVerified, false);
  assert.equal(record.witnessStatus, "hash_witness_failed");
  console.log("foundation-pilot-hash-witness: input fingerprint mismatch blocked OK");
}

{
  const value = input();
  value.sameInputReplay.rerunResultHash = "6".repeat(64);
  const record = buildFoundationPilotHashWitness(value);
  assert.equal(record.sameInputReplay.status, "failed_result_hash_mismatch");
  assert.equal(record.sameInputHashEqualityVerified, false);
  console.log("foundation-pilot-hash-witness: same-input result mismatch blocked OK");
}

{
  const value = input();
  value.correctionCutoff.afterCurrentRevisionHeadHash = value.correctionCutoff.beforeCurrentRevisionHeadHash;
  const record = buildFoundationPilotHashWitness(value);
  assert.equal(record.correctionCutoff.status, "failed_no_correction_state_change");
  assert.equal(record.correctionCutoffHashImmutabilityVerified, false);
  console.log("foundation-pilot-hash-witness: correction proof requires state change OK");
}

{
  const value = input();
  value.correctionCutoff.afterHistoricalResultHash = "6".repeat(64);
  const record = buildFoundationPilotHashWitness(value);
  assert.equal(record.correctionCutoff.status, "failed_historical_cutoff_hash_changed");
  assert.equal(record.correctionCutoffHashImmutabilityVerified, false);
  console.log("foundation-pilot-hash-witness: historical cutoff hash mutation blocked OK");
}

{
  const value = input();
  value.target.informationCutoff = "2026-07-31T06:00:00.123456788Z";
  value.correctionCutoff.historicalCutoff = "2026-07-31T06:00:00.123456789Z";
  assert.throws(
    () => buildFoundationPilotHashWitness(value),
    /must equal target\.informationCutoff/,
  );
  console.log("foundation-pilot-hash-witness: sub-millisecond cutoff mismatch blocked OK");
}

{
  const value = input();
  value.correctionCutoff.historicalCutoff = "2026-07-30T06:00:00.000Z";
  assert.throws(() => buildFoundationPilotHashWitness(value), /must equal target\.informationCutoff/);
  console.log("foundation-pilot-hash-witness: cutoff target mismatch blocked OK");
}

{
  const value = input();
  value.sameInputReplay.rerunRunId = value.sameInputReplay.baselineRunId;
  assert.throws(() => buildFoundationPilotHashWitness(value), /two distinct run IDs/);
  console.log("foundation-pilot-hash-witness: duplicate replay run ID blocked OK");
}

{
  const value = input();
  value.correctionCutoff.afterCorrectionRunId = value.correctionCutoff.beforeCorrectionRunId;
  assert.throws(() => buildFoundationPilotHashWitness(value), /distinct before\/after run IDs/);
  console.log("foundation-pilot-hash-witness: duplicate correction run ID blocked OK");
}

{
  const value = input();
  value.sameInputReplay.baselineResultHash = "not-a-hash";
  assert.throws(() => buildFoundationPilotHashWitness(value), /must be a SHA-256 hash/);
  console.log("foundation-pilot-hash-witness: malformed hash blocked OK");
}

console.log("foundation-pilot-hash-witness.test.ts passed");
