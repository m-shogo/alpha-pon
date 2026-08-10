import {
  type HypothesisScenarioIssue,
  type HypothesisScenarioRecord,
  type HypothesisScenarioSet,
  type TestableHypothesisRecord,
} from "./testable-hypothesis-scenario.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";

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

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
): HypothesisScenarioIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

function detectCycles<T extends { id: string; parent?: string }>(
  records: T[],
  code: string,
): HypothesisScenarioIssue[] {
  const issues: HypothesisScenarioIssue[] = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of records) {
    const seen = new Set<string>();
    let current: T | undefined = record;
    while (current?.parent) {
      if (seen.has(current.id)) {
        issues.push(issue(code, record.id, "supersession cycleがあります"));
        break;
      }
      seen.add(current.id);
      current = byId.get(current.parent);
    }
  }
  return issues;
}

function oneHeadIssues(
  values: Array<{ chain: string; id: string; parent?: string }>,
  code: string,
): HypothesisScenarioIssue[] {
  const superseded = new Set(
    values.flatMap((value) => value.parent ? [value.parent] : []),
  );
  const counts = new Map<string, number>();
  for (const value of values.filter((item) => !superseded.has(item.id))) {
    counts.set(value.chain, (counts.get(value.chain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([chain, count]) => issue(code, chain, `${count} active heads`));
}

export function activeHypothesisHeads(
  records: TestableHypothesisRecord[],
): TestableHypothesisRecord[] {
  const superseded = new Set(
    records.flatMap((record) =>
      record.supersedesHypothesisId ? [record.supersedesHypothesisId] : [],
    ),
  );
  return records.filter((record) => !superseded.has(record.hypothesisId));
}

export function activeScenarioHeads(
  records: HypothesisScenarioRecord[],
): HypothesisScenarioRecord[] {
  const superseded = new Set(
    records.flatMap((record) =>
      record.supersedesScenarioId ? [record.supersedesScenarioId] : [],
    ),
  );
  return records.filter((record) => !superseded.has(record.scenarioId));
}

export function activeScenarioSetHeads(
  records: HypothesisScenarioSet[],
): HypothesisScenarioSet[] {
  const superseded = new Set(
    records.flatMap((record) =>
      record.supersedesScenarioSetId ? [record.supersedesScenarioSetId] : [],
    ),
  );
  return records.filter((record) => !superseded.has(record.scenarioSetId));
}

export function validateHypothesisScenarioLedgers(
  hypotheses: TestableHypothesisRecord[],
  scenarios: HypothesisScenarioRecord[],
  scenarioSets: HypothesisScenarioSet[],
): HypothesisScenarioIssue[] {
  const issues: HypothesisScenarioIssue[] = [
    ...duplicateIssues(
      hypotheses.map((record) => record.hypothesisId),
      "duplicate_hypothesis_id",
      "hypotheses",
    ),
    ...duplicateIssues(
      hypotheses.map((record) => record.contentHash),
      "duplicate_hypothesis_hash",
      "hypotheses",
    ),
    ...duplicateIssues(
      scenarios.map((record) => record.scenarioId),
      "duplicate_scenario_id",
      "scenarios",
    ),
    ...duplicateIssues(
      scenarios.map((record) => record.contentHash),
      "duplicate_scenario_hash",
      "scenarios",
    ),
    ...duplicateIssues(
      scenarioSets.map((record) => record.scenarioSetId),
      "duplicate_scenario_set_id",
      "scenario-sets",
    ),
    ...duplicateIssues(
      scenarioSets.map((record) => record.contentHash),
      "duplicate_scenario_set_hash",
      "scenario-sets",
    ),
  ];

  const hypothesisById = new Map(
    hypotheses.map((record) => [record.hypothesisId, record]),
  );
  for (const record of hypotheses) {
    if (record.supersedesHypothesisId === record.hypothesisId) {
      issues.push(issue(
        "hypothesis_self_supersession",
        record.hypothesisId,
        "hypothesis自身をsupersedeできません",
      ));
    }
    if (!record.supersedesHypothesisId) continue;
    const previous = hypothesisById.get(record.supersedesHypothesisId);
    if (!previous) {
      issues.push(issue(
        "missing_hypothesis_parent",
        record.hypothesisId,
        record.supersedesHypothesisId,
      ));
      continue;
    }
    if (
      record.candidateId !== previous.candidateId ||
      record.listedSecurityEntityId !== previous.listedSecurityEntityId
    ) {
      issues.push(issue(
        "hypothesis_chain_identity_mismatch",
        record.hypothesisId,
        "candidate/listed securityをsupersessionで変更できません",
      ));
    }
    if (previous.status === "registered") {
      issues.push(issue(
        "registered_hypothesis_is_terminal",
        record.hypothesisId,
        previous.hypothesisId,
      ));
    }
    if (compareExplicitIso8601Instants(
      record.createdAt,
      previous.createdAt,
      `hypothesis:${record.hypothesisId}.createdAt`,
      `hypothesis:${previous.hypothesisId}.createdAt`,
    ) <= 0) {
      issues.push(issue(
        "hypothesis_created_at_not_monotonic",
        record.hypothesisId,
        `${record.createdAt} <= ${previous.createdAt}`,
      ));
    }
    if (compareExplicitIso8601Instants(
      record.informationCutoff,
      previous.informationCutoff,
      `hypothesis:${record.hypothesisId}.informationCutoff`,
      `hypothesis:${previous.hypothesisId}.informationCutoff`,
    ) < 0) {
      issues.push(issue(
        "hypothesis_cutoff_regression",
        record.hypothesisId,
        `${record.informationCutoff} < ${previous.informationCutoff}`,
      ));
    }
  }

  const scenarioById = new Map(
    scenarios.map((record) => [record.scenarioId, record]),
  );
  for (const record of scenarios) {
    if (record.supersedesScenarioId === record.scenarioId) {
      issues.push(issue(
        "scenario_self_supersession",
        record.scenarioId,
        "scenario自身をsupersedeできません",
      ));
    }
    if (!record.supersedesScenarioId) continue;
    const previous = scenarioById.get(record.supersedesScenarioId);
    if (!previous) {
      issues.push(issue(
        "missing_scenario_parent",
        record.scenarioId,
        record.supersedesScenarioId,
      ));
      continue;
    }
    if (
      record.hypothesisId !== previous.hypothesisId ||
      record.evidencePackageHash !== previous.evidencePackageHash ||
      record.informationCutoff !== previous.informationCutoff ||
      record.scenarioType !== previous.scenarioType
    ) {
      issues.push(issue(
        "scenario_chain_identity_mismatch",
        record.scenarioId,
        "hypothesis/package/cutoff/typeをsupersessionで変更できません",
      ));
    }
    if (previous.status === "registered") {
      issues.push(issue(
        "registered_scenario_is_terminal",
        record.scenarioId,
        previous.scenarioId,
      ));
    }
    if (Date.parse(record.createdAt) <= Date.parse(previous.createdAt)) {
      issues.push(issue(
        "scenario_created_at_not_monotonic",
        record.scenarioId,
        `${record.createdAt} <= ${previous.createdAt}`,
      ));
    }
  }

  const scenarioSetById = new Map(
    scenarioSets.map((record) => [record.scenarioSetId, record]),
  );
  for (const record of scenarioSets) {
    if (record.supersedesScenarioSetId === record.scenarioSetId) {
      issues.push(issue(
        "scenario_set_self_supersession",
        record.scenarioSetId,
        "scenario set自身をsupersedeできません",
      ));
    }
    if (!record.supersedesScenarioSetId) continue;
    const previous = scenarioSetById.get(record.supersedesScenarioSetId);
    if (!previous) {
      issues.push(issue(
        "missing_scenario_set_parent",
        record.scenarioSetId,
        record.supersedesScenarioSetId,
      ));
      continue;
    }
    if (
      record.hypothesisId !== previous.hypothesisId ||
      record.evidencePackageHash !== previous.evidencePackageHash ||
      record.informationCutoff !== previous.informationCutoff
    ) {
      issues.push(issue(
        "scenario_set_chain_identity_mismatch",
        record.scenarioSetId,
        "hypothesis/package/cutoffをsupersessionで変更できません",
      ));
    }
    if (previous.status === "registered") {
      issues.push(issue(
        "registered_scenario_set_is_terminal",
        record.scenarioSetId,
        previous.scenarioSetId,
      ));
    }
    if (Date.parse(record.createdAt) <= Date.parse(previous.createdAt)) {
      issues.push(issue(
        "scenario_set_created_at_not_monotonic",
        record.scenarioSetId,
        `${record.createdAt} <= ${previous.createdAt}`,
      ));
    }
  }

  issues.push(
    ...detectCycles(
      hypotheses.map((record) => ({
        id: record.hypothesisId,
        parent: record.supersedesHypothesisId,
      })),
      "hypothesis_supersession_cycle",
    ),
    ...detectCycles(
      scenarios.map((record) => ({
        id: record.scenarioId,
        parent: record.supersedesScenarioId,
      })),
      "scenario_supersession_cycle",
    ),
    ...detectCycles(
      scenarioSets.map((record) => ({
        id: record.scenarioSetId,
        parent: record.supersedesScenarioSetId,
      })),
      "scenario_set_supersession_cycle",
    ),
    ...oneHeadIssues(
      hypotheses.map((record) => ({
        chain: `${record.candidateId}|${record.listedSecurityEntityId}`,
        id: record.hypothesisId,
        parent: record.supersedesHypothesisId,
      })),
      "multiple_hypothesis_heads",
    ),
    ...oneHeadIssues(
      scenarios.map((record) => ({
        chain: `${record.hypothesisId}|${record.scenarioType}`,
        id: record.scenarioId,
        parent: record.supersedesScenarioId,
      })),
      "multiple_scenario_heads",
    ),
    ...oneHeadIssues(
      scenarioSets.map((record) => ({
        chain: record.hypothesisId,
        id: record.scenarioSetId,
        parent: record.supersedesScenarioSetId,
      })),
      "multiple_scenario_set_heads",
    ),
  );
  return sortIssues(issues);
}
