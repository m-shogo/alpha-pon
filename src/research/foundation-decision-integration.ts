import { createHash } from "node:crypto";
import type { EvidencePackageCompleteness, EvidencePackageManifest } from "./evidence-package-manifest.js";
import type { PersonaCalibrationRecord } from "./stock-pro-council-calibration.js";
import {
  computeReplayManifestHash,
  computeReplayResultHash,
  type CouncilReplayManifest,
  type CouncilReplayResult,
} from "./stock-pro-council-replay.js";
import {
  computeHypothesisScenarioHash,
  computeHypothesisScenarioSetHash,
  computeTestableHypothesisHash,
  type HypothesisScenarioRecord,
  type HypothesisScenarioSet,
  type ScenarioType,
  type TestableHypothesisRecord,
} from "./testable-hypothesis-scenario.js";
import { computeEvidencePackageHash } from "./evidence-package-manifest.js";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";
import { computePersonaCalibrationHash } from "./stock-pro-council-calibration.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type FoundationPriceSnapshotRole =
  | "issuer_price"
  | "issuer_benchmark"
  | "topix_benchmark"
  | "sector_benchmark";

export type FoundationPriceSnapshotRecord = {
  schemaVersion: 1;
  snapshotId: string;
  candidateId: string;
  listedSecurityEntityId: string;
  role: FoundationPriceSnapshotRole;
  instrumentId: string;
  providerId: string;
  providerRecordId: string;
  tradingDate: string;
  informationCutoff: string;
  observedAt: string;
  firstExecutableAt: string;
  value: number;
  currency: string;
  adjustmentStatus: "raw" | "adjusted";
  licenseClass: "local_only" | "licensed_not_redistributable";
  rawPayloadHash: string;
  contentHash: string;
};

export type FoundationObjectPin = { id: string; hash: string };

export type FoundationDecisionIntegrationRecord = {
  schemaVersion: 1;
  decisionId: string;
  candidateId: string;
  listedSecurityEntityId: string;
  issuedAt: string;
  informationCutoff: string;
  firstExecutableAt: string;
  securityMasterSnapshotHash: string;
  evidenceSnapshotHash: string;
  claimGraphSnapshotHash: string;
  documentRevisionSnapshotHash: string;
  evidencePackageId: string;
  evidencePackageHash: string;
  evidencePackageStatus: "complete";
  evidencePackageCompleteness: EvidencePackageCompleteness;
  hypothesisId: string;
  hypothesisHash: string;
  scenarioSetId: string;
  scenarioSetHash: string;
  scenarios: {
    downside: FoundationObjectPin;
    base: FoundationObjectPin;
    upside: FoundationObjectPin;
    nullHypothesis: FoundationObjectPin;
  };
  replayId: string;
  councilRunId: string;
  replayManifestHash: string;
  replayResultHash: string;
  calibrationHashes: string[];
  priceSnapshots: {
    issuerPrice: FoundationObjectPin;
    issuerBenchmark: FoundationObjectPin;
    topixBenchmark: FoundationObjectPin;
    sectorBenchmark: FoundationObjectPin;
  };
  status: "eligible" | "blocked";
  eligibleForRecommendationCandidate: boolean;
  blockers: string[];
  supersedesDecisionId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type FoundationDecisionIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type FoundationDecisionContext = {
  evidencePackagesById: ReadonlyMap<string, EvidencePackageManifest>;
  activeEvidencePackageIds: ReadonlySet<string>;
  hypothesesById: ReadonlyMap<string, TestableHypothesisRecord>;
  activeHypothesisIds: ReadonlySet<string>;
  scenariosById: ReadonlyMap<string, HypothesisScenarioRecord>;
  activeScenarioIds: ReadonlySet<string>;
  scenarioSetsById: ReadonlyMap<string, HypothesisScenarioSet>;
  activeScenarioSetIds: ReadonlySet<string>;
  replayManifestsById: ReadonlyMap<string, CouncilReplayManifest>;
  replayResultsById: ReadonlyMap<string, CouncilReplayResult>;
  calibrationsByHash: ReadonlyMap<string, PersonaCalibrationRecord>;
  activeCalibrationHashes: ReadonlySet<string>;
  priceSnapshotsById: ReadonlyMap<string, FoundationPriceSnapshotRecord>;
};

export const FOUNDATION_DECISION_PATHS = {
  records: "research/foundation_decisions/decisions.jsonl",
  priceSnapshots: "research/foundation_decisions/price-snapshots.jsonl",
  recordSchema: "research/schemas/foundation-decision-integration-record.schema.json",
  priceSchema: "research/schemas/foundation-price-snapshot-record.schema.json",
} as const;

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function issue(code: string, target: string, message: string): FoundationDecisionIssue {
  return { severity: "error", code, target, message };
}

function schemaIssues(value: unknown, schema: JsonSchema, target: string): FoundationDecisionIssue[] {
  return validate(value, schema).map((error) => issue(
    "schema_violation",
    error.path ? `${target}:${error.path}` : target,
    error.message,
  ));
}

function withoutPriceHash(record: FoundationPriceSnapshotRecord): Omit<FoundationPriceSnapshotRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutDecisionHash(record: FoundationDecisionIntegrationRecord): Omit<FoundationDecisionIntegrationRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeFoundationPriceSnapshotHash(
  record: FoundationPriceSnapshotRecord | Omit<FoundationPriceSnapshotRecord, "contentHash">,
): string {
  return hashValue("contentHash" in record ? withoutPriceHash(record) : record);
}

export function withFoundationPriceSnapshotHash(
  record: Omit<FoundationPriceSnapshotRecord, "contentHash">,
): FoundationPriceSnapshotRecord {
  return { ...record, contentHash: computeFoundationPriceSnapshotHash(record) };
}

export function computeFoundationDecisionHash(
  record: FoundationDecisionIntegrationRecord | Omit<FoundationDecisionIntegrationRecord, "contentHash">,
): string {
  return hashValue("contentHash" in record ? withoutDecisionHash(record) : record);
}

export function withFoundationDecisionHash(
  record: Omit<FoundationDecisionIntegrationRecord, "contentHash">,
): FoundationDecisionIntegrationRecord {
  return {
    ...record,
    calibrationHashes: sortedUnique(record.calibrationHashes),
    blockers: sortedUnique(record.blockers),
    contentHash: computeFoundationDecisionHash({
      ...record,
      calibrationHashes: sortedUnique(record.calibrationHashes),
      blockers: sortedUnique(record.blockers),
    }),
  };
}

export function parseFoundationJsonl<T>(content: string, path: string): T[] {
  if (!content.trim()) return [];
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${(error as Error).message}`);
      }
    });
}

export function validateFoundationPriceSnapshotRecord(
  value: unknown,
  schema: JsonSchema,
  target = "FoundationPriceSnapshotRecord",
): FoundationDecisionIssue[] {
  const issues = schemaIssues(value, schema, target);
  if (issues.length > 0) return issues;
  const record = value as FoundationPriceSnapshotRecord;
  if (record.contentHash !== computeFoundationPriceSnapshotHash(record)) {
    issues.push(issue("invalid_price_snapshot_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (
    compareExplicitIso8601Instants(
      record.observedAt,
      record.informationCutoff,
      `${target}.observedAt`,
      `${target}.informationCutoff`,
    ) > 0
  ) {
    issues.push(issue("future_price_observation", target, "observedAtをinformationCutoffより後にできません"));
  }
  if (
    compareExplicitIso8601Instants(
      record.firstExecutableAt,
      record.observedAt,
      `${target}.firstExecutableAt`,
      `${target}.observedAt`,
    ) < 0
  ) {
    issues.push(issue("price_executable_before_observed", target, "firstExecutableAtはobservedAt以後が必要です"));
  }
  if (!Number.isFinite(record.value) || record.value < 0) {
    issues.push(issue("invalid_price_value", `${target}.value`, "valueは有限の0以上が必要です"));
  }
  return issues;
}

function completenessBlockers(completeness: EvidencePackageCompleteness): string[] {
  return Object.entries(completeness)
    .filter(([, complete]) => !complete)
    .map(([key]) => `evidence_package_incomplete:${key}`);
}

function assertReferencedTemporalInputs(
  record: FoundationDecisionIntegrationRecord,
  context: FoundationDecisionContext,
): void {
  parseExplicitIso8601Instant(record.issuedAt, "decision.issuedAt");
  parseExplicitIso8601Instant(record.informationCutoff, "decision.informationCutoff");
  parseExplicitIso8601Instant(record.firstExecutableAt, "decision.firstExecutableAt");

  const hypothesis = context.hypothesesById.get(record.hypothesisId);
  if (hypothesis?.registeredAt) {
    parseExplicitIso8601Instant(hypothesis.registeredAt, "hypothesis.registeredAt");
  }
  const scenarioSet = context.scenarioSetsById.get(record.scenarioSetId);
  if (scenarioSet?.registeredAt) {
    parseExplicitIso8601Instant(scenarioSet.registeredAt, "scenarioSet.registeredAt");
  }
  for (const [label, pin] of Object.entries(record.scenarios)) {
    const scenario = context.scenariosById.get(pin.id);
    if (scenario?.registeredAt) {
      parseExplicitIso8601Instant(scenario.registeredAt, `scenario.${label}.registeredAt`);
    }
  }
  for (const calibrationHash of record.calibrationHashes) {
    const calibration = context.calibrationsByHash.get(calibrationHash);
    if (!calibration) continue;
    parseExplicitIso8601Instant(calibration.outcomeCutoff, `calibration.${calibrationHash}.outcomeCutoff`);
    parseExplicitIso8601Instant(calibration.evaluatedAt, `calibration.${calibrationHash}.evaluatedAt`);
  }
  for (const [label, pin] of Object.entries(record.priceSnapshots)) {
    const snapshot = context.priceSnapshotsById.get(pin.id);
    if (!snapshot) continue;
    parseExplicitIso8601Instant(snapshot.informationCutoff, `priceSnapshot.${label}.informationCutoff`);
    parseExplicitIso8601Instant(snapshot.observedAt, `priceSnapshot.${label}.observedAt`);
    parseExplicitIso8601Instant(snapshot.firstExecutableAt, `priceSnapshot.${label}.firstExecutableAt`);
  }
}

function addScenarioBlockers(
  blockers: string[],
  label: keyof FoundationDecisionIntegrationRecord["scenarios"],
  expectedType: ScenarioType,
  pin: FoundationObjectPin,
  record: FoundationDecisionIntegrationRecord,
  context: FoundationDecisionContext,
  scenarioSet: HypothesisScenarioSet | undefined,
): void {
  const scenario = context.scenariosById.get(pin.id);
  if (!scenario) {
    blockers.push(`missing_scenario:${expectedType}`);
    return;
  }
  if (!context.activeScenarioIds.has(scenario.scenarioId)) blockers.push(`inactive_scenario:${expectedType}`);
  if (scenario.contentHash !== pin.hash || computeHypothesisScenarioHash(scenario) !== pin.hash) {
    blockers.push(`scenario_hash_mismatch:${expectedType}`);
  }
  if (scenario.scenarioType !== expectedType) blockers.push(`scenario_type_mismatch:${label}`);
  if (scenario.status !== "registered") blockers.push(`scenario_not_registered:${expectedType}`);
  if (!scenario.registeredAt || Date.parse(scenario.registeredAt) > Date.parse(record.issuedAt)) {
    blockers.push(`scenario_registration_time_invalid:${expectedType}`);
  }
  if (
    scenario.hypothesisId !== record.hypothesisId ||
    scenario.evidencePackageHash !== record.evidencePackageHash ||
    scenario.informationCutoff !== record.informationCutoff
  ) {
    blockers.push(`scenario_identity_mismatch:${expectedType}`);
  }
  if (
    scenarioSet &&
    (!scenarioSet.scenarioIds.includes(scenario.scenarioId) ||
      !scenarioSet.scenarioHashes.includes(scenario.contentHash))
  ) {
    blockers.push(`scenario_not_pinned_by_set:${expectedType}`);
  }
}

function addPriceBlockers(
  blockers: string[],
  label: keyof FoundationDecisionIntegrationRecord["priceSnapshots"],
  expectedRole: FoundationPriceSnapshotRole,
  pin: FoundationObjectPin,
  record: FoundationDecisionIntegrationRecord,
): FoundationPriceSnapshotRecord | undefined {
  const snapshot = recordContext.priceSnapshotsById.get(pin.id);
  if (!snapshot) {
    blockers.push(`missing_price_snapshot:${expectedRole}`);
    return undefined;
  }
  if (snapshot.contentHash !== pin.hash || computeFoundationPriceSnapshotHash(snapshot) !== pin.hash) {
    blockers.push(`price_snapshot_hash_mismatch:${expectedRole}`);
  }
  if (snapshot.role !== expectedRole) blockers.push(`price_snapshot_role_mismatch:${label}`);
  if (
    snapshot.candidateId !== record.candidateId ||
    snapshot.listedSecurityEntityId !== record.listedSecurityEntityId ||
    snapshot.informationCutoff !== record.informationCutoff
  ) {
    blockers.push(`price_snapshot_identity_mismatch:${expectedRole}`);
  }
  if (
    compareExplicitIso8601Instants(
      snapshot.observedAt,
      record.informationCutoff,
      `priceSnapshot.${label}.observedAt`,
      "decision.informationCutoff",
    ) > 0
  ) {
    blockers.push(`future_price_snapshot:${expectedRole}`);
  }
  return snapshot;
}

let recordContext: FoundationDecisionContext;

export function assessFoundationDecisionRecord(
  record: FoundationDecisionIntegrationRecord,
  context: FoundationDecisionContext,
): string[] {
  assertReferencedTemporalInputs(record, context);
  recordContext = context;
  const blockers: string[] = [];
  const evidencePackage = context.evidencePackagesById.get(record.evidencePackageId);
  if (!evidencePackage) {
    blockers.push("missing_evidence_package");
  } else {
    if (!context.activeEvidencePackageIds.has(evidencePackage.packageId)) blockers.push("inactive_evidence_package");
    if (
      evidencePackage.contentHash !== record.evidencePackageHash ||
      computeEvidencePackageHash(evidencePackage) !== record.evidencePackageHash
    ) blockers.push("evidence_package_hash_mismatch");
    if (evidencePackage.status !== "complete") blockers.push(`evidence_package_status:${evidencePackage.status}`);
    if (
      evidencePackage.candidateId !== record.candidateId ||
      evidencePackage.listedSecurityEntityId !== record.listedSecurityEntityId ||
      evidencePackage.informationCutoff !== record.informationCutoff
    ) blockers.push("evidence_package_identity_mismatch");
    if (stableStringify(evidencePackage.completeness) !== stableStringify(record.evidencePackageCompleteness)) {
      blockers.push("evidence_package_completeness_mismatch");
    }
    blockers.push(...completenessBlockers(evidencePackage.completeness));
    blockers.push(...evidencePackage.blockers.map((value) => `evidence_package:${value}`));
    blockers.push(...evidencePackage.openContradictionIds.map((value) => `open_contradiction:${value}`));
    blockers.push(...evidencePackage.unknownBudget
      .filter((entry) => entry.status === "unknown" && entry.severity === "blocking")
      .map((entry) => `blocking_unknown:${entry.category}`));
    if (
      evidencePackage.securityMasterSnapshotHash !== record.securityMasterSnapshotHash ||
      evidencePackage.evidenceSnapshotHash !== record.evidenceSnapshotHash ||
      evidencePackage.claimGraphSnapshotHash !== record.claimGraphSnapshotHash ||
      evidencePackage.documentRevisionSnapshotHash !== record.documentRevisionSnapshotHash
    ) blockers.push("foundation_snapshot_hash_mismatch");
  }

  const hypothesis = context.hypothesesById.get(record.hypothesisId);
  if (!hypothesis) {
    blockers.push("missing_hypothesis");
  } else {
    if (!context.activeHypothesisIds.has(hypothesis.hypothesisId)) blockers.push("inactive_hypothesis");
    if (hypothesis.contentHash !== record.hypothesisHash || computeTestableHypothesisHash(hypothesis) !== record.hypothesisHash) {
      blockers.push("hypothesis_hash_mismatch");
    }
    if (hypothesis.status !== "registered") blockers.push("hypothesis_not_registered");
    if (
      !hypothesis.registeredAt ||
      compareExplicitIso8601Instants(
        hypothesis.registeredAt,
        record.issuedAt,
        "hypothesis.registeredAt",
        "decision.issuedAt",
      ) > 0
    ) {
      blockers.push("hypothesis_registration_time_invalid");
    }
    if (
      hypothesis.candidateId !== record.candidateId ||
      hypothesis.listedSecurityEntityId !== record.listedSecurityEntityId ||
      hypothesis.evidencePackageId !== record.evidencePackageId ||
      hypothesis.evidencePackageHash !== record.evidencePackageHash ||
      hypothesis.informationCutoff !== record.informationCutoff
    ) blockers.push("hypothesis_identity_mismatch");
  }

  const scenarioSet = context.scenarioSetsById.get(record.scenarioSetId);
  if (!scenarioSet) {
    blockers.push("missing_scenario_set");
  } else {
    if (!context.activeScenarioSetIds.has(scenarioSet.scenarioSetId)) blockers.push("inactive_scenario_set");
    if (scenarioSet.contentHash !== record.scenarioSetHash || computeHypothesisScenarioSetHash(scenarioSet) !== record.scenarioSetHash) {
      blockers.push("scenario_set_hash_mismatch");
    }
    if (scenarioSet.status !== "registered") blockers.push("scenario_set_not_registered");
    if (!scenarioSet.registeredAt || Date.parse(scenarioSet.registeredAt) > Date.parse(record.issuedAt)) {
      blockers.push("scenario_set_registration_time_invalid");
    }
    if (
      scenarioSet.hypothesisId !== record.hypothesisId ||
      scenarioSet.evidencePackageHash !== record.evidencePackageHash ||
      scenarioSet.informationCutoff !== record.informationCutoff
    ) blockers.push("scenario_set_identity_mismatch");
    if (!equalStringSets(scenarioSet.requiredScenarioTypes, ["downside", "base", "upside", "null_hypothesis"])) {
      blockers.push("scenario_set_missing_required_types");
    }
    blockers.push(...scenarioSet.blockers.map((value) => `scenario_set:${value}`));
  }

  addScenarioBlockers(blockers, "downside", "downside", record.scenarios.downside, record, context, scenarioSet);
  addScenarioBlockers(blockers, "base", "base", record.scenarios.base, record, context, scenarioSet);
  addScenarioBlockers(blockers, "upside", "upside", record.scenarios.upside, record, context, scenarioSet);
  addScenarioBlockers(blockers, "nullHypothesis", "null_hypothesis", record.scenarios.nullHypothesis, record, context, scenarioSet);

  const replayManifest = context.replayManifestsById.get(record.replayId);
  const replayResult = context.replayResultsById.get(record.replayId);
  if (!replayManifest) blockers.push("missing_replay_manifest");
  if (!replayResult) blockers.push("missing_replay_result");
  if (replayManifest) {
    if (replayManifest.contentHash !== record.replayManifestHash || computeReplayManifestHash(replayManifest) !== record.replayManifestHash) {
      blockers.push("replay_manifest_hash_mismatch");
    }
    if (
      replayManifest.councilRunId !== record.councilRunId ||
      replayManifest.informationCutoff !== record.informationCutoff ||
      replayManifest.evidencePackageHash !== record.evidencePackageHash ||
      replayManifest.priceSnapshotHash !== record.priceSnapshots.issuerPrice.hash
    ) blockers.push("replay_manifest_identity_mismatch");
    if (!equalStringSets(replayManifest.calibrationHashes, record.calibrationHashes)) {
      blockers.push("replay_calibration_pin_mismatch");
    }
  }
  if (replayResult) {
    if (replayResult.resultHash !== record.replayResultHash || computeReplayResultHash(replayResult) !== record.replayResultHash) {
      blockers.push("replay_result_hash_mismatch");
    }
    if (
      replayResult.replayId !== record.replayId ||
      replayResult.councilRunId !== record.councilRunId ||
      replayResult.informationCutoff !== record.informationCutoff ||
      replayResult.manifestHash !== record.replayManifestHash
    ) blockers.push("replay_result_identity_mismatch");
    if (!replayResult.eligibleForRecommendationCandidate) blockers.push(...replayResult.blockers.map((value) => `replay:${value}`));
    blockers.push(...replayResult.missingPersonaIds.map((value) => `missing_required_persona:${value}`));
    blockers.push(...replayResult.abstainingPersonaIds.map((value) => `required_persona_abstained:${value}`));
    blockers.push(...replayResult.vetoingPersonaIds.map((value) => `required_persona_veto:${value}`));
    blockers.push(...replayResult.bindingVetoIds.map((value) => `binding_veto:${value}`));
  }

  for (const hash of record.calibrationHashes) {
    const calibration = context.calibrationsByHash.get(hash);
    if (!calibration) {
      blockers.push(`missing_calibration:${hash}`);
      continue;
    }
    if (!context.activeCalibrationHashes.has(hash)) blockers.push(`inactive_calibration:${hash}`);
    if (calibration.contentHash !== hash || computePersonaCalibrationHash(calibration) !== hash) {
      blockers.push(`calibration_hash_mismatch:${hash}`);
    }
    if (calibration.status !== "eligible" || !calibration.eligibleForConfidence) {
      blockers.push(`calibration_not_eligible:${hash}`);
    }
    if (
      Date.parse(calibration.outcomeCutoff) > Date.parse(record.informationCutoff) ||
      Date.parse(calibration.evaluatedAt) > Date.parse(record.issuedAt)
    ) blockers.push(`future_calibration:${hash}`);
  }

  const issuerPrice = addPriceBlockers(blockers, "issuerPrice", "issuer_price", record.priceSnapshots.issuerPrice, record);
  addPriceBlockers(blockers, "issuerBenchmark", "issuer_benchmark", record.priceSnapshots.issuerBenchmark, record);
  addPriceBlockers(blockers, "topixBenchmark", "topix_benchmark", record.priceSnapshots.topixBenchmark, record);
  addPriceBlockers(blockers, "sectorBenchmark", "sector_benchmark", record.priceSnapshots.sectorBenchmark, record);
  if (issuerPrice && issuerPrice.firstExecutableAt !== record.firstExecutableAt) {
    blockers.push("first_executable_mismatch");
  }
  if (evidencePackage) {
    if (evidencePackage.priceSnapshotHash !== record.priceSnapshots.issuerPrice.hash) blockers.push("package_issuer_price_pin_mismatch");
    if (evidencePackage.benchmarkSnapshotHashes.issuer !== record.priceSnapshots.issuerBenchmark.hash) blockers.push("package_issuer_benchmark_pin_mismatch");
    if (evidencePackage.benchmarkSnapshotHashes.topix !== record.priceSnapshots.topixBenchmark.hash) blockers.push("package_topix_benchmark_pin_mismatch");
    if (evidencePackage.benchmarkSnapshotHashes.sector !== record.priceSnapshots.sectorBenchmark.hash) blockers.push("package_sector_benchmark_pin_mismatch");
  }

  return sortedUnique(blockers);
}

export function validateFoundationDecisionRecord(
  value: unknown,
  schema: JsonSchema,
  context: FoundationDecisionContext,
  target = "FoundationDecisionIntegrationRecord",
): FoundationDecisionIssue[] {
  const issues = schemaIssues(value, schema, target);
  if (issues.length > 0) return issues;
  const record = value as FoundationDecisionIntegrationRecord;
  if (record.contentHash !== computeFoundationDecisionHash(record)) {
    issues.push(issue("invalid_decision_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (
    compareExplicitIso8601Instants(
      record.issuedAt,
      record.informationCutoff,
      `${target}.issuedAt`,
      `${target}.informationCutoff`,
    ) < 0
  ) {
    issues.push(issue("decision_issued_before_cutoff", target, "issuedAtはinformationCutoff以後が必要です"));
  }
  if (
    compareExplicitIso8601Instants(
      record.firstExecutableAt,
      record.informationCutoff,
      `${target}.firstExecutableAt`,
      `${target}.informationCutoff`,
    ) < 0
  ) {
    issues.push(issue("decision_executable_before_cutoff", target, "firstExecutableAtはinformationCutoff以後が必要です"));
  }
  if (!equalStringSets(record.calibrationHashes, sortedUnique(record.calibrationHashes))) {
    issues.push(issue("non_canonical_calibration_hashes", `${target}.calibrationHashes`, "sorted uniqueが必要です"));
  }
  const expectedBlockers = assessFoundationDecisionRecord(record, context);
  if (!equalStringSets(record.blockers, expectedBlockers)) {
    issues.push(issue(
      "decision_blocker_set_mismatch",
      `${target}.blockers`,
      `expected=${expectedBlockers.join(",")} actual=${sortedUnique(record.blockers).join(",")}`,
    ));
  }
  const eligible = expectedBlockers.length === 0;
  if (record.eligibleForRecommendationCandidate !== eligible) {
    issues.push(issue("decision_eligibility_mismatch", target, "eligibilityがblocker再計算結果と一致しません"));
  }
  if (record.status !== (eligible ? "eligible" : "blocked")) {
    issues.push(issue("decision_status_mismatch", `${target}.status`, "statusがblocker再計算結果と一致しません"));
  }
  return issues;
}
