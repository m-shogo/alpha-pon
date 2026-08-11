import { createHash } from "node:crypto";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";
import type { FoundationPilotTarget } from "./foundation-pilot-structural-status.js";

type JsonObject = Record<string, unknown>;
const HASH_RE = /^[a-f0-9]{64}$/;

export type FoundationSameInputHashWitnessStatus =
  | "verified_same_input_same_result_hash_unproven_realness"
  | "failed_input_fingerprint_mismatch"
  | "failed_result_hash_mismatch";

export type FoundationCorrectionCutoffHashWitnessStatus =
  | "verified_historical_cutoff_hash_unchanged_unproven_realness"
  | "failed_no_correction_state_change"
  | "failed_historical_result_hash_changed";

export type FoundationPilotHashWitnessRecord = {
  schemaVersion: 1;
  target: FoundationPilotTarget;
  generatedAt: string;
  witnessedBy: string;
  witnessedAt: string;
  sameInputReplay: {
    baselineRunId: string;
    rerunRunId: string;
    baselineInputFingerprintHash: string;
    rerunInputFingerprintHash: string;
    baselineResultHash: string;
    rerunResultHash: string;
    status: FoundationSameInputHashWitnessStatus;
  };
  correctionCutoff: {
    historicalCutoff: string;
    beforeCorrectionRunId: string;
    afterCorrectionRunId: string;
    beforeHistoricalResultHash: string;
    afterHistoricalResultHash: string;
    beforeCurrentRevisionHeadHash: string;
    afterCurrentRevisionHeadHash: string;
    status: FoundationCorrectionCutoffHashWitnessStatus;
  };
  sameInputHashEqualityVerified: boolean;
  correctionCutoffHashImmutabilityVerified: boolean;
  witnessStatus: "hash_witness_complete_unproven_realness" | "hash_witness_failed";
  realEvidenceProven: false;
  deterministicReplayProven: false;
  correctionCutoffImmutabilityProven: false;
  milestoneGreenAuthorized: false;
  automaticTradingAuthorized: false;
  proofPromotionAuthorized: false;
  governedStoreAppendAuthorized: false;
  blockers: string[];
  contentHash: string;
};

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

function text(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${field} must be non-empty`);
  return result;
}

function timestamp(value: string, field: string): string {
  const result = text(value, field);
  const instantMs = parseExplicitIso8601Instant(result, field);
  return new Date(instantMs).toISOString();
}

function hash(value: string, field: string): string {
  const result = text(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function target(input: FoundationPilotTarget): FoundationPilotTarget {
  return {
    candidateId: text(input.candidateId, "target.candidateId"),
    listedSecurityEntityId: text(input.listedSecurityEntityId, "target.listedSecurityEntityId"),
    issuerEntityId: text(input.issuerEntityId, "target.issuerEntityId"),
    informationCutoff: timestamp(input.informationCutoff, "target.informationCutoff"),
  };
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function buildFoundationPilotHashWitness(input: {
  target: FoundationPilotTarget;
  generatedAt?: string;
  witnessedBy: string;
  witnessedAt: string;
  sameInputReplay: {
    baselineRunId: string;
    rerunRunId: string;
    baselineInputFingerprintHash: string;
    rerunInputFingerprintHash: string;
    baselineResultHash: string;
    rerunResultHash: string;
  };
  correctionCutoff: {
    historicalCutoff: string;
    beforeCorrectionRunId: string;
    afterCorrectionRunId: string;
    beforeHistoricalResultHash: string;
    afterHistoricalResultHash: string;
    beforeCurrentRevisionHeadHash: string;
    afterCurrentRevisionHeadHash: string;
  };
}): FoundationPilotHashWitnessRecord {
  const normalizedTarget = target(input.target);
  const generatedAtSource = input.generatedAt ?? new Date().toISOString();
  const generatedAt = timestamp(generatedAtSource, "generatedAt");
  const witnessedBy = text(input.witnessedBy, "witnessedBy");
  const witnessedAtSource = text(input.witnessedAt, "witnessedAt");
  const witnessedAt = timestamp(witnessedAtSource, "witnessedAt");
  if (
    compareExplicitIso8601Instants(
      witnessedAtSource,
      generatedAtSource,
      "witnessedAt",
      "generatedAt",
    ) > 0
  ) {
    throw new Error("witnessedAt must not be after generatedAt");
  }

  const sameInput = {
    baselineRunId: text(input.sameInputReplay.baselineRunId, "sameInputReplay.baselineRunId"),
    rerunRunId: text(input.sameInputReplay.rerunRunId, "sameInputReplay.rerunRunId"),
    baselineInputFingerprintHash: hash(
      input.sameInputReplay.baselineInputFingerprintHash,
      "sameInputReplay.baselineInputFingerprintHash",
    ),
    rerunInputFingerprintHash: hash(
      input.sameInputReplay.rerunInputFingerprintHash,
      "sameInputReplay.rerunInputFingerprintHash",
    ),
    baselineResultHash: hash(input.sameInputReplay.baselineResultHash, "sameInputReplay.baselineResultHash"),
    rerunResultHash: hash(input.sameInputReplay.rerunResultHash, "sameInputReplay.rerunResultHash"),
  };
  if (sameInput.baselineRunId === sameInput.rerunRunId) {
    throw new Error("sameInputReplay requires two distinct run IDs");
  }
  const sameInputStatus: FoundationSameInputHashWitnessStatus =
    sameInput.baselineInputFingerprintHash !== sameInput.rerunInputFingerprintHash
      ? "failed_input_fingerprint_mismatch"
      : sameInput.baselineResultHash !== sameInput.rerunResultHash
        ? "failed_result_hash_mismatch"
        : "verified_same_input_same_result_hash_unproven_realness";

  const correction = {
    historicalCutoff: timestamp(input.correctionCutoff.historicalCutoff, "correctionCutoff.historicalCutoff"),
    beforeCorrectionRunId: text(input.correctionCutoff.beforeCorrectionRunId, "correctionCutoff.beforeCorrectionRunId"),
    afterCorrectionRunId: text(input.correctionCutoff.afterCorrectionRunId, "correctionCutoff.afterCorrectionRunId"),
    beforeHistoricalResultHash: hash(
      input.correctionCutoff.beforeHistoricalResultHash,
      "correctionCutoff.beforeHistoricalResultHash",
    ),
    afterHistoricalResultHash: hash(
      input.correctionCutoff.afterHistoricalResultHash,
      "correctionCutoff.afterHistoricalResultHash",
    ),
    beforeCurrentRevisionHeadHash: hash(
      input.correctionCutoff.beforeCurrentRevisionHeadHash,
      "correctionCutoff.beforeCurrentRevisionHeadHash",
    ),
    afterCurrentRevisionHeadHash: hash(
      input.correctionCutoff.afterCurrentRevisionHeadHash,
      "correctionCutoff.afterCurrentRevisionHeadHash",
    ),
  };
  if (
    compareExplicitIso8601Instants(
      input.correctionCutoff.historicalCutoff,
      input.target.informationCutoff,
      "correctionCutoff.historicalCutoff",
      "target.informationCutoff",
    ) !== 0
  ) {
    throw new Error("correctionCutoff.historicalCutoff must equal target.informationCutoff");
  }
  if (correction.beforeCorrectionRunId === correction.afterCorrectionRunId) {
    throw new Error("correctionCutoff requires distinct before/after run IDs");
  }
  const correctionStatus: FoundationCorrectionCutoffHashWitnessStatus =
    correction.beforeCurrentRevisionHeadHash === correction.afterCurrentRevisionHeadHash
      ? "failed_no_correction_state_change"
      : correction.beforeHistoricalResultHash !== correction.afterHistoricalResultHash
        ? "failed_historical_result_hash_changed"
        : "verified_historical_cutoff_hash_unchanged_unproven_realness";

  const sameInputHashEqualityVerified = sameInputStatus === "verified_same_input_same_result_hash_unproven_realness";
  const correctionCutoffHashImmutabilityVerified =
    correctionStatus === "verified_historical_cutoff_hash_unchanged_unproven_realness";
  const witnessStatus = sameInputHashEqualityVerified && correctionCutoffHashImmutabilityVerified
    ? "hash_witness_complete_unproven_realness" as const
    : "hash_witness_failed" as const;
  const blockers = sorted([
    ...(!sameInputHashEqualityVerified ? ["same_input_same_result_hash_not_verified"] : []),
    ...(!correctionCutoffHashImmutabilityVerified ? ["historical_cutoff_hash_immutability_not_verified"] : []),
    "hash_equality_does_not_prove_real_evidence",
    "real_data_attestation_and_source_review_still_required",
    "milestone_green_requires_separate_review",
    "automatic_trading_not_authorized",
  ]);

  const base = {
    schemaVersion: 1 as const,
    target: normalizedTarget,
    generatedAt,
    witnessedBy,
    witnessedAt,
    sameInputReplay: { ...sameInput, status: sameInputStatus },
    correctionCutoff: { ...correction, status: correctionStatus },
    sameInputHashEqualityVerified,
    correctionCutoffHashImmutabilityVerified,
    witnessStatus,
    realEvidenceProven: false as const,
    deterministicReplayProven: false as const,
    correctionCutoffImmutabilityProven: false as const,
    milestoneGreenAuthorized: false as const,
    automaticTradingAuthorized: false as const,
    proofPromotionAuthorized: false as const,
    governedStoreAppendAuthorized: false as const,
    blockers,
  };
  return { ...base, contentHash: digest(base) };
}

export function renderFoundationPilotHashWitness(record: FoundationPilotHashWitnessRecord): string {
  const lines = [
    "# Foundation pilot hash witness",
    "",
    `- generatedAt: ${record.generatedAt}`,
    `- witnessedBy: ${record.witnessedBy}`,
    `- witnessedAt: ${record.witnessedAt}`,
    `- candidateId: ${record.target.candidateId}`,
    `- listedSecurityEntityId: ${record.target.listedSecurityEntityId}`,
    `- issuerEntityId: ${record.target.issuerEntityId}`,
    `- informationCutoff: ${record.target.informationCutoff}`,
    `- sameInputReplay.status: ${record.sameInputReplay.status}`,
    `- correctionCutoff.status: ${record.correctionCutoff.status}`,
    `- sameInputHashEqualityVerified: ${record.sameInputHashEqualityVerified}`,
    `- correctionCutoffHashImmutabilityVerified: ${record.correctionCutoffHashImmutabilityVerified}`,
    `- witnessStatus: ${record.witnessStatus}`,
    `- contentHash: ${record.contentHash}`,
    "- realEvidenceProven: false",
    "- deterministicReplayProven: false",
    "- correctionCutoffImmutabilityProven: false",
    "- milestoneGreenAuthorized: false",
    "- automaticTradingAuthorized: false",
    "- proofPromotionAuthorized: false",
    "- governedStoreAppendAuthorized: false",
    "",
    "This record verifies only the supplied SHA-256 relationships. It does not prove that the inputs came from real, licensed, correctly reviewed market evidence.",
    "",
    "## Blockers",
    "",
    ...record.blockers.map(blocker => `- ${blocker}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
