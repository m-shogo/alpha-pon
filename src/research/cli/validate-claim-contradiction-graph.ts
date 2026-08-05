import {
  validateClaimGraphRepository,
} from "../claim-contradiction-graph-repository.js";

const result = validateClaimGraphRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Claim Graph: records=${result.claimRecordCount} edges=${result.edgeRecordCount} activeHeads=${result.activeClaimHeadCount} snapshotClaims=${result.snapshotClaimCount} eligible=${result.recommendationEligibleClaimCount} blocked=${result.blockedClaimCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);

if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.claimRecordCount === 0) {
  console.log("Claim Graph contracts are valid, but no local Claim record exists. Milestone remains unproven.");
} else {
  console.log("✓ CLAIM_CONTRADICTION_GRAPH_RECORDS_VALID");
  console.log("This does not authorize a Recommendation, BUY, target price or order.");
}
