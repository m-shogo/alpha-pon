import assert from "node:assert/strict";
import {
  buildHypothesisScenarioSetGoverned,
} from "../../src/research/testable-hypothesis-scenario-hardening.js";
import {
  activeHypothesisHeads,
  validateHypothesisScenarioLedgers,
} from "../../src/research/testable-hypothesis-scenario-ledger.js";
import {
  withTestableHypothesisHash,
} from "../../src/research/testable-hypothesis-scenario.js";
import {
  completeHypothesisEvidencePackage,
  registeredScenarioSetRecords,
  testableHypothesis,
} from "./testable-hypothesis-scenario-fixtures.js";

function draftHypothesis(
  hypothesisId: string,
  createdAt: string,
  supersedesHypothesisId?: string,
) {
  const registered = testableHypothesis();
  const {
    contentHash: _contentHash,
    registeredAt: _registeredAt,
    supersedesHypothesisId: _supersedesHypothesisId,
    ...input
  } = registered;
  return withTestableHypothesisHash({
    ...input,
    hypothesisId,
    createdAt,
    status: "draft",
    ...(supersedesHypothesisId ? { supersedesHypothesisId } : {}),
  });
}

{
  const first = draftHypothesis(
    "hypothesis:ledger:draft-001",
    "2026-08-06T00:35:00+09:00",
  );
  const second = draftHypothesis(
    "hypothesis:ledger:draft-002",
    "2026-08-06T00:40:00+09:00",
    first.hypothesisId,
  );
  assert.deepEqual(
    validateHypothesisScenarioLedgers([first, second], [], []),
    [],
  );
  assert.deepEqual(
    activeHypothesisHeads([first, second]).map((record) => record.hypothesisId),
    [second.hypothesisId],
  );
  console.log("testable-hypothesis-scenario-ledger: draft supersession OK");
}

{
  const registered = testableHypothesis();
  const attempted = draftHypothesis(
    "hypothesis:ledger:after-registered",
    "2026-08-06T00:45:00+09:00",
    registered.hypothesisId,
  );
  assert.ok(validateHypothesisScenarioLedgers(
    [registered, attempted],
    [],
    [],
  ).some((item) => item.code === "registered_hypothesis_is_terminal"));
  console.log("testable-hypothesis-scenario-ledger: registered hypothesis terminal OK");
}

{
  const first = draftHypothesis(
    "hypothesis:ledger:cycle-a",
    "2026-08-06T00:35:00+09:00",
    "hypothesis:ledger:cycle-b",
  );
  const second = draftHypothesis(
    "hypothesis:ledger:cycle-b",
    "2026-08-06T00:40:00+09:00",
    first.hypothesisId,
  );
  assert.ok(validateHypothesisScenarioLedgers([first, second], [], [])
    .some((item) => item.code === "hypothesis_supersession_cycle"));
  console.log("testable-hypothesis-scenario-ledger: hypothesis cycle block OK");
}

{
  const hypothesis = testableHypothesis();
  const packageManifest = completeHypothesisEvidencePackage();
  const scenarios = registeredScenarioSetRecords();
  const scenarioSet = buildHypothesisScenarioSetGoverned(
    {
      scenarioSetId: "scenario-set:ledger:registered",
      createdAt: "2026-08-06T00:39:00+09:00",
      registeredAt: "2026-08-06T00:40:00+09:00",
    },
    hypothesis,
    packageManifest,
    scenarios,
  );
  assert.deepEqual(
    validateHypothesisScenarioLedgers(
      [hypothesis],
      scenarios,
      [scenarioSet],
    ),
    [],
  );
  console.log("testable-hypothesis-scenario-ledger: registered bundle ledger OK");
}

console.log("testable-hypothesis-scenario-ledger: 全テスト成功");
