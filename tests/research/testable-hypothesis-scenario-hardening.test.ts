import assert from "node:assert/strict";
import {
  buildHypothesisScenarioSetGoverned,
  validateHypothesisScenarioRecordGoverned,
  validateHypothesisScenarioSetGoverned,
} from "../../src/research/testable-hypothesis-scenario-hardening.js";
import {
  withHypothesisScenarioHash,
} from "../../src/research/testable-hypothesis-scenario.js";
import {
  completeHypothesisEvidencePackage,
  hypothesisScenario,
  hypothesisScenarioSchemas,
  registeredScenarioSetRecords,
  testableHypothesis,
} from "./testable-hypothesis-scenario-fixtures.js";

{
  const request = {
    scenarioSetId: "scenario-set:hardening:missing-registration",
    createdAt: "2026-08-06T00:39:00+09:00",
  };
  const scenarios = registeredScenarioSetRecords();
  const scenarioSet = buildHypothesisScenarioSetGoverned(
    request,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
    scenarios,
  );
  assert.equal(scenarioSet.status, "draft");
  assert.ok(scenarioSet.blockers.includes("scenario_set_registered_at_missing"));
  assert.deepEqual(
    validateHypothesisScenarioSetGoverned(
      scenarioSet,
      hypothesisScenarioSchemas,
      request,
      testableHypothesis(),
      completeHypothesisEvidencePackage(),
      scenarios,
    ),
    [],
  );
  console.log("testable-hypothesis-scenario-hardening: missing set registration stays valid draft OK");
}

{
  const request = {
    scenarioSetId: "scenario-set:hardening:late-registration",
    createdAt: "2026-08-06T00:39:00+09:00",
    registeredAt: "2026-09-20T15:00:00+09:00",
  };
  const scenarios = registeredScenarioSetRecords();
  const scenarioSet = buildHypothesisScenarioSetGoverned(
    request,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
    scenarios,
  );
  assert.equal(scenarioSet.status, "draft");
  assert.ok(scenarioSet.blockers.includes("scenario_set_registered_after_check_window"));
  assert.deepEqual(
    validateHypothesisScenarioSetGoverned(
      scenarioSet,
      hypothesisScenarioSchemas,
      request,
      testableHypothesis(),
      completeHypothesisEvidencePackage(),
      scenarios,
    ),
    [],
  );
  console.log("testable-hypothesis-scenario-hardening: late set registration stays draft OK");
}

{
  const valid = hypothesisScenario("upside");
  const { contentHash: _contentHash, ...input } = valid;
  const late = withHypothesisScenarioHash({
    ...input,
    registeredAt: "2026-09-20T15:00:00+09:00",
  });
  assert.ok(validateHypothesisScenarioRecordGoverned(
    late,
    hypothesisScenarioSchemas,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
  ).some((item) => item.code === "scenario_registered_after_check_window"));
  console.log("testable-hypothesis-scenario-hardening: late scenario registration block OK");
}

console.log("testable-hypothesis-scenario-hardening: 全テスト成功");
