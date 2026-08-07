import { createHash } from "node:crypto";
import {
  computeDocumentRevisionHash,
  type DocumentRevisionRecord,
} from "./document-revision-diff.js";
import {
  computeFoundationDecisionHash,
  type FoundationDecisionIntegrationRecord,
} from "./foundation-decision-integration.js";
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

export type FoundationPilotReplayProofTarget = {
  candidateId: string;
  listedSecurityEntityId: string;
  issuerEntityId: string;
  informationCutoff: string;
};

export type FoundationPilotReplayProofAudit = {
  schemaVersion: 1;
  target: FoundationPilotReplayProofTarget;
  generatedAt: string;
  sameInput: {
    baselineRunId: string;
    rerunRunId: string;
    inputFingerprintMatch: boolean;
    decisionContentHashMatch: boolean;
    canonicalDecisionMatch: boolean;
    machineStatus: "passed" | "failed";
  };
  correctionCutoff: {
    baselineRunId: string;
    postCorrectionRunId: string;
    correctionRevisionId: string;
    correctionRevisionHash: string;
    correctionRevisionKind: DocumentRevisionRecord["revisionKind"];
    correctionObservedAfterHistoricalCutoff: boolean;
    baselineCapturedBeforeCorrectionRetrieval: boolean;
    postRunCapturedAfterCorrectionRetrieval: boolean;
    historicalInputFingerprintMatch: boolean;
    historicalDecisionContentHashMatch: boolean;
    canonicalHistoricalDecisionMatch: boolean;
    machineStatus: "passed" | "failed";
  };
  machineProofStatus: "passed" | "failed";
  humanRealLocalExecutionConfirmationRequired: true;
  realLocalExecutionConfirmed: false;
  realEvidenceProven: false;
  deterministicReplayProven: false;
  correctionCutoffImmutabilityProven: false;
  milestoneGreenAuthorized: false;
  automaticTradingAuthorized: false;
  blockers: string[];
  proofHash: string;
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
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
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

export function computeFoundationDecisionInputFingerprint(
  record: FoundationDecisionIntegrationRecord,
): string {
  return fingerprint(decisionInputShape(record));
}

function verifyDecision(
  record: FoundationDecisionIntegrationRecord,
  field: string,
): void {
  if (record.schemaVersion !== 1) throw new Error(`${field}.schemaVersion is unsupported`);
  if (record.automaticTradingAuthorized !== false) {
    throw new Error(`${field}.automaticTradingAuthorized must remain false`);
  }
  if (hash(record.contentHash, `${field}.contentHash`) !== computeFoundationDecisionHash(record)) {
    throw new Error(`${field}.contentHash mismatch`);
  }
  timestamp(record.issuedAt, `${field}.issuedAt`);
  timestamp(record.informationCutoff, `${field}.informationCutoff`);
  timestamp(record.firstExecutableAt, `${field}.firstExecutableAt`);
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
  if (Date.parse(capturedAt) < Date.parse(input.decision.issuedAt)) {
    throw new Error("capturedAt must not precede decision.issuedAt");
  }
  const base = {
    schemaVersion: 1 as const,
    runId,
    capturedAt,
    sourceDecisionStore: "research/foundation_decisions/decisions.jsonl" as const,
    decisionId: input.decision.decisionId,
    decisionContentHash: input.decision.contentHash,
    decisionInputFingerprint: computeFoundationDecisionInputFingerprint(input.decision),
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
  if (run.decisionInputFingerprint !== computeFoundationDecisionInputFingerprint(run.decision)) {
    throw new Error(`${field}.decisionInputFingerprint mismatch`);
  }
  timestamp(run.capturedAt, `${field}.capturedAt`);
}

function assertTarget(
  run: FoundationPilotProofRun,
  target: FoundationPilotReplayProofTarget,
  field: string,
): void {
  if (
    run.decision.candidateId !== target.candidateId
    || run.decision.listedSecurityEntityId !== target.listedSecurityEntityId
    || run.decision.informationCutoff !== target.informationCutoff
  ) {
    throw new Error(`${field} does not match proof target`);
  }
}

function canonicalDecisionMatch(
  left: FoundationDecisionIntegrationRecord,
  right: FoundationDecisionIntegrationRecord,
): boolean {
  return stableStringify(left) === stableStringify(right);
}

function verifyCorrectionWitness(
  witness: DocumentRevisionRecord,
  target: FoundationPilotReplayProofTarget,
): void {
  if (witness.schemaVersion !== 1) throw new Error("correctionWitness.schemaVersion is unsupported");
  if (hash(witness.contentHash, "correctionWitness.contentHash") !== computeDocumentRevisionHash(witness)) {
    throw new Error("correctionWitness.contentHash mismatch");
  }
  if (!CORRECTION_KINDS.has(witness.revisionKind)) {
    throw new Error("correctionWitness must be a correction-like revision");
  }
  if (witness.status === "rejected") throw new Error("correctionWitness must not be rejected");
  if (witness.revisionSequence <= 1) throw new Error("correctionWitness.revisionSequence must be greater than 1");
  if (!witness.entityIds.includes(target.issuerEntityId) && !witness.entityIds.includes(target.listedSecurityEntityId)) {
    throw new Error("correctionWitness does not reference the proof target");
  }
  timestamp(witness.publishedAt, "correctionWitness.publishedAt");
  timestamp(witness.observedAt, "correctionWitness.observedAt");
  timestamp(witness.retrievedAt, "correctionWitness.retrievedAt");
  if (Date.parse(witness.retrievedAt) < Date.parse(witness.observedAt)) {
    throw new Error("correctionWitness.retrievedAt must not precede observedAt");
  }
}

export function auditFoundationPilotReplayProof(input: {
  target: FoundationPilotReplayProofTarget;
  sameInputBaseline: FoundationPilotProofRun;
  sameInputRerun: FoundationPilotProofRun;
  historicalBaseline: FoundationPilotProofRun;
  historicalPostCorrection: FoundationPilotProofRun;
  correctionWitness: DocumentRevisionRecord;
  generatedAt?: string;
}): FoundationPilotReplayProofAudit {
  const target = {
    candidateId: required(input.target.candidateId, "target.candidateId"),
    listedSecurityEntityId: required(input.target.listedSecurityEntityId, "target.listedSecurityEntityId"),
    issuerEntityId: required(input.target.issuerEntityId, "target.issuerEntityId"),
    informationCutoff: timestamp(input.target.informationCutoff, "target.informationCutoff"),
  };
  const runs = [
    ["sameInputBaseline", input.sameInputBaseline],
    ["sameInputRerun", input.sameInputRerun],
    ["historicalBaseline", input.historicalBaseline],
    ["historicalPostCorrection", input.historicalPostCorrection],
  ] as const;
  const runIds = new Set<string>();
  for (const [field, run] of runs) {
    verifyRun(run, field);
    assertTarget(run, target, field);
    if (runIds.has(run.runId)) throw new Error(`duplicate proof runId ${run.runId}`);
    runIds.add(run.runId);
  }
  verifyCorrectionWitness(input.correctionWitness, target);

  const inputFingerprintMatch = input.sameInputBaseline.decisionInputFingerprint
    === input.sameInputRerun.decisionInputFingerprint;
  const decisionContentHashMatch = input.sameInputBaseline.decisionContentHash
    === input.sameInputRerun.decisionContentHash;
  const sameCanonical = canonicalDecisionMatch(
    input.sameInputBaseline.decision,
    input.sameInputRerun.decision,
  );
  const sameInputMachineStatus = inputFingerprintMatch && decisionContentHashMatch && sameCanonical
    ? "passed" as const
    : "failed" as const;

  const correctionObservedAfterHistoricalCutoff = Date.parse(input.correctionWitness.observedAt)
    > Date.parse(target.informationCutoff);
  const baselineCapturedBeforeCorrectionRetrieval = Date.parse(input.historicalBaseline.capturedAt)
    < Date.parse(input.correctionWitness.retrievedAt);
  const postRunCapturedAfterCorrectionRetrieval = Date.parse(input.historicalPostCorrection.capturedAt)
    >= Date.parse(input.correctionWitness.retrievedAt);
  const historicalInputFingerprintMatch = input.historicalBaseline.decisionInputFingerprint
    === input.historicalPostCorrection.decisionInputFingerprint;
  const historicalDecisionContentHashMatch = input.historicalBaseline.decisionContentHash
    === input.historicalPostCorrection.decisionContentHash;
  const historicalCanonical = canonicalDecisionMatch(
    input.historicalBaseline.decision,
    input.historicalPostCorrection.decision,
  );
  const correctionMachineStatus = correctionObservedAfterHistoricalCutoff
    && baselineCapturedBeforeCorrectionRetrieval
    && postRunCapturedAfterCorrectionRetrieval
    && historicalInputFingerprintMatch
    && historicalDecisionContentHashMatch
    && historicalCanonical
    ? "passed" as const
    : "failed" as const;
  const machineProofStatus = sameInputMachineStatus === "passed" && correctionMachineStatus === "passed"
    ? "passed" as const
    : "failed" as const;
  const blockers = sorted([
    ...(sameInputMachineStatus === "passed" ? [] : ["same_input_machine_hash_proof_failed"]),
    ...(correctionMachineStatus === "passed" ? [] : ["historical_cutoff_correction_machine_proof_failed"]),
    "human_must_confirm_runs_were_real_local_pipeline_executions",
    "machine_artifact_equality_is_not_real_evidence_proof",
    "milestone_green_requires_separate_human_proof_finalization",
    "automatic_trading_not_authorized",
  ]);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    target,
    generatedAt,
    sameInput: {
      baselineRunId: input.sameInputBaseline.runId,
      rerunRunId: input.sameInputRerun.runId,
      inputFingerprintMatch,
      decisionContentHashMatch,
      canonicalDecisionMatch: sameCanonical,
      machineStatus: sameInputMachineStatus,
    },
    correctionCutoff: {
      baselineRunId: input.historicalBaseline.runId,
      postCorrectionRunId: input.historicalPostCorrection.runId,
      correctionRevisionId: input.correctionWitness.documentRevisionId,
      correctionRevisionHash: input.correctionWitness.contentHash,
      correctionRevisionKind: input.correctionWitness.revisionKind,
      correctionObservedAfterHistoricalCutoff,
      baselineCapturedBeforeCorrectionRetrieval,
      postRunCapturedAfterCorrectionRetrieval,
      historicalInputFingerprintMatch,
      historicalDecisionContentHashMatch,
      canonicalHistoricalDecisionMatch: historicalCanonical,
      machineStatus: correctionMachineStatus,
    },
    machineProofStatus,
    humanRealLocalExecutionConfirmationRequired: true as const,
    realLocalExecutionConfirmed: false as const,
    realEvidenceProven: false as const,
    deterministicReplayProven: false as const,
    correctionCutoffImmutabilityProven: false as const,
    milestoneGreenAuthorized: false as const,
    automaticTradingAuthorized: false as const,
    blockers,
  };
  return { ...base, proofHash: digest(base) };
}

export function renderFoundationPilotReplayProofAudit(
  audit: FoundationPilotReplayProofAudit,
): string {
  return [
    "# Foundation pilot replay proof audit",
    "",
    `- candidateId: ${audit.target.candidateId}`,
    `- listedSecurityEntityId: ${audit.target.listedSecurityEntityId}`,
    `- issuerEntityId: ${audit.target.issuerEntityId}`,
    `- informationCutoff: ${audit.target.informationCutoff}`,
    `- generatedAt: ${audit.generatedAt}`,
    `- sameInput.machineStatus: ${audit.sameInput.machineStatus}`,
    `- sameInput.inputFingerprintMatch: ${audit.sameInput.inputFingerprintMatch}`,
    `- sameInput.decisionContentHashMatch: ${audit.sameInput.decisionContentHashMatch}`,
    `- correctionCutoff.machineStatus: ${audit.correctionCutoff.machineStatus}`,
    `- correctionCutoff.correctionRevisionId: ${audit.correctionCutoff.correctionRevisionId}`,
    `- correctionCutoff.correctionObservedAfterHistoricalCutoff: ${audit.correctionCutoff.correctionObservedAfterHistoricalCutoff}`,
    `- correctionCutoff.historicalDecisionContentHashMatch: ${audit.correctionCutoff.historicalDecisionContentHashMatch}`,
    `- machineProofStatus: ${audit.machineProofStatus}`,
    `- proofHash: ${audit.proofHash}`,
    "- humanRealLocalExecutionConfirmationRequired: true",
    "- realLocalExecutionConfirmed: false",
    "- realEvidenceProven: false",
    "- deterministicReplayProven: false",
    "- correctionCutoffImmutabilityProven: false",
    "- milestoneGreenAuthorized: false",
    "- automaticTradingAuthorized: false",
    "",
    "Machine equality verifies only the supplied local artifacts and correction witness. A separate human finalization must confirm that all four observations came from the intended real local pipeline executions.",
    "",
    "## Blockers",
    "",
    ...audit.blockers.map(blocker => `- ${blocker}`),
    "",
  ].join("\n");
}
