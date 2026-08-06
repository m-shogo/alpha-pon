import { existsSync, readFileSync } from "node:fs";
import {
  CLAIM_GRAPH_PATHS,
  parseClaimGraphJsonl,
  type ClaimRecord,
} from "./claim-contradiction-graph.js";
import {
  EVIDENCE_PACKAGE_PATHS,
  type EvidencePackageIssue,
  type EvidencePackageManifest,
} from "./evidence-package-manifest.js";
import type {
  EvidencePackageExternalPinResolver,
} from "./evidence-package-governed.js";
import {
  validateEvidencePackageRepository,
} from "./evidence-package-repository.js";
import {
  HYPOTHESIS_SCENARIO_PATHS,
  parseHypothesisScenarioJsonl,
  validateTestableHypothesisRecord,
  type HypothesisScenarioIssue,
  type HypothesisScenarioRecord,
  type HypothesisScenarioSet,
  type HypothesisScenarioSetBuildRequest,
  type TestableHypothesisRecord,
} from "./testable-hypothesis-scenario.js";
import {
  validateHypothesisScenarioBundle,
  validateHypothesisScenarioRecordGoverned,
  validateHypothesisScenarioSetGoverned,
} from "./testable-hypothesis-scenario-hardening.js";
import {
  activeHypothesisHeads,
  activeScenarioHeads,
  activeScenarioSetHeads,
  validateHypothesisScenarioLedgers,
} from "./testable-hypothesis-scenario-ledger.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type HypothesisScenarioRepositoryOptions = {
  hypothesesPath?: string;
  scenariosPath?: string;
  scenarioSetsPath?: string;
  claimsPath?: string;
  evidencePackagesPath?: string;
  claimEdgesPath?: string;
  documentRevisionsPath?: string;
  documentDiffsPath?: string;
  evidencePath?: string;
  evidenceRelationsPath?: string;
  securityEntitiesPath?: string;
  securityRelationshipsPath?: string;
  externalPins?: EvidencePackageExternalPinResolver;
  includeDependencyIssues?: boolean;
};

export type HypothesisScenarioRepositoryResult = {
  issues: HypothesisScenarioIssue[];
  hypothesisCount: number;
  scenarioCount: number;
  scenarioSetCount: number;
  activeHypothesisHeadCount: number;
  registeredHypothesisHeadCount: number;
  activeScenarioHeadCount: number;
  registeredScenarioHeadCount: number;
  activeScenarioSetHeadCount: number;
  registeredScenarioSetHeadCount: number;
  hypotheses: TestableHypothesisRecord[];
  scenarios: HypothesisScenarioRecord[];
  scenarioSets: HypothesisScenarioSet[];
};

function issue(
  code: string,
  target: string,
  message: string,
): HypothesisScenarioIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: HypothesisScenarioIssue[]): HypothesisScenarioIssue[] {
  const unique = new Map<string, HypothesisScenarioIssue>();
  for (const item of issues) {
    unique.set(
      `${item.severity}|${item.code}|${item.target}|${item.message}`,
      item,
    );
  }
  return [...unique.values()].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readHypothesisFile<T>(path: string): {
  records: T[];
  issues: HypothesisScenarioIssue[];
} {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_hypothesis_scenario_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return {
      records: parseHypothesisScenarioJsonl<T>(content, path),
      issues: [],
    };
  } catch (error) {
    return {
      records: [],
      issues: [issue(
        "invalid_hypothesis_scenario_jsonl",
        path,
        (error as Error).message,
      )],
    };
  }
}

function readClaims(path: string): {
  records: ClaimRecord[];
  issues: HypothesisScenarioIssue[];
} {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_hypothesis_claim_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return {
      records: parseClaimGraphJsonl<ClaimRecord>(content, path),
      issues: [],
    };
  } catch (error) {
    return {
      records: [],
      issues: [issue("invalid_hypothesis_claim_jsonl", path, (error as Error).message)],
    };
  }
}

function packageIssueToHypothesisIssue(
  item: EvidencePackageIssue,
): HypothesisScenarioIssue {
  return {
    severity: item.severity,
    code: item.code,
    target: item.target,
    message: item.message,
  };
}

function scenarioSetRequestFromRecord(
  record: HypothesisScenarioSet,
): HypothesisScenarioSetBuildRequest {
  return {
    scenarioSetId: record.scenarioSetId,
    createdAt: record.createdAt,
    ...(record.registeredAt ? { registeredAt: record.registeredAt } : {}),
    ...(record.supersedesScenarioSetId
      ? { supersedesScenarioSetId: record.supersedesScenarioSetId }
      : {}),
  };
}

export function validateHypothesisScenarioRepository(
  options: HypothesisScenarioRepositoryOptions = {},
): HypothesisScenarioRepositoryResult {
  const hypothesesPath =
    options.hypothesesPath ?? HYPOTHESIS_SCENARIO_PATHS.hypotheses;
  const scenariosPath =
    options.scenariosPath ?? HYPOTHESIS_SCENARIO_PATHS.scenarios;
  const scenarioSetsPath =
    options.scenarioSetsPath ?? HYPOTHESIS_SCENARIO_PATHS.scenarioSets;
  const claimsPath = options.claimsPath ?? CLAIM_GRAPH_PATHS.claims;
  const hypothesesRead = readHypothesisFile<TestableHypothesisRecord>(
    hypothesesPath,
  );
  const scenariosRead = readHypothesisFile<HypothesisScenarioRecord>(
    scenariosPath,
  );
  const scenarioSetsRead = readHypothesisFile<HypothesisScenarioSet>(
    scenarioSetsPath,
  );
  const claimsRead = readClaims(claimsPath);
  const packageRepository = validateEvidencePackageRepository({
    manifestsPath:
      options.evidencePackagesPath ?? EVIDENCE_PACKAGE_PATHS.manifests,
    claimsPath,
    claimEdgesPath: options.claimEdgesPath,
    documentRevisionsPath: options.documentRevisionsPath,
    documentDiffsPath: options.documentDiffsPath,
    evidencePath: options.evidencePath,
    evidenceRelationsPath: options.evidenceRelationsPath,
    securityEntitiesPath: options.securityEntitiesPath,
    securityRelationshipsPath: options.securityRelationshipsPath,
    externalPins: options.externalPins,
    includeDependencyIssues: options.includeDependencyIssues,
  });

  const issues: HypothesisScenarioIssue[] = [
    ...hypothesesRead.issues,
    ...scenariosRead.issues,
    ...scenarioSetsRead.issues,
    ...claimsRead.issues,
    ...(options.includeDependencyIssues === false
      ? []
      : packageRepository.issues.map(packageIssueToHypothesisIssue)),
  ];
  const journalPath = `${hypothesesPath}.batch-journal.json`;
  if (existsSync(journalPath)) {
    issues.push(issue(
      "incomplete_hypothesis_scenario_batch",
      journalPath,
      "未完了Hypothesis Scenario batchがあります。自動復旧・自動削除は禁止です",
    ));
  }

  const schemas = {
    hypothesis: loadCouncilSchema(HYPOTHESIS_SCENARIO_PATHS.hypothesisSchema),
    scenario: loadCouncilSchema(HYPOTHESIS_SCENARIO_PATHS.scenarioSchema),
    scenarioSet: loadCouncilSchema(HYPOTHESIS_SCENARIO_PATHS.scenarioSetSchema),
  };
  const packageById = new Map(
    packageRepository.manifests.map((record) => [record.packageId, record]),
  );
  const packageByHash = new Map(
    packageRepository.manifests.map((record) => [record.contentHash, record]),
  );
  const claimById = new Map(
    claimsRead.records.map((record) => [record.claimId, record]),
  );
  const hypothesisById = new Map(
    hypothesesRead.records.map((record) => [record.hypothesisId, record]),
  );
  const scenarioById = new Map(
    scenariosRead.records.map((record) => [record.scenarioId, record]),
  );

  for (const hypothesis of hypothesesRead.records) {
    const packageManifest = packageById.get(hypothesis.evidencePackageId);
    if (!packageManifest) {
      issues.push(issue(
        "missing_hypothesis_evidence_package",
        hypothesis.hypothesisId,
        hypothesis.evidencePackageId,
      ));
      continue;
    }
    if (packageManifest.contentHash !== hypothesis.evidencePackageHash) {
      issues.push(issue(
        "hypothesis_evidence_package_hash_mismatch",
        hypothesis.hypothesisId,
        `${hypothesis.evidencePackageHash} != ${packageManifest.contentHash}`,
      ));
    }
    issues.push(...validateTestableHypothesisRecord(
      hypothesis,
      schemas.hypothesis,
      packageManifest,
      claimById,
    ));
  }

  for (const scenario of scenariosRead.records) {
    const hypothesis = hypothesisById.get(scenario.hypothesisId);
    const packageManifest = packageByHash.get(scenario.evidencePackageHash);
    if (!hypothesis) {
      issues.push(issue(
        "missing_scenario_hypothesis",
        scenario.scenarioId,
        scenario.hypothesisId,
      ));
      continue;
    }
    if (!packageManifest) {
      issues.push(issue(
        "missing_scenario_evidence_package",
        scenario.scenarioId,
        scenario.evidencePackageHash,
      ));
      continue;
    }
    issues.push(...validateHypothesisScenarioRecordGoverned(
      scenario,
      schemas,
      hypothesis,
      packageManifest,
    ));
  }

  for (const scenarioSet of scenarioSetsRead.records) {
    const hypothesis = hypothesisById.get(scenarioSet.hypothesisId);
    const packageManifest = packageByHash.get(scenarioSet.evidencePackageHash);
    const scenarios: HypothesisScenarioRecord[] = [];
    for (const scenarioId of scenarioSet.scenarioIds) {
      const scenario = scenarioById.get(scenarioId);
      if (!scenario) {
        issues.push(issue(
          "missing_scenario_set_member",
          scenarioSet.scenarioSetId,
          scenarioId,
        ));
      } else {
        scenarios.push(scenario);
      }
    }
    if (!hypothesis || !packageManifest) {
      issues.push(issue(
        "missing_scenario_set_dependency",
        scenarioSet.scenarioSetId,
        `hypothesis=${Boolean(hypothesis)} package=${Boolean(packageManifest)}`,
      ));
      continue;
    }
    const actualHashes = scenarios.map((scenario) => scenario.contentHash).sort();
    if (
      actualHashes.length !== scenarioSet.scenarioHashes.length ||
      !actualHashes.every((hash, index) => hash === scenarioSet.scenarioHashes[index])
    ) {
      issues.push(issue(
        "scenario_set_hash_membership_mismatch",
        scenarioSet.scenarioSetId,
        `actual=${actualHashes.join(",")} stored=${scenarioSet.scenarioHashes.join(",")}`,
      ));
    }
    issues.push(...validateHypothesisScenarioSetGoverned(
      scenarioSet,
      schemas,
      scenarioSetRequestFromRecord(scenarioSet),
      hypothesis,
      packageManifest,
      scenarios,
    ));
  }

  issues.push(...validateHypothesisScenarioLedgers(
    hypothesesRead.records,
    scenariosRead.records,
    scenarioSetsRead.records,
  ));

  const activeHypotheses = activeHypothesisHeads(hypothesesRead.records);
  const activeScenarios = activeScenarioHeads(scenariosRead.records);
  const activeScenarioSets = activeScenarioSetHeads(scenarioSetsRead.records);
  return {
    issues: sortIssues(issues),
    hypothesisCount: hypothesesRead.records.length,
    scenarioCount: scenariosRead.records.length,
    scenarioSetCount: scenarioSetsRead.records.length,
    activeHypothesisHeadCount: activeHypotheses.length,
    registeredHypothesisHeadCount: activeHypotheses.filter(
      (record) => record.status === "registered",
    ).length,
    activeScenarioHeadCount: activeScenarios.length,
    registeredScenarioHeadCount: activeScenarios.filter(
      (record) => record.status === "registered",
    ).length,
    activeScenarioSetHeadCount: activeScenarioSets.length,
    registeredScenarioSetHeadCount: activeScenarioSets.filter(
      (record) => record.status === "registered",
    ).length,
    hypotheses: hypothesesRead.records,
    scenarios: scenariosRead.records,
    scenarioSets: scenarioSetsRead.records,
  };
}
