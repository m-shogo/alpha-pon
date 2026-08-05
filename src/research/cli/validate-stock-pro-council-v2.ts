import { validateRepositoryStockProCouncilV2 } from "../stock-pro-council-v2-validation.js";

const result = validateRepositoryStockProCouncilV2();
const issues = [...result.catalogIssues, ...result.verdictIssues];
for (const issue of issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = issues.filter((issue) => issue.severity === "error");
console.log(
  `Stock Pro Council v2: personas=${result.personaCount} verdicts=${result.verdictCount} errors=${errors.length} warnings=${issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else {
  console.log("✓ STOCK_PRO_COUNCIL_V2_CONTRACT_GREEN");
  console.log("Catalog/schema/verdict validation only. Dissent, replay, calibration and Recommendation integration remain false gates.");
}
