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

function earliestScenarioCheck(
  scenarios: HypothesisScenarioRecord[],
): number {
  return Math.min(...scenarios.flatMap((scenario) => [
    ...scenario.triggerConditions.map((condition) => Date.parse(condition.checkBy)),
    ...scenario.invalidationConditions.map((condition) => Date.parse(condition.checkBy)),
  ]));
}

function latestComponentRegistration(
  hypothesis: TestableHypothesisRecord,
  scenarios: HypothesisScenarioRecord[],
): number {
  return Math.max(
    Date.parse(hypothesis.registeredAt ?? hypothesis.createdAt),
    ...scenarios.map((scenario) =>
      Date.parse(scenario.registeredAt ?? scenario.createdAt),
    ),
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
    if (Date.parse(record.registeredAt) >= earliestCheck) {
      issues.push(issue(
        "scenario_registered_after_check_window",
        target,
        `${record.registeredAt} >= ${new Date(earliestCheck).toISOString()}`,
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
  if (Date.parse(request.createdAt) < Date.parse(hypothesis.informationCutoff)) {
    blockers.push("scenario_set_created_before_cutoff");
  }
  if (request.registeredAt) {
    const registeredAt = Date.parse(request.registeredAt);
    if (registeredAt < Date.parse(request.createdAt)) {
      blockers.push("scenario_set_registered_before_created");
    }
    if (registeredAt < latestComponentRegistration(hypothesis, scenarios)) {
      blockers.push("scenario_set_registered_before_components");
    }
    if (registeredAt >= earliestScenarioCheck(scenarios)) {
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
  const issues = validateHypothesisScenarioSet(
    record,
    schemas.scenarioSet,
    request,
    hypothesis,
    evidencePackage,
    scenarios,
  );
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
