import {
  validateHypothesisScenarioRepository,
} from "../testable-hypothesis-scenario-repository.js";

const result = validateHypothesisScenarioRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Hypothesis/Scenario: hypotheses=${result.hypothesisCount} registeredHypothesisHeads=${result.registeredHypothesisHeadCount} scenarios=${result.scenarioCount} registeredScenarioHeads=${result.registeredScenarioHeadCount} scenarioSets=${result.scenarioSetCount} registeredScenarioSetHeads=${result.registeredScenarioSetHeadCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);

if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.hypothesisCount === 0) {
  console.log("Hypothesis/Scenario contracts are valid, but no local hypothesis exists. Milestone remains unproven.");
} else if (result.registeredScenarioSetHeadCount === 0) {
  console.log("Hypothesis records exist, but no governed registered four-scenario set exists.");
} else {
  console.log("✓ TESTABLE_HYPOTHESIS_SCENARIO_RECORDS_VALID");
  console.log("Registered hypotheses remain research records only; they do not authorize Recommendation, BUY or order.");
}
