import { validateFoundationDecisionRepository } from "../foundation-decision-integration-repository.js";
import { fail } from "./common.js";

const result = validateFoundationDecisionRepository();

console.log(
  `Foundation Decision: Record ${result.decisionCount} / Active Head ${result.activeDecisionHeadCount} / Eligible Head ${result.eligibleDecisionHeadCount} / Blocked Head ${result.blockedDecisionHeadCount} / Price Snapshot ${result.priceSnapshotCount}`,
);

for (const item of result.issues) {
  console.log(`${item.severity.toUpperCase()} ${item.code} ${item.target}: ${item.message}`);
}

const errors = result.issues.filter((item) => item.severity === "error").length;
if (errors > 0) fail(`Foundation Decision integrationに${errors}件のエラーがあります`);

if (errors === 0 && result.eligibleDecisionHeadCount > 0) {
  console.log("✓ FOUNDATION_DECISION_INTEGRATION_STRUCTURALLY_ELIGIBLE");
  console.log("Real pilot evidenceを別途確認するまでmilestoneはgreenにしません");
} else if (errors > 0) {
  console.log("Foundation Decision integration has validation errors; structural eligibility remains fail-closed.");
} else {
  console.log("Foundation Decision contracts are present, but no eligible local decision head exists; milestone remains unproven.");
}
