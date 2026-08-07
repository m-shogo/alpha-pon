import { createHash } from "node:crypto";

type JsonObject = Record<string, unknown>;

export type FoundationPilotStageStatus =
  | "blocked_by_validation"
  | "missing"
  | "partial"
  | "structurally_ready_unproven"
  | "eligible_object_present_unproven"
  | "manual_proof_required";

export type FoundationPilotTarget = {
  candidateId: string;
  listedSecurityEntityId: string;
  issuerEntityId: string;
  informationCutoff: string;
};

export type FoundationPilotStructuralObservation = {
  validationIssueCounts: {
    securityMaster: number;
    evidenceStore: number;
    claimGraph: number;
    documentRevision: number;
    evidencePackage: number;
    hypothesisScenario: number;
    councilReplay: number;
    foundationDecision: number;
  };
  security: {
    listedSecurityPresent: boolean;
    issuerPresent: boolean;
    verifiedIssuerRelationshipPresent: boolean;
    verifiedListingRelationshipPresent: boolean;
  };
  evidence: {
    targetEvidenceCount: number;
    primaryEvidenceCount: number;
    targetRelationCount: number;
    correctionLikeRelationCount: number;
  };
  claims: {
    targetClaimCount: number;
    activeTargetClaimCount: number;
    classCounts: {
      fact: number;
      assumption: number;
      forecast: number;
      opinion: number;
      unknown: number;
    };
  };
  documents: {
    targetRevisionCount: number;
    targetDiffCount: number;
    correctionLikeRevisionCount: number;
    reviewedOrConfirmedDiffCount: number;
  };
  prices: {
    issuerPriceCount: number;
    issuerBenchmarkCount: number;
    topixBenchmarkCount: number;
    sectorBenchmarkCount: number;
  };
  packages: {
    targetManifestCount: number;
    completeTargetPackageCount: number;
    activeCompleteTargetPackageHashes: string[];
  };
  hypotheses: {
    targetHypothesisCount: number;
    registeredTargetHypothesisCount: number;
    registeredTargetHypothesisIds: string[];
  };
  scenarios: {
    targetScenarioSetCount: number;
    registeredFourScenarioSetCount: number;
  };
  replay: {
    targetReplayCount: number;
    eligibleTargetReplayCount: number;
  };
  decisions: {
    targetDecisionCount: number;
    eligibleTargetDecisionCount: number;
    blockedTargetDecisionCount: number;
  };
};

export type FoundationPilotStage = {
  stageId: string;
  ordinal: number;
  status: FoundationPilotStageStatus;
  observed: Record<string, number | boolean | string>;
  blockers: string[];
  nextAction: string;
};

export type FoundationPilotStructuralStatus = {
  schemaVersion: 1;
  target: FoundationPilotTarget;
  generatedAt: string;
  stages: FoundationPilotStage[];
  stageCount: number;
  structurallyReadyStageCount: number;
  firstIncompleteStageId: string | null;
  nextAction: string;
  structuralStatus: "blocked" | "in_progress" | "structurally_complete_manual_proof_pending";
  realEvidenceProven: false;
  deterministicReplayProven: false;
  correctionCutoffImmutabilityProven: false;
  milestoneGreenAuthorized: false;
  automaticTradingAuthorized: false;
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

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function issueBlocked(count: number): boolean {
  return count > 0;
}

function stage(input: FoundationPilotStage): FoundationPilotStage {
  return { ...input, blockers: sorted(input.blockers) };
}

function securityStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.securityMaster);
  const complete = obs.security.listedSecurityPresent
    && obs.security.issuerPresent
    && obs.security.verifiedIssuerRelationshipPresent
    && obs.security.verifiedListingRelationshipPresent;
  const blockers = [
    ...(validationBlocked ? ["security_master_validation_errors"] : []),
    ...(!obs.security.listedSecurityPresent ? ["target_listed_security_missing"] : []),
    ...(!obs.security.issuerPresent ? ["target_issuer_missing"] : []),
    ...(!obs.security.verifiedIssuerRelationshipPresent ? ["verified_issuer_of_relationship_missing"] : []),
    ...(!obs.security.verifiedListingRelationshipPresent ? ["verified_listed_on_relationship_missing"] : []),
  ];
  return stage({
    stageId: "security_master_identity",
    ordinal: 1,
    status: validationBlocked ? "blocked_by_validation" : complete ? "structurally_ready_unproven" : "missing",
    observed: { ...obs.security },
    blockers,
    nextAction: complete
      ? "preserve_target_identity_pins"
      : "create_or_fix_governed_security_master_identity",
  });
}

function evidenceStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.evidenceStore);
  const hasPrimary = obs.evidence.primaryEvidenceCount > 0;
  const hasEvidence = obs.evidence.targetEvidenceCount > 0;
  return stage({
    stageId: "bitemporal_primary_evidence",
    ordinal: 2,
    status: validationBlocked
      ? "blocked_by_validation"
      : hasPrimary ? "structurally_ready_unproven" : hasEvidence ? "partial" : "missing",
    observed: { ...obs.evidence },
    blockers: [
      ...(validationBlocked ? ["evidence_store_validation_errors"] : []),
      ...(!hasEvidence ? ["target_evidence_missing"] : []),
      ...(!hasPrimary ? ["target_primary_evidence_missing"] : []),
    ],
    nextAction: hasPrimary ? "preserve_pit_evidence_lineage" : "add_authoritative_target_evidence_with_pit_timestamps",
  });
}

function correctionStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.evidenceStore)
    || issueBlocked(obs.validationIssueCounts.documentRevision);
  const hasRevision = obs.documents.targetRevisionCount > 0;
  const hasCorrection = obs.documents.correctionLikeRevisionCount > 0
    || obs.evidence.correctionLikeRelationCount > 0;
  const hasReviewedDiff = obs.documents.reviewedOrConfirmedDiffCount > 0;
  const ready = hasRevision && hasCorrection && hasReviewedDiff;
  return stage({
    stageId: "revision_correction_chain",
    ordinal: 3,
    status: validationBlocked
      ? "blocked_by_validation"
      : ready ? "structurally_ready_unproven" : hasRevision || hasCorrection ? "partial" : "missing",
    observed: {
      targetRevisionCount: obs.documents.targetRevisionCount,
      targetDiffCount: obs.documents.targetDiffCount,
      correctionLikeRevisionCount: obs.documents.correctionLikeRevisionCount,
      reviewedOrConfirmedDiffCount: obs.documents.reviewedOrConfirmedDiffCount,
      correctionLikeEvidenceRelationCount: obs.evidence.correctionLikeRelationCount,
    },
    blockers: [
      ...(validationBlocked ? ["revision_or_evidence_validation_errors"] : []),
      ...(!hasRevision ? ["target_document_revision_missing"] : []),
      ...(!hasCorrection ? ["correction_chain_missing"] : []),
      ...(!hasReviewedDiff ? ["reviewed_document_diff_missing"] : []),
    ],
    nextAction: ready ? "preserve_revision_chain" : "build_and_review_real_correction_chain",
  });
}

function claimStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.claimGraph);
  const hasClaims = obs.claims.targetClaimCount > 0;
  const hasActive = obs.claims.activeTargetClaimCount > 0;
  return stage({
    stageId: "classified_claim_graph",
    ordinal: 4,
    status: validationBlocked
      ? "blocked_by_validation"
      : hasActive ? "structurally_ready_unproven" : hasClaims ? "partial" : "missing",
    observed: {
      targetClaimCount: obs.claims.targetClaimCount,
      activeTargetClaimCount: obs.claims.activeTargetClaimCount,
      ...obs.claims.classCounts,
    },
    blockers: [
      ...(validationBlocked ? ["claim_graph_validation_errors"] : []),
      ...(!hasClaims ? ["target_claims_missing"] : []),
      ...(!hasActive ? ["active_target_claim_head_missing"] : []),
    ],
    nextAction: hasActive ? "preserve_claim_classification_and_contradictions" : "create_target_claims_with_explicit_claim_classes",
  });
}

function priceStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.foundationDecision);
  const roles = [
    obs.prices.issuerPriceCount,
    obs.prices.issuerBenchmarkCount,
    obs.prices.topixBenchmarkCount,
    obs.prices.sectorBenchmarkCount,
  ];
  const present = roles.filter(count => count > 0).length;
  return stage({
    stageId: "actual_price_benchmark_objects",
    ordinal: 5,
    status: validationBlocked
      ? "blocked_by_validation"
      : present === 4 ? "structurally_ready_unproven" : present > 0 ? "partial" : "missing",
    observed: { ...obs.prices },
    blockers: [
      ...(validationBlocked ? ["foundation_price_validation_errors"] : []),
      ...(obs.prices.issuerPriceCount === 0 ? ["issuer_price_missing"] : []),
      ...(obs.prices.issuerBenchmarkCount === 0 ? ["issuer_benchmark_missing"] : []),
      ...(obs.prices.topixBenchmarkCount === 0 ? ["topix_benchmark_missing"] : []),
      ...(obs.prices.sectorBenchmarkCount === 0 ? ["sector_benchmark_missing"] : []),
    ],
    nextAction: present === 4 ? "preserve_price_pins" : "add_local_only_actual_price_and_benchmark_objects",
  });
}

function packageStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.evidencePackage);
  const complete = obs.packages.completeTargetPackageCount > 0;
  const any = obs.packages.targetManifestCount > 0;
  return stage({
    stageId: "complete_evidence_package",
    ordinal: 6,
    status: validationBlocked
      ? "blocked_by_validation"
      : complete ? "eligible_object_present_unproven" : any ? "partial" : "missing",
    observed: {
      targetManifestCount: obs.packages.targetManifestCount,
      completeTargetPackageCount: obs.packages.completeTargetPackageCount,
    },
    blockers: [
      ...(validationBlocked ? ["evidence_package_validation_errors"] : []),
      ...(!any ? ["target_evidence_package_missing"] : []),
      ...(any && !complete ? ["target_evidence_package_not_complete"] : []),
    ],
    nextAction: complete ? "preserve_complete_package_hash" : "build_governed_complete_evidence_package",
  });
}

function hypothesisStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.hypothesisScenario);
  const registered = obs.hypotheses.registeredTargetHypothesisCount > 0;
  const any = obs.hypotheses.targetHypothesisCount > 0;
  return stage({
    stageId: "registered_hypothesis",
    ordinal: 7,
    status: validationBlocked
      ? "blocked_by_validation"
      : registered ? "eligible_object_present_unproven" : any ? "partial" : "missing",
    observed: {
      targetHypothesisCount: obs.hypotheses.targetHypothesisCount,
      registeredTargetHypothesisCount: obs.hypotheses.registeredTargetHypothesisCount,
    },
    blockers: [
      ...(validationBlocked ? ["hypothesis_validation_errors"] : []),
      ...(!any ? ["target_hypothesis_missing"] : []),
      ...(any && !registered ? ["target_hypothesis_not_registered"] : []),
    ],
    nextAction: registered ? "preserve_preregistration" : "register_falsifiable_hypothesis_before_outcome_window",
  });
}

function scenarioStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.hypothesisScenario);
  const registered = obs.scenarios.registeredFourScenarioSetCount > 0;
  const any = obs.scenarios.targetScenarioSetCount > 0;
  return stage({
    stageId: "registered_four_scenario_set",
    ordinal: 8,
    status: validationBlocked
      ? "blocked_by_validation"
      : registered ? "eligible_object_present_unproven" : any ? "partial" : "missing",
    observed: { ...obs.scenarios },
    blockers: [
      ...(validationBlocked ? ["scenario_validation_errors"] : []),
      ...(!any ? ["target_scenario_set_missing"] : []),
      ...(any && !registered ? ["registered_four_scenario_set_missing"] : []),
    ],
    nextAction: registered ? "preserve_four_scenario_preregistration" : "register_downside_base_upside_and_null_hypothesis_scenarios",
  });
}

function replayStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.councilReplay);
  const eligible = obs.replay.eligibleTargetReplayCount > 0;
  const any = obs.replay.targetReplayCount > 0;
  return stage({
    stageId: "deterministic_council_replay_object",
    ordinal: 9,
    status: validationBlocked
      ? "blocked_by_validation"
      : eligible ? "eligible_object_present_unproven" : any ? "partial" : "missing",
    observed: { ...obs.replay },
    blockers: [
      ...(validationBlocked ? ["council_replay_validation_errors"] : []),
      ...(!any ? ["target_council_replay_missing"] : []),
      ...(any && !eligible ? ["target_council_replay_blocked"] : []),
    ],
    nextAction: eligible ? "preserve_replay_manifest_and_result_hashes" : "run_governed_council_replay",
  });
}

function decisionStage(obs: FoundationPilotStructuralObservation): FoundationPilotStage {
  const validationBlocked = issueBlocked(obs.validationIssueCounts.foundationDecision);
  const eligible = obs.decisions.eligibleTargetDecisionCount > 0;
  const any = obs.decisions.targetDecisionCount > 0;
  return stage({
    stageId: "foundation_decision_integration",
    ordinal: 10,
    status: validationBlocked
      ? "blocked_by_validation"
      : eligible ? "eligible_object_present_unproven" : any ? "partial" : "missing",
    observed: { ...obs.decisions },
    blockers: [
      ...(validationBlocked ? ["foundation_decision_validation_errors"] : []),
      ...(!any ? ["target_foundation_decision_missing"] : []),
      ...(any && !eligible ? ["target_foundation_decision_not_eligible"] : []),
    ],
    nextAction: eligible ? "preserve_foundation_decision_hash" : "run_foundation_decision_integration",
  });
}

function manualProofStage(
  stageId: string,
  ordinal: number,
  nextAction: string,
): FoundationPilotStage {
  return stage({
    stageId,
    ordinal,
    status: "manual_proof_required",
    observed: { proofRecordedByThisTool: false },
    blockers: ["real_local_proof_not_recorded_by_structural_status"],
    nextAction,
  });
}

export function buildFoundationPilotStructuralStatus(input: {
  target: FoundationPilotTarget;
  observation: FoundationPilotStructuralObservation;
  generatedAt?: string;
}): FoundationPilotStructuralStatus {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("generatedAt must be a date-time");
  if (!Number.isFinite(Date.parse(input.target.informationCutoff))) {
    throw new Error("target.informationCutoff must be a date-time");
  }
  for (const [key, value] of Object.entries(input.target)) {
    if (!String(value).trim()) throw new Error(`target.${key} must be non-empty`);
  }

  const stages = [
    securityStage(input.observation),
    evidenceStage(input.observation),
    correctionStage(input.observation),
    claimStage(input.observation),
    priceStage(input.observation),
    packageStage(input.observation),
    hypothesisStage(input.observation),
    scenarioStage(input.observation),
    replayStage(input.observation),
    decisionStage(input.observation),
    manualProofStage(
      "same_input_same_hash_proof",
      11,
      "rerun_identical_real_local_inputs_and_compare_exact_hashes",
    ),
    manualProofStage(
      "historical_cutoff_correction_immutability_proof",
      12,
      "apply_real_correction_then_replay_prior_cutoff_and_verify_identical_prior_hash",
    ),
  ];

  const machineStages = stages.filter(item => item.ordinal <= 10);
  const firstIncomplete = stages.find(item =>
    !["structurally_ready_unproven", "eligible_object_present_unproven"].includes(item.status),
  ) ?? null;
  const anyValidationBlocked = machineStages.some(item => item.status === "blocked_by_validation");
  const machineComplete = machineStages.every(item =>
    ["structurally_ready_unproven", "eligible_object_present_unproven"].includes(item.status),
  );
  const blockers = sorted([
    ...stages.flatMap(item => item.blockers.map(blocker => `${item.stageId}:${blocker}`)),
    "structural_status_does_not_prove_real_evidence",
    "structural_status_does_not_authorize_foundation_milestone_green",
    "automatic_trading_not_authorized",
  ]);
  const structuralStatus = anyValidationBlocked
    ? "blocked" as const
    : machineComplete
      ? "structurally_complete_manual_proof_pending" as const
      : "in_progress" as const;
  const base = {
    schemaVersion: 1 as const,
    target: { ...input.target },
    generatedAt,
    stages,
    stageCount: stages.length,
    structurallyReadyStageCount: machineStages.filter(item =>
      ["structurally_ready_unproven", "eligible_object_present_unproven"].includes(item.status),
    ).length,
    firstIncompleteStageId: firstIncomplete?.stageId ?? null,
    nextAction: firstIncomplete?.nextAction ?? "manual_human_milestone_review_required",
    structuralStatus,
    realEvidenceProven: false as const,
    deterministicReplayProven: false as const,
    correctionCutoffImmutabilityProven: false as const,
    milestoneGreenAuthorized: false as const,
    automaticTradingAuthorized: false as const,
    blockers,
  };
  return { ...base, contentHash: digest(base) };
}

export function renderFoundationPilotStructuralStatus(
  status: FoundationPilotStructuralStatus,
): string {
  const lines = [
    "# Foundation real-pilot structural status",
    "",
    `- candidateId: ${status.target.candidateId}`,
    `- listedSecurityEntityId: ${status.target.listedSecurityEntityId}`,
    `- issuerEntityId: ${status.target.issuerEntityId}`,
    `- informationCutoff: ${status.target.informationCutoff}`,
    `- generatedAt: ${status.generatedAt}`,
    `- structuralStatus: ${status.structuralStatus}`,
    `- stages structurally ready: ${status.structurallyReadyStageCount}/10 machine-checkable`,
    `- firstIncompleteStageId: ${status.firstIncompleteStageId ?? "none"}`,
    `- nextAction: ${status.nextAction}`,
    `- contentHash: ${status.contentHash}`,
    "- realEvidenceProven: false",
    "- deterministicReplayProven: false",
    "- correctionCutoffImmutabilityProven: false",
    "- milestoneGreenAuthorized: false",
    "- automaticTradingAuthorized: false",
    "",
    "This report is structural only. It must never be used as proof that local records are real, licensed, economically correct, or milestone-green.",
    "",
    "## Stages",
    "",
  ];
  for (const item of status.stages) {
    lines.push(
      `### ${item.ordinal}. ${item.stageId}`,
      "",
      `- status: ${item.status}`,
      `- blockers: ${item.blockers.join(", ") || "none"}`,
      `- nextAction: ${item.nextAction}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
