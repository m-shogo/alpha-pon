import { validateGovernedDecisionFirewallRepository } from "../decision-firewall-governed-repository.js";

const result = validateGovernedDecisionFirewallRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Governed Decision Firewall: records=${result.recordCount} activeHeads=${result.activeHeadCount} stockEligible=${result.stockEligibleHeadCount} personalEligible=${result.personalEligibleHeadCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.recordCount === 0) {
  console.log("Strict Decision Firewall contracts are valid, but no local record exists. Milestone remains unproven.");
} else {
  console.log("✓ GOVERNED_DECISION_FIREWALL_RECORDS_VALID");
  console.log("Unknowns are fail-closed, replay manifests are hash-verified, and no order is authorized.");
}
