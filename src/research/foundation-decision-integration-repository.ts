import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { activeEvidencePackageHeads } from "./evidence-package-ledger.js";
import type { EvidencePackageManifest } from "./evidence-package-manifest.js";
import { validateEvidencePackageRepository } from "./evidence-package-repository.js";
import type { EvidencePackageExternalPinResolver } from "./evidence-package-governed.js";
import {
  FOUNDATION_DECISION_PATHS,
  assessFoundationDecisionRecord,
  parseFoundationJsonl,
  validateFoundationDecisionRecord,
  validateFoundationPriceSnapshotRecord,
  type FoundationDecisionContext,
  type FoundationDecisionIntegrationRecord,
  type FoundationDecisionIssue,
  type FoundationPriceSnapshotRecord,
} from "./foundation-decision-integration.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { type JsonSchema } from "./schema.js";
import { activePersonaCalibrationHeads } from "./stock-pro-council-calibration.js";
import { validatePersonaCalibrationRepository } from "./stock-pro-council-calibration-repository.js";
import {
  computeReplayManifestHash,
  type CouncilReplayManifest,
} from "./stock-pro-council-replay.js";
import {
  COUNCIL_REPLAY_PATHS,
  validateCouncilReplayRepository,
} from "./stock-pro-council-replay-repository.js";
import {
  activeHypothesisHeads,
  activeScenarioHeads,
  activeScenarioSetHeads,
} from "./testable-hypothesis-scenario-ledger.js";
import { validateHypothesisScenarioRepository } from "./testable-hypothesis-scenario-repository.js";

export type FoundationDecisionRepositoryOptions = {
  decisionsPath?: string;
  priceSnapshotsPath?: string;
  replayManifestDir?: string;
  includeDependencyIssues?: boolean;
};

export type FoundationDecisionRepositoryResult = {
  issues: FoundationDecisionIssue[];
  decisionCount: number;
  activeDecisionHeadCount: number;
  eligibleDecisionHeadCount: number;
  blockedDecisionHeadCount: number;
  priceSnapshotCount: number;
  records: FoundationDecisionIntegrationRecord[];
  priceSnapshots: FoundationPriceSnapshotRecord[];
};

function issue(code: string, target: string, message: string): FoundationDecisionIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: FoundationDecisionIssue[]): FoundationDecisionIssue[] {
  const unique = new Map<string, FoundationDecisionIssue>();
  for (const item of issues) {
    unique.set(`${item.severity}|${item.code}|${item.target}|${item.message}`, item);
  }
  return [...unique.values()].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readStrictJsonl<T>(path: string): { records: T[]; issues: FoundationDecisionIssue[] } {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue("partial_foundation_decision_tail", path, "final newlineがなくpartial writeの可能性があります")],
    };
  }
  try {
    return { records: parseFoundationJsonl<T>(content, path), issues: [] };
  } catch (error) {
    return {
      records: [],
      issues: [issue("invalid_foundation_decision_jsonl", path, (error as Error).message)],
    };
  }
}

function loadSchema(path: string): JsonSchema {
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function readReplayManifests(dir: string): {
  records: CouncilReplayManifest[];
  issues: FoundationDecisionIssue[];
} {
  if (!existsSync(dir)) return { records: [], issues: [] };
  const records: CouncilReplayManifest[] = [];
  const issues: FoundationDecisionIssue[] = [];
  for (const filename of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, filename);
    try {
      const record = JSON.parse(readFileSync(path, "utf-8")) as CouncilReplayManifest;
      if (record.contentHash !== computeReplayManifestHash(record)) {
        issues.push(issue("invalid_replay_manifest_hash", path, "contentHashが一致しません"));
      }
      records.push(record);
    } catch (error) {
      issues.push(issue("invalid_replay_manifest_json", path, (error as Error).message));
    }
  }
  return { records, issues };
}

function externalPinResolver(
  records: FoundationPriceSnapshotRecord[],
): EvidencePackageExternalPinResolver {
  const byRole = (role: FoundationPriceSnapshotRecord["role"]): ReadonlySet<string> =>
    new Set(records.filter((record) => record.role === role).map((record) => record.contentHash));
  return {
    priceSnapshotHashes: byRole("issuer_price"),
    benchmarkSnapshotHashes: {
      issuer: byRole("issuer_benchmark"),
      topix: byRole("topix_benchmark"),
      sector: byRole("sector_benchmark"),
    },
  };
}

function activeDecisionHeads(
  records: FoundationDecisionIntegrationRecord[],
): FoundationDecisionIntegrationRecord[] {
  const superseded = new Set(records.flatMap((record) =>
    record.supersedesDecisionId ? [record.supersedesDecisionId] : [],
  ));
  return records.filter((record) => !superseded.has(record.decisionId));
}

function validateDecisionLedger(
  records: FoundationDecisionIntegrationRecord[],
): FoundationDecisionIssue[] {
  const issues: FoundationDecisionIssue[] = [];
  const byId = new Map<string, FoundationDecisionIntegrationRecord>();
  const hashes = new Set<string>();
  for (const record of records) {
    if (byId.has(record.decisionId)) issues.push(issue("duplicate_decision_id", record.decisionId, "decisionIdが重複しています"));
    if (hashes.has(record.contentHash)) issues.push(issue("duplicate_decision_hash", record.decisionId, record.contentHash));
    if (
      compareExplicitIso8601Instants(
        record.firstExecutableAt,
        record.issuedAt,
        `decision ${record.decisionId}.firstExecutableAt`,
        `decision ${record.decisionId}.issuedAt`,
      ) > 0
    ) {
      issues.push(issue(
        "decision_price_not_executable_at_issue",
        record.decisionId,
        `${record.firstExecutableAt} > ${record.issuedAt}`,
      ));
    }
    byId.set(record.decisionId, record);
    hashes.add(record.contentHash);
  }
  for (const record of records) {
    if (!record.supersedesDecisionId) continue;
    const previous = byId.get(record.supersedesDecisionId);
    if (!previous) {
      issues.push(issue("missing_superseded_decision", record.decisionId, record.supersedesDecisionId));
      continue;
    }
    if (
      previous.candidateId !== record.candidateId ||
      previous.listedSecurityEntityId !== record.listedSecurityEntityId
    ) issues.push(issue("decision_supersession_identity_mismatch", record.decisionId, record.supersedesDecisionId));
    if (
      compareExplicitIso8601Instants(
        record.issuedAt,
        previous.issuedAt,
        `decision ${record.decisionId}.issuedAt`,
        `decision ${previous.decisionId}.issuedAt`,
      ) < 0 ||
      compareExplicitIso8601Instants(
        record.informationCutoff,
        previous.informationCutoff,
        `decision ${record.decisionId}.informationCutoff`,
        `decision ${previous.decisionId}.informationCutoff`,
      ) < 0
    ) issues.push(issue("decision_supersession_time_regression", record.decisionId, record.supersedesDecisionId));
  }
  for (const record of records) {
    const seen = new Set<string>();
    let current: FoundationDecisionIntegrationRecord | undefined = record;
    while (current?.supersedesDecisionId) {
      if (seen.has(current.decisionId)) {
        issues.push(issue("decision_supersession_cycle", record.decisionId, "supersession chainにcycleがあります"));
        break;
      }
      seen.add(current.decisionId);
      current = byId.get(current.supersedesDecisionId);
    }
  }
  const headGroups = new Map<string, number>();
  for (const head of activeDecisionHeads(records)) {
    const key = `${head.candidateId}|${head.listedSecurityEntityId}|${head.informationCutoff}`;
    headGroups.set(key, (headGroups.get(key) ?? 0) + 1);
  }
  for (const [key, count] of headGroups) {
    if (count > 1) issues.push(issue("multiple_active_decision_heads", key, String(count)));
  }
  return issues;
}

function dependencyIssue(value: { severity: "error" | "warning"; code: string; target: string; message: string }): FoundationDecisionIssue {
  return { ...value };
}

export function validateEvidencePackageAvailableAtDecision(
  record: Pick<FoundationDecisionIntegrationRecord, "decisionId" | "issuedAt">,
  evidencePackage: Pick<EvidencePackageManifest, "createdAt"> | undefined,
): FoundationDecisionIssue[] {
  if (!evidencePackage) return [];
  if (
    compareExplicitIso8601Instants(
      evidencePackage.createdAt,
      record.issuedAt,
      `decision ${record.decisionId}.evidencePackage.createdAt`,
      `decision ${record.decisionId}.issuedAt`,
    ) > 0
  ) {
    return [issue(
      "decision_evidence_package_after_issue",
      record.decisionId,
      `${evidencePackage.createdAt} > ${record.issuedAt}`,
    )];
  }
  return [];
}

export function validateFoundationDecisionRepository(
  options: FoundationDecisionRepositoryOptions = {},
): FoundationDecisionRepositoryResult {
  const decisionsPath = options.decisionsPath ?? FOUNDATION_DECISION_PATHS.records;
  const priceSnapshotsPath = options.priceSnapshotsPath ?? FOUNDATION_DECISION_PATHS.priceSnapshots;
  const replayManifestDir = options.replayManifestDir ?? COUNCIL_REPLAY_PATHS.manifestDir;
  const includeDependencyIssues = options.includeDependencyIssues ?? true;
  const decisionRead = readStrictJsonl<FoundationDecisionIntegrationRecord>(decisionsPath);
  const priceRead = readStrictJsonl<FoundationPriceSnapshotRecord>(priceSnapshotsPath);
  const decisionSchema = loadSchema(FOUNDATION_DECISION_PATHS.recordSchema);
  const priceSchema = loadSchema(FOUNDATION_DECISION_PATHS.priceSchema);
  const issues: FoundationDecisionIssue[] = [...decisionRead.issues, ...priceRead.issues];

  const priceById = new Map<string, FoundationPriceSnapshotRecord>();
  const priceHashes = new Set<string>();
  for (const [index, record] of priceRead.records.entries()) {
    issues.push(...validateFoundationPriceSnapshotRecord(record, priceSchema, `${priceSnapshotsPath}:${index + 1}`));
    if (priceById.has(record.snapshotId)) issues.push(issue("duplicate_price_snapshot_id", record.snapshotId, "snapshotIdが重複しています"));
    if (priceHashes.has(record.contentHash)) issues.push(issue("duplicate_price_snapshot_hash", record.snapshotId, record.contentHash));
    priceById.set(record.snapshotId, record);
    priceHashes.add(record.contentHash);
  }

  const externalPins = externalPinResolver(priceRead.records);
  const packages = validateEvidencePackageRepository({
    externalPins,
    includeDependencyIssues,
  });
  const hypotheses = validateHypothesisScenarioRepository({
    externalPins,
    includeDependencyIssues,
  });
  const replay = validateCouncilReplayRepository({ manifestDir: replayManifestDir });
  const replayManifests = readReplayManifests(replayManifestDir);
  const calibrations = validatePersonaCalibrationRepository();
  const dependencyIssues = [
    ...packages.issues.map(dependencyIssue),
    ...hypotheses.issues.map(dependencyIssue),
    ...replay.issues.map(dependencyIssue),
    ...calibrations.issues.map(dependencyIssue),
    ...replayManifests.issues,
  ];
  const dependencyInvalid = dependencyIssues.some((item) => item.severity === "error");
  if (includeDependencyIssues) issues.push(...dependencyIssues);
  if (dependencyInvalid) {
    issues.push(issue(
      "foundation_decision_dependency_invalid",
      "foundation-decision-dependencies",
      "dependency repository validation failed; eligible Foundation Decision heads remain unavailable",
    ));
  }

  const activePackages = activeEvidencePackageHeads(packages.manifests);
  const activeHypotheses = activeHypothesisHeads(hypotheses.hypotheses);
  const activeScenarios = activeScenarioHeads(hypotheses.scenarios);
  const activeScenarioSets = activeScenarioSetHeads(hypotheses.scenarioSets);
  const activeCalibrations = activePersonaCalibrationHeads(calibrations.records);
  const context: FoundationDecisionContext = {
    evidencePackagesById: new Map(packages.manifests.map((record) => [record.packageId, record])),
    activeEvidencePackageIds: new Set(activePackages.map((record) => record.packageId)),
    hypothesesById: new Map(hypotheses.hypotheses.map((record) => [record.hypothesisId, record])),
    activeHypothesisIds: new Set(activeHypotheses.map((record) => record.hypothesisId)),
    scenariosById: new Map(hypotheses.scenarios.map((record) => [record.scenarioId, record])),
    activeScenarioIds: new Set(activeScenarios.map((record) => record.scenarioId)),
    scenarioSetsById: new Map(hypotheses.scenarioSets.map((record) => [record.scenarioSetId, record])),
    activeScenarioSetIds: new Set(activeScenarioSets.map((record) => record.scenarioSetId)),
    replayManifestsById: new Map(replayManifests.records.map((record) => [record.replayId, record])),
    replayResultsById: new Map(replay.results.map((record) => [record.replayId, record])),
    calibrationsByHash: new Map(calibrations.records.map((record) => [record.contentHash, record])),
    activeCalibrationHashes: new Set(activeCalibrations.map((record) => record.contentHash)),
    priceSnapshotsById: priceById,
  };

  for (const [index, record] of decisionRead.records.entries()) {
    issues.push(...validateFoundationDecisionRecord(record, decisionSchema, context, `${decisionsPath}:${index + 1}`));
    const expected = assessFoundationDecisionRecord(record, context);
    if (record.status === "eligible" && expected.length > 0) {
      issues.push(issue("eligible_decision_has_blockers", record.decisionId, expected.join(",")));
    }
    issues.push(...validateEvidencePackageAvailableAtDecision(
      record,
      context.evidencePackagesById.get(record.evidencePackageId),
    ));
    const replayManifest = context.replayManifestsById.get(record.replayId);
    if (
      replayManifest &&
      compareExplicitIso8601Instants(
        replayManifest.createdAt,
        record.issuedAt,
        `decision ${record.decisionId}.replayManifest.createdAt`,
        `decision ${record.decisionId}.issuedAt`,
      ) > 0
    ) {
      issues.push(issue(
        "decision_replay_manifest_after_issue",
        record.decisionId,
        `${replayManifest.createdAt} > ${record.issuedAt}`,
      ));
    }
    const benchmarkPins = [
      ["issuerBenchmark", record.priceSnapshots.issuerBenchmark],
      ["topixBenchmark", record.priceSnapshots.topixBenchmark],
      ["sectorBenchmark", record.priceSnapshots.sectorBenchmark],
    ] as const;
    for (const [label, pin] of benchmarkPins) {
      const snapshot = priceById.get(pin.id);
      if (!snapshot) continue;
      if (
        compareExplicitIso8601Instants(
          snapshot.firstExecutableAt,
          record.issuedAt,
          `decision ${record.decisionId}.${label}.firstExecutableAt`,
          `decision ${record.decisionId}.issuedAt`,
        ) > 0
      ) {
        issues.push(issue(
          "decision_benchmark_not_executable_at_issue",
          `${record.decisionId}:${label}`,
          `${snapshot.firstExecutableAt} > ${record.issuedAt}`,
        ));
      }
    }
  }
  issues.push(...validateDecisionLedger(decisionRead.records));
  const heads = activeDecisionHeads(decisionRead.records);

  return {
    issues: sortIssues(issues),
    decisionCount: decisionRead.records.length,
    activeDecisionHeadCount: heads.length,
    eligibleDecisionHeadCount: dependencyInvalid
      ? 0
      : heads.filter((record) => record.status === "eligible").length,
    blockedDecisionHeadCount: heads.filter((record) => record.status === "blocked").length,
    priceSnapshotCount: priceRead.records.length,
    records: decisionRead.records,
    priceSnapshots: priceRead.records,
  };
}
