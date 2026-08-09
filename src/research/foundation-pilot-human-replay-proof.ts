import { createHash } from "node:crypto";
import type { FoundationPilotHashWitnessConformanceAudit } from "./foundation-pilot-hash-witness-conformance.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

type JsonObject = Record<string, unknown>;
const HASH_RE = /^[a-f0-9]{64}$/;

export type FoundationPilotHumanReplayProofConfirmations = {
  fourDistinctRealLocalExecutionsConfirmed: boolean;
  sameInputPinsActuallyIdentical: boolean;
  historicalBaselineExecutedBeforeCorrectionRetrieval: boolean;
  correctionRevisionIsActualObservedSourceChange: boolean;
  postCorrectionHistoricalReplayExecutedAfterCorrectionRetrieval: boolean;
  noSyntheticFixtureOrMockArtifactsUsed: boolean;
  intendedLocalPipelineAndEnvironmentConfirmed: boolean;
};

export type FoundationPilotHumanReplayProofRecord = {
  schemaVersion: 1;
  sourceConformanceFile: string;
  sourceConformanceHash: string;
  target: FoundationPilotHashWitnessConformanceAudit["target"];
  sourceWitnessHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string | null;
  confirmations: FoundationPilotHumanReplayProofConfirmations;
  humanNotes: string;
  reviewStatus: "draft_human_input" | "complete_human_replay_proof";
  realLocalExecutionConfirmed: boolean;
  deterministicReplayProven: boolean;
  correctionCutoffImmutabilityProven: boolean;
  realEvidenceProven: false;
  milestoneGreenAuthorized: false;
  automaticTradingAuthorized: false;
  proofPromotionAuthorized: false;
  governedStoreAppendAuthorized: false;
  blockers: string[];
  recordHash: string;
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

function required(value: unknown, field: string): string {
  const result = value === null || value === undefined ? "" : String(value).trim();
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function hash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (
    result === "."
    || result === ".."
    || result.includes("/")
    || result.includes("\\")
    || !result.endsWith(".json")
  ) throw new Error(`${field} must be a local JSON basename`);
  return result;
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function verifyConformance(value: FoundationPilotHashWitnessConformanceAudit): string {
  if (
    value.schemaVersion !== 1
    || value.conformanceStatus !== "passed"
    || value.sameInput.status !== "conformant"
    || value.correctionCutoff.status !== "conformant"
    || value.humanRealLocalExecutionConfirmationRequired !== true
    || value.realLocalExecutionConfirmed !== false
    || value.realEvidenceProven !== false
    || value.deterministicReplayProven !== false
    || value.correctionCutoffImmutabilityProven !== false
    || value.milestoneGreenAuthorized !== false
    || value.automaticTradingAuthorized !== false
    || value.proofPromotionAuthorized !== false
    || value.governedStoreAppendAuthorized !== false
  ) throw new Error("conformance safety/status boundary is invalid");
  const expected = hash(value.contentHash, "conformance.contentHash");
  const { contentHash: _ignored, ...withoutHash } = value;
  if (digest(withoutHash) !== expected) throw new Error("conformance.contentHash mismatch");
  timestamp(value.generatedAt, "conformance.generatedAt");
  hash(value.sourceWitnessHash, "conformance.sourceWitnessHash");
  return expected;
}

function emptyConfirmations(): FoundationPilotHumanReplayProofConfirmations {
  return {
    fourDistinctRealLocalExecutionsConfirmed: false,
    sameInputPinsActuallyIdentical: false,
    historicalBaselineExecutedBeforeCorrectionRetrieval: false,
    correctionRevisionIsActualObservedSourceChange: false,
    postCorrectionHistoricalReplayExecutedAfterCorrectionRetrieval: false,
    noSyntheticFixtureOrMockArtifactsUsed: false,
    intendedLocalPipelineAndEnvironmentConfirmed: false,
  };
}

function allConfirmed(value: FoundationPilotHumanReplayProofConfirmations): boolean {
  return Object.values(value).every(item => item === true);
}

function parseConfirmations(value: unknown): FoundationPilotHumanReplayProofConfirmations {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("reviewInput.confirmations must be an object");
  }
  const input = value as JsonObject;
  const fields = Object.keys(emptyConfirmations()) as Array<keyof FoundationPilotHumanReplayProofConfirmations>;
  const result = emptyConfirmations();
  for (const field of fields) {
    if (typeof input[field] !== "boolean") {
      throw new Error(`reviewInput.confirmations.${field} must be boolean`);
    }
    result[field] = input[field] as boolean;
  }
  return result;
}

function immutableSourceShape(record: FoundationPilotHumanReplayProofRecord): unknown {
  return {
    schemaVersion: record.schemaVersion,
    sourceConformanceFile: record.sourceConformanceFile,
    sourceConformanceHash: record.sourceConformanceHash,
    target: record.target,
    sourceWitnessHash: record.sourceWitnessHash,
    generatedAt: record.generatedAt,
    realEvidenceProven: record.realEvidenceProven,
    milestoneGreenAuthorized: record.milestoneGreenAuthorized,
    automaticTradingAuthorized: record.automaticTradingAuthorized,
    proofPromotionAuthorized: record.proofPromotionAuthorized,
    governedStoreAppendAuthorized: record.governedStoreAppendAuthorized,
  };
}

export function buildFoundationPilotHumanReplayProofTemplate(input: {
  conformance: FoundationPilotHashWitnessConformanceAudit;
  sourceConformanceFile: string;
  generatedAt?: string;
}): FoundationPilotHumanReplayProofRecord {
  const sourceConformanceHash = verifyConformance(input.conformance);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    sourceConformanceFile: localJsonBasename(input.sourceConformanceFile, "sourceConformanceFile"),
    sourceConformanceHash,
    target: input.conformance.target,
    sourceWitnessHash: input.conformance.sourceWitnessHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    confirmations: emptyConfirmations(),
    humanNotes: "",
    reviewStatus: "draft_human_input" as const,
    realLocalExecutionConfirmed: false,
    deterministicReplayProven: false,
    correctionCutoffImmutabilityProven: false,
    realEvidenceProven: false as const,
    milestoneGreenAuthorized: false as const,
    automaticTradingAuthorized: false as const,
    proofPromotionAuthorized: false as const,
    governedStoreAppendAuthorized: false as const,
    blockers: [
      "human_confirmation_of_real_local_execution_sequence_required",
      "real_evidence_gate_remains_separate",
      "foundation_milestone_green_not_authorized",
      "proof_promotion_not_authorized",
      "governed_store_append_not_authorized",
      "automatic_trading_not_authorized",
    ].sort(),
  };
  return { ...base, recordHash: digest(base) };
}

export function finalizeFoundationPilotHumanReplayProof(input: {
  conformance: FoundationPilotHashWitnessConformanceAudit;
  sourceConformanceFile: string;
  editedReviewInput: FoundationPilotHumanReplayProofRecord;
  generatedAt?: string;
}): FoundationPilotHumanReplayProofRecord {
  const sourceConformanceHash = verifyConformance(input.conformance);
  const sourceConformanceFile = localJsonBasename(input.sourceConformanceFile, "sourceConformanceFile");
  const edited = input.editedReviewInput;
  const originalTemplate = buildFoundationPilotHumanReplayProofTemplate({
    conformance: input.conformance,
    sourceConformanceFile,
    generatedAt: edited.generatedAt,
  });
  if (JSON.stringify(canonical(immutableSourceShape(edited))) !== JSON.stringify(canonical(immutableSourceShape(originalTemplate)))) {
    throw new Error("reviewInput immutable source/safety fields changed");
  }
  if (edited.sourceConformanceHash !== sourceConformanceHash) throw new Error("reviewInput sourceConformanceHash mismatch");
  if (edited.reviewStatus !== "draft_human_input") throw new Error("reviewInput must remain draft_human_input before finalization");
  if (
    edited.realLocalExecutionConfirmed !== false
    || edited.deterministicReplayProven !== false
    || edited.correctionCutoffImmutabilityProven !== false
  ) throw new Error("reviewInput proof flags must remain false before finalization");

  const reviewer = required(edited.reviewer, "reviewInput.reviewer");
  const reviewedAt = timestamp(edited.reviewedAt, "reviewInput.reviewedAt");
  const confirmations = parseConfirmations(edited.confirmations);
  if (!allConfirmed(confirmations)) {
    throw new Error("reviewInput requires all real-local execution confirmations");
  }
  const humanNotes = required(edited.humanNotes, "reviewInput.humanNotes");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    sourceConformanceFile,
    sourceConformanceHash,
    target: input.conformance.target,
    sourceWitnessHash: input.conformance.sourceWitnessHash,
    generatedAt,
    reviewer,
    reviewedAt,
    confirmations,
    humanNotes,
    reviewStatus: "complete_human_replay_proof" as const,
    realLocalExecutionConfirmed: true,
    deterministicReplayProven: true,
    correctionCutoffImmutabilityProven: true,
    realEvidenceProven: false as const,
    milestoneGreenAuthorized: false as const,
    automaticTradingAuthorized: false as const,
    proofPromotionAuthorized: false as const,
    governedStoreAppendAuthorized: false as const,
    blockers: sorted([
      "real_evidence_gate_remains_separate",
      "foundation_milestone_requires_all_other_real_pilot_gates",
      "proof_promotion_not_authorized",
      "governed_store_append_not_authorized",
      "automatic_trading_not_authorized",
    ]),
  };
  return { ...base, recordHash: digest(base) };
}

export function renderFoundationPilotHumanReplayProof(record: FoundationPilotHumanReplayProofRecord): string {
  const lines = [
    "# Foundation pilot human replay proof",
    "",
    `- generatedAt: ${record.generatedAt}`,
    `- reviewer: ${record.reviewer || "pending"}`,
    `- reviewedAt: ${record.reviewedAt ?? "pending"}`,
    `- sourceConformanceFile: ${record.sourceConformanceFile}`,
    `- sourceConformanceHash: ${record.sourceConformanceHash}`,
    `- sourceWitnessHash: ${record.sourceWitnessHash}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- realLocalExecutionConfirmed: ${record.realLocalExecutionConfirmed}`,
    `- deterministicReplayProven: ${record.deterministicReplayProven}`,
    `- correctionCutoffImmutabilityProven: ${record.correctionCutoffImmutabilityProven}`,
    "- realEvidenceProven: false",
    "- milestoneGreenAuthorized: false",
    "- automaticTradingAuthorized: false",
    "- proofPromotionAuthorized: false",
    "- governedStoreAppendAuthorized: false",
    `- recordHash: ${record.recordHash}`,
    "",
    "## Human confirmations",
    "",
    ...Object.entries(record.confirmations).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Human confirmation completes only the two replay-proof claims. It does not establish that every Evidence/Package/price/identity input satisfies the full real Foundation milestone.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}