import { createHash } from "node:crypto";
import {
  computeDocumentRevisionHash,
  type DocumentRevisionRecord,
} from "./document-revision-diff.js";
import {
  computeFoundationDecisionHash,
  type FoundationDecisionIntegrationRecord,
} from "./foundation-decision-integration.js";
import {
  buildFoundationPilotHashWitness,
  type FoundationPilotHashWitnessRecord,
} from "./foundation-pilot-hash-witness.js";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";
import { stableStringify } from "./schema.js";

type JsonObject = Record<string, unknown>;
const HASH_RE = /^[a-f0-9]{64}$/;
const CORRECTION_KINDS = new Set<DocumentRevisionRecord["revisionKind"]>([
  "amendment",
  "correction",
  "restatement",
  "replacement",
  "withdrawal",
]);

export type FoundationPilotProofRun = {
  schemaVersion: 1;
  runId: string;
  capturedAt: string;
  sourceDecisionStore: "research/foundation_decisions/decisions.jsonl";
  decisionId: string;
  decisionContentHash: string;
  decisionInputFingerprint: string;
  decision: FoundationDecisionIntegrationRecord;
  automaticTradingAuthorized: false;
  envelopeHash: string;
};

export type FoundationPilotHashWitnessConformanceAudit = {
  schemaVersion: 1;
  target: FoundationPilotHashWitnessRecord["target"];
  generatedAt: string;
  sourceWitnessHash: string;
  sameInput: {
    runIdsMatchWitness: boolean;
    fingerprintsMatchWitness: boolean;
    resultHashesMatchWitness: boolean;
    canonicalDecisionsMatch: boolean;
    status: "conformant" | "nonconformant";
  };
  correctionCutoff: {
    runIdsMatchWitness: boolean;
    historicalResultHashesMatchWitness: boolean;
    priorRevisionId: string;
    priorRevisionHash: string;
    correctionRevisionId: string;
    correctionRevisionHash: string;
    revisionHeadHashesMatchWitness: boolean;
    directRevisionChainVerified: boolean;
    correctionObservedAfterHistoricalCutoff: boolean;
    baselineCapturedBeforeCorrectionRetrieval: boolean;
    postRunCapturedAfterCorrectionRetrieval: boolean;
    canonicalHistoricalDecisionsMatch: boolean;
    status: "conformant" | "nonconformant";
  };
  conformanceStatus: "passed" | "failed";
  humanRealLocalExecutionConfirmationRequired: true;
  realLocalExecutionConfirmed: false;
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

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
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

function compareInstants(left: string, right: string, leftField: string, rightField: string): -1 | 0 | 1 {
  return compareExplicitIso8601Instants(left, right, leftField, rightField);
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function decisionInputShape(record: FoundationDecisionIntegrationRecord): unknown {
  const {
    status: _status,
    eligibleForRecommendationCandidate: _eligible,
    blockers: _blockers,
    contentHash: _contentHash,
    ...input
  } = record;
  return input;
}

export function computeFoundationPilotDecisionInputFingerprint(
  record: FoundationDecisionIntegrationRecord,
): string {
  return fingerprint(decisionInputShape(record));
}

function verifyDecision(record: FoundationDecisionIntegrationRecord, field: string): void {
  if (record.schemaVersion !== 1) throw new Error(`${field}.schemaVersion is unsupported`);
  if (record.automaticTradingAuthorized !== false) {
    throw new Error(`${field}.automaticTradingAuthorized must remain false`);
  }
  if (hash(record.contentHash, `${field}.contentHash`) !== computeFoundationDecisionHash(record)) {
    throw new Error(`${field}.contentHash mismatch`);
  }
  timestamp(record.issuedAt, `${field}.issuedAt`);
  timestamp(record.informationCutoff, `${field}.informationCutoff`);
}

export function buildFoundationPilotProofRun(input: {
  runId: string;
  capturedAt?: string;
  decision: FoundationDecisionIntegrationRecord;
}): FoundationPilotProofRun {
  const runId = required(input.runId, "runId");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(runId)) {
    throw new Error("runId contains unsupported characters");
  }
  verifyDecision(input.decision, "decision");
  const capturedAt = input.capturedAt ? timestamp(input.capturedAt, "capturedAt") : new Date().toISOString();
  if (compareInstants(capturedAt, input.decision.issuedAt, "capturedAt", "decision.issuedAt") < 0) {
    throw new Error("capturedAt must not precede decision.issuedAt");
  }
  const base = {
    schemaVersion: 1 as const,
    runId,
    capturedAt,
    sourceDecisionStore: "research/foundation_decisions/decisions.jsonl" as const,
    decisionId: input.decision.decisionId,
    decisionContentHash: input.decision.contentHash,
    decisionInputFingerprint: computeFoundationPilotDecisionInputFingerprint(input.decision),
    decision: input.decision,
    automaticTradingAuthorized: false as const,
  };
  return { ...base, envelopeHash: digest(base) };
}

function verifyRun(run: FoundationPilotProofRun, field: string): void {
  if (run.schemaVersion !== 1 || run.sourceDecisionStore !== "research/foundation_decisions/decisions.jsonl") {
    throw new Error(`${field} envelope is unsupported`);
  }
  if (run.automaticTradingAuthorized !== false) throw new Error(`${field} trading boundary is invalid`);
  const { envelopeHash, ...withoutHash } = run;
  if (hash(envelopeHash, `${field}.envelopeHash`) !== digest(withoutHash)) {
    throw new Error(`${field}.envelopeHash mismatch`);
  }
  verifyDecision(run.decision, `${field}.decision`);
  if (run.decisionId !== run.decision.decisionId) throw new Error(`${field}.decisionId mismatch`);
  if (run.decisionContentHash !== run.decision.contentHash) throw new Error(`${field}.decisionContentHash mismatch`);
  if (run.decisionInputFingerprint !== computeFoundationPilotDecisionInputFingerprint(run.decision)) {
    throw new Error(`${field}.decisionInputFingerprint mismatch`);
  }
  timestamp(run.capturedAt, `${field}.capturedAt`);
}

function verifyWitness(witness: FoundationPilotHashWitnessRecord): void {
  const rebuilt = buildFoundationPilotHashWitness({
    target: witness.target,
    generatedAt: witness.generatedAt,
    witnessedBy: witness.witnessedBy,
    witnessedAt: witness.witnessedAt,
    sameInputReplay: {
      baselineRunId: witness.sameInputReplay.baselineRunId,
      rerunRunId: witness.sameInputReplay.rerunRunId,
      baselineInputFingerprintHash: witness.sameInputReplay.baselineInputFingerprintHash,
      rerunInputFingerprintHash: witness.sameInputReplay.rerunInputFingerprintHash,
      baselineResultHash: witness.sameInputReplay.baselineResultHash,
      rerunResultHash: witness.sameInputReplay.rerunResultHash,
    },
    correctionCutoff: {
      historicalCutoff: witness.correctionCutoff.historicalCutoff,
      beforeCorrectionRunId: witness.correctionCutoff.beforeCorrectionRunId,
      afterCorrectionRunId: witness.correctionCutoff.afterCorrectionRunId,
      beforeHistoricalResultHash: witness.correctionCutoff.beforeHistoricalResultHash,
      afterHistoricalResultHash: witness.correctionCutoff.afterHistoricalResultHash,
      beforeCurrentRevisionHeadHash: witness.correctionCutoff.beforeCurrentRevisionHeadHash,
      afterCurrentRevisionHeadHash: witness.correctionCutoff.afterCurrentRevisionHeadHash,
    },
  });
  if (stableStringify(rebuilt) !== stableStringify(witness)) {
    throw new Error("hashWitness does not conform to canonical FoundationPilotHashWitnessRecord");
  }
  if (
    !witness.sameInputHashEqualityVerified
    || !witness.correctionCutoffHashImmutabilityVerified
    || witness.witnessStatus !== "hash_witness_complete_unproven_realness"
  ) {
    throw new Error("hashWitness must have both hash relationships verified before conformance audit");
  }
  if (
    witness.realEvidenceProven !== false
    || witness.deterministicReplayProven !== false
    || witness.correctionCutoffImmutabilityProven !== false
    || witness.milestoneGreenAuthorized !== false
    || witness.automaticTradingAuthorized !== false
    || witness.proofPromotionAuthorized !== false
    || witness.governedStoreAppendAuthorized !== false
  ) {
    throw new Error("hashWitness authorization boundary is invalid");
  }
}

function assertRunTarget(
  run: FoundationPilotProofRun,
  target: FoundationPilotHashWitnessRecord["target"],
  field: string,
): void {
  if (
    run.decision.candidateId !== target.candidateId
    || run.decision.listedSecurityEntityId !== target.listedSecurityEntityId
    || run.decision.informationCutoff !== target.informationCutoff
  ) {
    throw new Error(`${field} does not match hash witness target`);
  }
}

function verifyRevision(record: DocumentRevisionRecord, field: string): void {
  if (record.schemaVersion !== 1) throw new Error(`${field}.schemaVersion is unsupported`);
  if (hash(record.contentHash, `${field}.contentHash`) !== computeDocumentRevisionHash(record)) {
    throw new Error(`${field}.contentHash mismatch`);
  }
  timestamp(record.observedAt, `${field}.observedAt`);
  timestamp(record.retrievedAt, `${field}.retrievedAt`);
  if (compareInstants(record.retrievedAt, record.observedAt, `${field}.retrievedAt`, `${field}.observedAt`) < 0) {
    throw new Error(`${field}.retrievedAt must not precede observedAt`);
  }
}

export function auditFoundationPilotHashWitnessConformance(input: {
  witness: FoundationPilotHashWitnessRecord;
  sameInputBaseline: FoundationPilotProofRun;
  sameInputRerun: FoundationPilotProofRun;
  historicalBaseline: FoundationPilotProofRun;
  historicalPostCorrection: FoundationPilotProofRun;
  priorRevision: DocumentRevisionRecord;
  correctionRevision: DocumentRevisionRecord;
  generatedAt?: string;
}): FoundationPilotHashWitnessConformanceAudit {
  verifyWitness(input.witness);
  const target = input.witness.target;
  const runs = [
    ["sameInputBaseline", input.sameInputBaseline],
    ["sameInputRerun", input.sameInputRerun],
    ["historicalBaseline", input.historicalBaseline],
    ["historicalPostCorrection", input.historicalPostCorrection],
  ] as const;
  const ids = new Set<string>();
  for (const [field, run] of runs) {
    verifyRun(run, field);
    assertRunTarget(run, target, field);
    if (ids.has(run.runId)) throw new Error(`duplicate proof runId ${run.runId}`);
    ids.add(run.runId);
  }
  verifyRevision(input.priorRevision, "priorRevision");
  verifyRevision(input.correctionRevision, "correctionRevision");
  if (!CORRECTION_KINDS.has(input.correctionRevision.revisionKind)) {
    throw new Error("correctionRevision must be correction-like");
  }
  if (input.correctionRevision.status === "rejected") throw new Error("correctionRevision must not be rejected");
  if (
    input.correctionRevision.supersedesRecordId !== input.priorRevision.recordId
    || input.correctionRevision.documentId !== input.priorRevision.documentId
    || input.correctionRevision.revisionSequence !== input.priorRevision.revisionSequence + 1
  ) {
    throw new Error("correctionRevision does not directly supersede priorRevision");
  }
  if (
    !input.correctionRevision.entityIds.includes(target.issuerEntityId)
    && !input.correctionRevision.entityIds.includes(target.listedSecurityEntityId)
  ) {
    throw new Error("correctionRevision does not reference hash witness target");
  }

  const sameInput = input.witness.sameInputReplay;
  const runIdsMatchWitness = sameInput.baselineRunId === input.sameInputBaseline.runId
    && sameInput.rerunRunId === input.sameInputRerun.runId;
  const fingerprintsMatchWitness = sameInput.baselineInputFingerprintHash === input.sameInputBaseline.decisionInputFingerprint
    && sameInput.rerunInputFingerprintHash === input.sameInputRerun.decisionInputFingerprint;
  const resultHashesMatchWitness = sameInput.baselineResultHash === input.sameInputBaseline.decisionContentHash
    && sameInput.rerunResultHash === input.sameInputRerun.decisionContentHash;
  const canonicalDecisionsMatch = stableStringify(input.sameInputBaseline.decision)
    === stableStringify(input.sameInputRerun.decision);
  const sameInputConformant = runIdsMatchWitness
    && fingerprintsMatchWitness
    && resultHashesMatchWitness
    && canonicalDecisionsMatch;

  const correction = input.witness.correctionCutoff;
  const correctionRunIdsMatchWitness = correction.beforeCorrectionRunId === input.historicalBaseline.runId
    && correction.afterCorrectionRunId === input.historicalPostCorrection.runId;
  const historicalResultHashesMatchWitness = correction.beforeHistoricalResultHash
    === input.historicalBaseline.decisionContentHash
    && correction.afterHistoricalResultHash === input.historicalPostCorrection.decisionContentHash;
  const revisionHeadHashesMatchWitness = correction.beforeCurrentRevisionHeadHash === input.priorRevision.contentHash
    && correction.afterCurrentRevisionHeadHash === input.correctionRevision.contentHash;
  const directRevisionChainVerified = input.correctionRevision.supersedesRecordId === input.priorRevision.recordId
    && input.correctionRevision.documentId === input.priorRevision.documentId
    && input.correctionRevision.revisionSequence === input.priorRevision.revisionSequence + 1;
  const correctionObservedAfterHistoricalCutoff = compareInstants(
    input.correctionRevision.observedAt,
    target.informationCutoff,
    "correctionRevision.observedAt",
    "target.informationCutoff",
  ) > 0;
  const baselineCapturedBeforeCorrectionRetrieval = compareInstants(
    input.historicalBaseline.capturedAt,
    input.correctionRevision.retrievedAt,
    "historicalBaseline.capturedAt",
    "correctionRevision.retrievedAt",
  ) < 0;
  const postRunCapturedAfterCorrectionRetrieval = compareInstants(
    input.historicalPostCorrection.capturedAt,
    input.correctionRevision.retrievedAt,
    "historicalPostCorrection.capturedAt",
    "correctionRevision.retrievedAt",
  ) >= 0;
  const canonicalHistoricalDecisionsMatch = stableStringify(input.historicalBaseline.decision)
    === stableStringify(input.historicalPostCorrection.decision);
  const correctionConformant = correctionRunIdsMatchWitness
    && historicalResultHashesMatchWitness
    && revisionHeadHashesMatchWitness
    && directRevisionChainVerified
    && correctionObservedAfterHistoricalCutoff
    && baselineCapturedBeforeCorrectionRetrieval
    && postRunCapturedAfterCorrectionRetrieval
    && canonicalHistoricalDecisionsMatch;

  const conformanceStatus = sameInputConformant && correctionConformant ? "passed" as const : "failed" as const;
  const blockers = sorted([
    ...(!sameInputConformant ? ["same_input_hash_witness_not_conformant_to_canonical_decisions"] : []),
    ...(!correctionConformant ? ["correction_hash_witness_not_conformant_to_canonical_revision_chain"] : []),
    "human_must_confirm_captures_followed_intended_real_local_pipeline_runs",
    "canonical_artifact_conformance_is_not_real_evidence_proof",
    "proof_promotion_requires_separate_human_finalization",
    "automatic_trading_not_authorized",
  ]);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    target,
    generatedAt,
    sourceWitnessHash: input.witness.contentHash,
    sameInput: {
      runIdsMatchWitness,
      fingerprintsMatchWitness,
      resultHashesMatchWitness,
      canonicalDecisionsMatch,
      status: sameInputConformant ? "conformant" as const : "nonconformant" as const,
    },
    correctionCutoff: {
      runIdsMatchWitness: correctionRunIdsMatchWitness,
      historicalResultHashesMatchWitness,
      priorRevisionId: input.priorRevision.documentRevisionId,
      priorRevisionHash: input.priorRevision.contentHash,
      correctionRevisionId: input.correctionRevision.documentRevisionId,
      correctionRevisionHash: input.correctionRevision.contentHash,
      revisionHeadHashesMatchWitness,
      directRevisionChainVerified,
      correctionObservedAfterHistoricalCutoff,
      baselineCapturedBeforeCorrectionRetrieval,
      postRunCapturedAfterCorrectionRetrieval,
      canonicalHistoricalDecisionsMatch,
      status: correctionConformant ? "conformant" as const : "nonconformant" as const,
    },
    conformanceStatus,
    humanRealLocalExecutionConfirmationRequired: true as const,
    realLocalExecutionConfirmed: false as const,
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

export function renderFoundationPilotHashWitnessConformance(
  audit: FoundationPilotHashWitnessConformanceAudit,
): string {
  return [
    "# Foundation pilot hash witness conformance",
    "",
    `- generatedAt: ${audit.generatedAt}`,
    `- sourceWitnessHash: ${audit.sourceWitnessHash}`,
    `- sameInput.status: ${audit.sameInput.status}`,
    `- correctionCutoff.status: ${audit.correctionCutoff.status}`,
    `- conformanceStatus: ${audit.conformanceStatus}`,
    `- contentHash: ${audit.contentHash}`,
    "- humanRealLocalExecutionConfirmationRequired: true",
    "- realLocalExecutionConfirmed: false",
    "- realEvidenceProven: false",
    "- deterministicReplayProven: false",
    "- correctionCutoffImmutabilityProven: false",
    "- milestoneGreenAuthorized: false",
    "- automaticTradingAuthorized: false",
    "- proofPromotionAuthorized: false",
    "- governedStoreAppendAuthorized: false",
    "",
    "Conformance proves only that PR #100 hash-witness fields correspond to the supplied canonical Decision run captures and canonical direct Document Revision chain. Human confirmation of the actual real-local execution sequence remains mandatory.",
    "",
    "## Blockers",
    "",
    ...audit.blockers.map(blocker => `- ${blocker}`),
    "",
  ].join("\n");
}
