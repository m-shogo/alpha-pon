import { validateRepositoryCouncilLedgersGoverned } from "../stock-pro-council-ledger-hardening.js";

const result = validateRepositoryCouncilLedgersGoverned();
const issues = [
  ...result.catalogIssues,
  ...result.dissentIssues,
  ...result.vetoIssues,
  ...result.lifecycleIssues,
];
for (const issue of issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = issues.filter((issue) => issue.severity === "error");
console.log(
  `Council ledgers: dissent=${result.dissentCount} veto=${result.vetoCount} bindingVeto=${result.bindingVetoCount} errors=${errors.length} warnings=${issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else {
  console.log("✓ COUNCIL_DISSENT_VETO_LEDGER_GREEN");
  console.log("A binding veto remains binding until a valid append-only clearance revision exists.");
}
