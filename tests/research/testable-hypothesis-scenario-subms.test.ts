import assert from "node:assert/strict";
import {
  validateHypothesisScenarioRecord,
  validateTestableHypothesisRecord,
} from "../../src/research/testable-hypothesis-scenario.js";
import {
  completeHypothesisEvidencePackage,
  hypothesisClaimMap,
  hypothesisScenario,
  hypothesisScenarioSchemas,
  testableHypothesis,
} from "./testable-hypothesis-scenario-fixtures.js";

{
  const hypothesis = testableHypothesis({
    informationCutoff: "2026-08-06T00:25:00.000000001+09:00",
    createdAt: "2026-08-06T00:25:00.000000000+09:00",
  });
  const issues = validateTestableHypothesisRecord(
    hypothesis,
    hypothesisScenarioSchemas.hypothesis,
    completeHypothesisEvidencePackage(),
    hypothesisClaimMap(),
  );
  assert.ok(issues.some((item) => item.code === "hypothesis_created_before_cutoff"));
  console.log("testable-hypothesis-scenario-subms: 1ns hypothesis cutoff inversion blocked OK");
}

{
  const hypothesis = testableHypothesis({
    createdAt: "2026-08-06T00:35:00.000000001+09:00",
    registeredAt: "2026-08-06T00:35:00.000000000+09:00",
  });
  const issues = validateTestableHypothesisRecord(
    hypothesis,
    hypothesisScenarioSchemas.hypothesis,
    completeHypothesisEvidencePackage(),
    hypothesisClaimMap(),
  );
  assert.ok(issues.some((item) => item.code === "registered_before_created"));
  console.log("testable-hypothesis-scenario-subms: 1ns registration inversion blocked OK");
}

{
  const valid = testableHypothesis();
  const hypothesis = testableHypothesis({
    status: "draft",
    registeredAt: undefined,
    falsificationConditions: valid.falsificationConditions.map((condition, index) => ({
      ...condition,
      checkBy: index === 0
        ? "2026-08-06T00:25:00.000000001+09:00"
        : condition.checkBy,
    })),
  });
  const issues = validateTestableHypothesisRecord(
    hypothesis,
    hypothesisScenarioSchemas.hypothesis,
    completeHypothesisEvidencePackage(),
    hypothesisClaimMap(),
  );
  assert.ok(!issues.some((item) => item.code === "falsification_deadline_not_after_cutoff"));
  console.log("testable-hypothesis-scenario-subms: 1ns post-cutoff falsification deadline remains valid OK");
}

{
  const scenario = hypothesisScenario("base", {
    informationCutoff: "2026-08-06T00:25:00.000000001+09:00",
    createdAt: "2026-08-06T00:25:00.000000000+09:00",
  });
  const issues = validateHypothesisScenarioRecord(
    scenario,
    hypothesisScenarioSchemas.scenario,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
  );
  assert.ok(issues.some((item) => item.code === "scenario_created_before_cutoff"));
  console.log("testable-hypothesis-scenario-subms: 1ns scenario cutoff inversion blocked OK");
}

console.log("testable-hypothesis-scenario-subms.test.ts passed");
