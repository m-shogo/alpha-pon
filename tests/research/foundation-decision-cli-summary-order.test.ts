import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "src/research/cli/validate-foundation-decision-integrations.ts",
  "utf-8",
);

const failGuard = "if (errors > 0) fail(`Foundation Decision integrationに${errors}件のエラーがあります`);";
const summary = "`Foundation Decision: Record ${result.decisionCount} / Active Head ${result.activeDecisionHeadCount} / Eligible Head ${result.eligibleDecisionHeadCount}";
const greenMarker = 'console.log("✓ FOUNDATION_DECISION_INTEGRATION_STRUCTURALLY_ELIGIBLE");';

assert.ok(source.includes(failGuard), "Foundation CLI must fail on repository validation errors");
assert.ok(source.includes(summary), "Foundation CLI must retain the structural summary on valid repositories");
assert.ok(source.includes(greenMarker), "Foundation CLI must retain the structural eligibility marker on valid repositories");
assert.ok(
  source.indexOf(failGuard) < source.indexOf(summary),
  "Foundation eligibility summary must not be emitted before repository validation errors fail closed",
);
assert.ok(
  source.indexOf(failGuard) < source.indexOf(greenMarker),
  "Foundation structural green marker must remain unreachable when repository validation has errors",
);

console.log("foundation-decision-cli-summary-order: repository errors fail before eligibility summary OK");
