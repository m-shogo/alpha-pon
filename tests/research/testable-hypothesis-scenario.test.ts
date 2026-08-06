import assert from "node:assert/strict";
import {
  buildHypothesisScenarioSet,
  computeHypothesisScenarioSetHash,
  validateHypothesisScenarioRecord,
  validateHypothesisScenarioSet,
  validateTestableHypothesisRecord,
  withHypothesisScenarioHash,
  withTestableHypothesisHash,
} from "../../src/research/testable-hypothesis-scenario.js";
import {
  completeHypothesisEvidencePackage,
  hypothesisClaimMap,
  hypothesisScenario,
  hypothesisScenarioSchemas,
  registeredScenarioSetRecords,
  testableHypothesis,
} from "./testable-hypothesis-scenario-fixtures.js";

{
  const hypothesis = testableHypothesis();
  const packageManifest = completeHypothesisEvidencePackage();
  assert.deepEqual(
    validateTestableHypothesisRecord(
      hypothesis,
      hypothesisScenarioSchemas.hypothesis,
      packageManifest,
      hypothesisClaimMap(),
    ),
    [],
  );
  console.log("testable-hypothesis-scenario: registered hypothesis OK");
}

{
  const hypothesis = testableHypothesis();
  const complete = completeHypothesisEvidencePackage();
  const incomplete = {
    ...complete,
    status: "draft" as const,
    blockers: ["incomplete:priceSnapshotComplete"],
  };
  assert.ok(validateTestableHypothesisRecord(
    hypothesis,
    hypothesisScenarioSchemas.hypothesis,
    incomplete,
    hypothesisClaimMap(),
  ).some((item) => item.code === "registered_hypothesis_uses_incomplete_package"));
  console.log("testable-hypothesis-scenario: incomplete package registration block OK");
}

{
  const valid = testableHypothesis();
  const classMixed = withTestableHypothesisHash({
    ...valid,
    factClaimIds: [...valid.assumptionClaimIds],
    contentHash: undefined as never,
  });
  assert.ok(validateTestableHypothesisRecord(
    classMixed,
    hypothesisScenarioSchemas.hypothesis,
    completeHypothesisEvidencePackage(),
    hypothesisClaimMap(),
  ).some((item) =>
    item.code === "hypothesis_claim_class_overlap" ||
    item.code === "hypothesis_claim_class_mismatch",
  ));
  console.log("testable-hypothesis-scenario: Claim class mixing block OK");
}

{
  const valid = testableHypothesis();
  const late = withTestableHypothesisHash({
    ...valid,
    registeredAt: "2026-09-20T15:00:00+09:00",
    contentHash: undefined as never,
  });
  assert.ok(validateTestableHypothesisRecord(
    late,
    hypothesisScenarioSchemas.hypothesis,
    completeHypothesisEvidencePackage(),
    hypothesisClaimMap(),
  ).some((item) => item.code === "hypothesis_registered_after_falsification_window"));
  console.log("testable-hypothesis-scenario: post-outcome registration block OK");
}

{
  const scenario = hypothesisScenario("downside");
  assert.deepEqual(
    validateHypothesisScenarioRecord(
      scenario,
      hypothesisScenarioSchemas.scenario,
      testableHypothesis(),
      completeHypothesisEvidencePackage(),
    ),
    [],
  );
  console.log("testable-hypothesis-scenario: registered downside scenario OK");
}

{
  const valid = hypothesisScenario("downside");
  const wrongDirection = withHypothesisScenarioHash({
    ...valid,
    outcomeDimensions: valid.outcomeDimensions.map((dimension) =>
      dimension.dimension === "market_reaction"
        ? { ...dimension, direction: "positive" as const }
        : dimension,
    ),
    contentHash: undefined as never,
  });
  assert.ok(validateHypothesisScenarioRecord(
    wrongDirection,
    hypothesisScenarioSchemas.scenario,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
  ).some((item) => item.code === "downside_scenario_not_negative"));
  console.log("testable-hypothesis-scenario: scenario direction mismatch block OK");
}

{
  const scenarios = registeredScenarioSetRecords();
  const hypothesis = testableHypothesis();
  const packageManifest = completeHypothesisEvidencePackage();
  const request = {
    scenarioSetId: "scenario-set:hypothesis-fixture:001",
    createdAt: "2026-08-06T00:39:00+09:00",
    registeredAt: "2026-08-06T00:40:00+09:00",
  };
  const scenarioSet = buildHypothesisScenarioSet(
    request,
    hypothesis,
    packageManifest,
    scenarios,
  );
  assert.equal(scenarioSet.status, "registered");
  assert.deepEqual(scenarioSet.blockers, []);
  assert.deepEqual(
    validateHypothesisScenarioSet(
      scenarioSet,
      hypothesisScenarioSchemas.scenarioSet,
      request,
      hypothesis,
      packageManifest,
      scenarios,
    ),
    [],
  );
  const replayed = buildHypothesisScenarioSet(
    request,
    hypothesis,
    packageManifest,
    scenarios,
  );
  assert.equal(replayed.contentHash, scenarioSet.contentHash);
  assert.equal(
    computeHypothesisScenarioSetHash(scenarioSet),
    scenarioSet.contentHash,
  );
  console.log("testable-hypothesis-scenario: complete four-scenario set OK");
}

{
  const scenarios = registeredScenarioSetRecords()
    .filter((scenario) => scenario.scenarioType !== "null_hypothesis");
  const request = {
    scenarioSetId: "scenario-set:hypothesis-fixture:missing-null",
    createdAt: "2026-08-06T00:39:00+09:00",
    registeredAt: "2026-08-06T00:40:00+09:00",
  };
  const scenarioSet = buildHypothesisScenarioSet(
    request,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
    scenarios,
  );
  assert.equal(scenarioSet.status, "draft");
  assert.ok(scenarioSet.blockers.includes("missing_scenario_type:null_hypothesis"));
  console.log("testable-hypothesis-scenario: missing null scenario stays draft OK");
}

{
  const scenarios = registeredScenarioSetRecords();
  const request = {
    scenarioSetId: "scenario-set:hypothesis-fixture:tamper",
    createdAt: "2026-08-06T00:39:00+09:00",
    registeredAt: "2026-08-06T00:40:00+09:00",
  };
  const valid = buildHypothesisScenarioSet(
    request,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
    scenarios,
  );
  const tampered = {
    ...valid,
    scenarioHashes: [...valid.scenarioHashes].reverse(),
  };
  assert.ok(validateHypothesisScenarioSet(
    tampered,
    hypothesisScenarioSchemas.scenarioSet,
    request,
    testableHypothesis(),
    completeHypothesisEvidencePackage(),
    scenarios,
  ).some((item) =>
    item.code === "invalid_hypothesis_scenario_set_hash" ||
    item.code === "hypothesis_scenario_set_mismatch" ||
    item.code === "non_canonical_hypothesis_array",
  ));
  console.log("testable-hypothesis-scenario: scenario-set tamper block OK");
}

{
  const scenario = hypothesisScenario("base") as unknown as Record<string, unknown>;
  const errors = validate(
    { ...scenario, targetPrice: 1234 },
    hypothesisScenarioSchemas.scenario,
  );
  assert.ok(errors.some((error) => error.path === "targetPrice"));
  console.log("testable-hypothesis-scenario: target price field rejected by schema OK");
}

console.log("testable-hypothesis-scenario: 全テスト成功");
