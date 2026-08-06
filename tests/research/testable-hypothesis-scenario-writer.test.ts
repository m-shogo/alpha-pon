import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildHypothesisScenarioSetGoverned,
  validateHypothesisScenarioRecordGoverned,
  validateHypothesisScenarioSetGoverned,
} from "../../src/research/testable-hypothesis-scenario-hardening.js";
import {
  validateTestableHypothesisRecord,
  type HypothesisScenarioIssue,
  type HypothesisScenarioRecord,
  type HypothesisScenarioSet,
  type TestableHypothesisRecord,
} from "../../src/research/testable-hypothesis-scenario.js";
import {
  appendHypothesisScenarioRecordsGoverned,
} from "../../src/research/testable-hypothesis-scenario-writer.js";
import {
  completeHypothesisEvidencePackage,
  hypothesisClaimMap,
  hypothesisScenarioSchemas,
  registeredScenarioSetRecords,
  testableHypothesis,
} from "./testable-hypothesis-scenario-fixtures.js";

const packageManifest = completeHypothesisEvidencePackage();
const claims = hypothesisClaimMap();

function validateStore(
  hypotheses: TestableHypothesisRecord[],
  scenarios: HypothesisScenarioRecord[],
  scenarioSets: HypothesisScenarioSet[],
): HypothesisScenarioIssue[] {
  const issues: HypothesisScenarioIssue[] = [];
  const hypothesisById = new Map(
    hypotheses.map((record) => [record.hypothesisId, record]),
  );
  const scenarioById = new Map(
    scenarios.map((record) => [record.scenarioId, record]),
  );
  for (const hypothesis of hypotheses) {
    issues.push(...validateTestableHypothesisRecord(
      hypothesis,
      hypothesisScenarioSchemas.hypothesis,
      packageManifest,
      claims,
    ));
  }
  for (const scenario of scenarios) {
    const hypothesis = hypothesisById.get(scenario.hypothesisId);
    if (!hypothesis) {
      issues.push({
        severity: "error",
        code: "missing_fixture_hypothesis",
        target: scenario.scenarioId,
        message: scenario.hypothesisId,
      });
      continue;
    }
    issues.push(...validateHypothesisScenarioRecordGoverned(
      scenario,
      hypothesisScenarioSchemas,
      hypothesis,
      packageManifest,
    ));
  }
  for (const scenarioSet of scenarioSets) {
    const hypothesis = hypothesisById.get(scenarioSet.hypothesisId);
    if (!hypothesis) continue;
    const members = scenarioSet.scenarioIds
      .map((id) => scenarioById.get(id))
      .filter((record): record is HypothesisScenarioRecord => Boolean(record));
    issues.push(...validateHypothesisScenarioSetGoverned(
      scenarioSet,
      hypothesisScenarioSchemas,
      {
        scenarioSetId: scenarioSet.scenarioSetId,
        createdAt: scenarioSet.createdAt,
        ...(scenarioSet.registeredAt
          ? { registeredAt: scenarioSet.registeredAt }
          : {}),
      },
      hypothesis,
      packageManifest,
      members,
    ));
  }
  return issues;
}

{
  const dir = mkdtempSync(join(tmpdir(), "hypothesis-scenario-writer-"));
  const paths = {
    hypotheses: join(dir, "hypotheses.jsonl"),
    scenarios: join(dir, "scenarios.jsonl"),
    scenarioSets: join(dir, "scenario-sets.jsonl"),
  };
  const hypothesis = testableHypothesis();
  const scenarios = registeredScenarioSetRecords();
  const scenarioSet = buildHypothesisScenarioSetGoverned(
    {
      scenarioSetId: "scenario-set:writer:001",
      createdAt: "2026-08-06T00:39:00+09:00",
      registeredAt: "2026-08-06T00:40:00+09:00",
    },
    hypothesis,
    packageManifest,
    scenarios,
  );
  try {
    appendHypothesisScenarioRecordsGoverned(
      paths,
      {
        hypotheses: [hypothesis],
        scenarios,
        scenarioSets: [scenarioSet],
      },
      "hypothesis-scenario-writer-owner",
      validateStore,
    );
    assert.equal(readFileSync(paths.hypotheses, "utf-8").trim().split("\n").length, 1);
    assert.equal(readFileSync(paths.scenarios, "utf-8").trim().split("\n").length, 4);
    assert.equal(readFileSync(paths.scenarioSets, "utf-8").trim().split("\n").length, 1);
    assert.equal(existsSync(`${paths.hypotheses}.batch-journal.json`), false);
    assert.equal(existsSync(`${paths.hypotheses}.hypothesis-scenario.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("testable-hypothesis-scenario-writer: committed bundle OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "hypothesis-scenario-writer-tamper-"));
  const paths = {
    hypotheses: join(dir, "hypotheses.jsonl"),
    scenarios: join(dir, "scenarios.jsonl"),
    scenarioSets: join(dir, "scenario-sets.jsonl"),
  };
  const tampered = {
    ...testableHypothesis(),
    contentHash: "0".repeat(64),
  };
  try {
    assert.throws(
      () => appendHypothesisScenarioRecordsGoverned(
        paths,
        { hypotheses: [tampered], scenarios: [], scenarioSets: [] },
        "hypothesis-scenario-tamper-owner",
        validateStore,
      ),
      /invalid_hypothesis_hash/,
    );
    assert.equal(existsSync(`${paths.hypotheses}.hypothesis-scenario.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("testable-hypothesis-scenario-writer: tamper block and lock cleanup OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "hypothesis-scenario-writer-journal-"));
  const paths = {
    hypotheses: join(dir, "hypotheses.jsonl"),
    scenarios: join(dir, "scenarios.jsonl"),
    scenarioSets: join(dir, "scenario-sets.jsonl"),
  };
  try {
    writeFileSync(
      `${paths.hypotheses}.batch-journal.json`,
      `${JSON.stringify({ state: "scenarios_appended" })}\n`,
      "utf-8",
    );
    assert.throws(
      () => appendHypothesisScenarioRecordsGoverned(
        paths,
        { hypotheses: [testableHypothesis()], scenarios: [], scenarioSets: [] },
        "hypothesis-scenario-journal-owner",
        validateStore,
      ),
      /incomplete_hypothesis_scenario_batch/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("testable-hypothesis-scenario-writer: incomplete journal fail-closed OK");
}

console.log("testable-hypothesis-scenario-writer: 全テスト成功");
