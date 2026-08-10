import type { EvidencePackageManifest } from "./evidence-package-manifest.js";
import {
  buildHypothesisScenarioSet,
  computeHypothesisScenarioSetHash,
  validateHypothesisScenarioRecord,
  validateHypothesisScenarioSet,
  validateTestableHypothesisRecord,
  type HypothesisScenarioIssue,
  type HypothesisScenarioRecord,
  type HypothesisScenarioSchemas,
  type HypothesisScenarioSet,
  type HypothesisScenarioSetBuildRequest,
  type HypothesisScenarioSetInput,
  type TestableHypothesisRecord,
} from "./testable-hypothesis-scenario.js";
import type { ClaimRecord } from "./claim-contradiction-graph.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { stableStringify } from "./schema.js";

function issue(
  code: string,
  target: string,
  message: string,
): HypothesisScenarioIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: HypothesisScenarioIssue[]): HypothesisScenarioIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function compareInstants(
  left: string,
  right: string,
  leftTarget: string,
  rightTarget: string,
): -1 | 0 | 1 {
  return compareExplicitIso8601Instants(left, right, leftTarget, rightTarget);
}

function earliestScenarioCheck(
  scenarios: HypothesisScenarioRecord[],
): { value: string; target: string } {
  const candidates = scenarios.flatMap((scenario) => [
    ...scenario.triggerConditions.map((condition) => ({
      value: condition.checkBy,
      target: `Scenario ${scenario.scenarioId} trigger ${condition.triggerId}.checkBy`,
    })),
    ...scenario.invalidationConditions.map((condition) => ({
      value: condition.checkBy,
      target: `Scenario ${scenario.scenarioId} invalidation ${condition.conditionId}.checkBy`,
    })),
  ]);
  if (candidates.length === 0) {
    throw new Error("scenario check window is empty");
  }
  return candidates.reduce((earliest, candidate) =>
    compareInstants(candidate.value, earliest.value, candidate.target, earliest.target) < 0
      ? candidate
      : earliest,
  );
}

function latestComponentRegistration(
  hypothesis: TestableHypothesisRecord,
  scenarios: HypothesisScenarioRecord[],
): { value: string; target: string } {
  const candidates = [
    {
      value: hypothesis.registeredAt ?? hypothesis.createdAt,
      target: `Hypothesis ${hypothesis.hypothesisId}.${hypothesis.registeredAt ? "registeredAt" : "createdAt"}`,
    },
    ...scenarios.map((scenario) => ({
      value: scenario.registeredAt ?? scenario.createdAt,
      target: `Scenario ${scenario.scenarioId}.${scenario.registeredAt ? "registeredAt" : "createdAt"}`,
    })),
  ];
  return candidates.reduce((latest, candidate) =>
    compareInstants(candidate.value, latest.value, candidate.target, latest.target) > 0
      ? candidate
      : latest,
  );
}

export function validateHypothesisScenarioRecordGoverned(
  record: HypothesisScenarioRecord,
  schemas: HypothesisScenarioSchemas,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
): HypothesisScenarioIssue[] {
  const issues = validateHypothesisScenarioRecord(
    record,
    schemas.scenario,
    hypothesis,
    evidencePackage,
  );
  const target = `scenario:${record.scenarioId}`;
  if (
    record.status === "registered" &&
    (evidencePackage.status !== "complete" || evidencePackage.blockers.length > 0)
  ) {
    issues.push(issue(
      "registered_scenario_uses_incomplete_package",
      target,
      `status=${evidencePackage.status} blockers=${evidencePackage.blockers.join(",")}`,
    ));
  }
  if (record.status === "registered" && record.registeredAt) {
    const earliestCheck = earliestScenarioCheck([record]);
    if (compareInstants(
      record.registeredAt,
      earliestCheck.value,
      `Scenario ${record.scenarioId}.registeredAt`,
      earliestCheck.target,
    ) >= 0) {
      issues.push(issue(
        "scenario_registered_after_check_window",
        target,
        `${record.registeredAt} >= ${earliestCheck.value}`,
      ));
    }
  }
  return sortIssues(issues);
}

function governedSetBlockers(
  base: HypothesisScenarioSet,
  request: HypothesisScenarioSetBuildRequest,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
  scenarios: HypothesisScenarioRecord[],
): string[] {
  const blockers = [...base.blockers];
  if (!request.registeredAt) {
    blockers.push("scenario_set_registered_at_missing");
  }
  if (compareInstants(
    request.createdAt,
    hypothesis.informationCutoff,
    `Scenario Set ${request.scenarioSetId}.createdAt`,
    `Hypothesis ${hypothesis.hypothesisId}.informationCutoff`,
  ) < 0) {
    blockers.push("scenario_set_created_before_cutoff");
  }
  if (request.registeredAt) {
    if (compareInstants(
      request.registeredAt,
      request.createdAt,
      `Scenario Set ${request.scenarioSetId}.registeredAt`,
      `Scenario Set ${request.scenarioSetId}.createdAt`,
    ) < 0) {
      blockers.push("scenario_set_registered_before_created");
    }
    const latestRegistration = latestComponentRegistration(hypothesis, scenarios);
    if (compareInstants(
      request.registeredAt,
      latestRegistration.value,
      `Scenario Set ${request.scenarioSetId}.registeredAt`,
      latestRegistration.target,
    ) < 0) {
      blockers.push("scenario_set_registered_before_components");
    }
    const earliestCheck = earliestScenarioCheck(scenarios);
    if (compareInstants(
      request.registeredAt,
      earliestCheck.value,
      `Scenario Set ${request.scenarioSetId}.registeredAt`,
      earliestCheck.target,
    ) >= 0) {
      blockers.push("scenario_set_registered_after_check_window");
    }
  }
  if (hypothesis.status !== "registered") {
    blockers.push("scenario_set_hypothesis_not_registered");
  }
  if (evidencePackage.status !== "complete" || evidencePackage.blockers.length > 0) {
    blockers.push("scenario_set_package_not_complete");
  }
  return [...new Set(blockers)].sort();
}

export function buildHypothesisScenarioSetGoverned(
  request: HypothesisScenarioSetBuildRequest,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
  scenarios: HypothesisScenarioRecord[],
): HypothesisScenarioSet {
  const base = buildHypothesisScenarioSet(
    request,
    hypothesis,
    evidencePackage,
    scenarios,
  );
  const { contentHash: _contentHash, registeredAt: _registeredAt, ...baseInput } = base;
  const blockers = governedSetBlockers(
    base,
    request,
    hypothesis,
    evidencePackage,
    scenarios,
  );
  const status = blockers.length === 0 ? "registered" as const : "draft" as const;
  const input: HypothesisScenarioSetInput = {
    ...baseInput,
    status,
    ...(status === "registered" && request.registeredAt
      ? { registeredAt: request.registeredAt }
      : {}),
    blockers,
  };
  return { ...input, contentHash: computeHypothesisScenarioSetHash(input) };
}

export function validateHypothesisScenarioSetGoverned(
  record: HypothesisScenarioSet,
  schemas: HypothesisScenarioSchemas,
  request: HypothesisScenarioSetBuildRequest,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
  scenarios: HypothesisScenarioRecord[],
): HypothesisScenarioIssue[] {
  // 基底validatorのauthoritative再構築(base build)は登録blockerを持たないため、
  // governed record(draft + registration blockers)とは正当に食い違う。governed側は
  // 直下でgoverned buildとの厳密一致(governed_scenario_set_mismatch)を検査し、改ざん検出を
  // より強く保証するため、基底由来の hypothesis_scenario_set_mismatch は重複かつ誤検出として除外する。
  const issues = validateHypothesisScenarioSet(
    record,
    schemas.scenarioSet,
    request,
    hypothesis,
    evidencePackage,
    scenarios,
  ).filter((item) => item.code !== "hypothesis_scenario_set_mismatch");
  const expected = buildHypothesisScenarioSetGoverned(
    request,
    hypothesis,
    evidencePackage,
    scenarios,
  );
  if (stableStringify(record) !== stableStringify(expected)) {
    issues.push(issue(
      "governed_scenario_set_mismatch",
      record.scenarioSetId,
      "scenario set differs from governed registration build",
    ));
  }
  return sortIssues(issues);
}

export function validateHypothesisScenarioBundle(
  hypothesis: TestableHypothesisRecord,
  scenarios: HypothesisScenarioRecord[],
  scenarioSet: HypothesisScenarioSet,
  scenarioSetRequest: HypothesisScenarioSetBuildRequest,
  evidencePackage: EvidencePackageManifest,
  claimById: ReadonlyMap<string, ClaimRecord>,
  schemas: HypothesisScenarioSchemas,
): HypothesisScenarioIssue[] {
  return sortIssues([
    ...validateTestableHypothesisRecord(
      hypothesis,
      schemas.hypothesis,
      evidencePackage,
      claimById,
    ),
    ...scenarios.flatMap((scenario) =>
      validateHypothesisScenarioRecordGoverned(
        scenario,
        schemas,
        hypothesis,
        evidencePackage,
      ),
    ),
    ...validateHypothesisScenarioSetGoverned(
      scenarioSet,
      schemas,
      scenarioSetRequest,
      hypothesis,
      evidencePackage,
      scenarios,
    ),
  ]);
}
