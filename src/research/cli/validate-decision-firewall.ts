import { validateDecisionFirewallRepository } from "../decision-firewall-repository.js";

const result = validateDecisionFirewallRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Decision Firewall: records=${result.recordCount} activeHeads=${result.activeHeadCount} stockEligible=${result.stockEligibleHeadCount} personalEligible=${result.personalEligibleHeadCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.recordCount === 0) {
  console.log("Decision Firewall contracts are valid, but no local record exists. Firewall milestone remains unproven.");
} else {
  console.log("✓ DECISION_FIREWALL_RECORDS_VALID");
  console.log("Eligibility is not a BUY recommendation and never authorizes an order.");
}
