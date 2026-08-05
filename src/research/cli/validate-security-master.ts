import { validateSecurityMasterRepository } from "../security-master-repository.js";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const result = validateSecurityMasterRepository({ asOf: argValue("as-of") });
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Security Master: entityRecords=${result.entityRecordCount} relationshipRecords=${result.relationshipRecordCount} activeEntities=${result.activeEntityCount} activeRelationships=${result.activeRelationshipCount} unresolvedEntities=${result.unresolvedEntityCount} unresolvedRelationships=${result.unresolvedRelationshipCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.entityRecordCount === 0) {
  console.log("Security Master contracts are valid, but no local entity record exists. Milestone remains unproven.");
} else {
  console.log("✓ SECURITY_MASTER_RECORDS_VALID");
  console.log("Only exact verified identifiers may be resolved for downstream research.");
}
