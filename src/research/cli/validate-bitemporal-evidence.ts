import { validateBitemporalEvidenceRepository } from "../bitemporal-evidence-repository.js";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const result = validateBitemporalEvidenceRepository({ asOf: argValue("as-of") });
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Bitemporal Evidence: records=${result.evidenceRecordCount} relations=${result.relationRecordCount} snapshotEvidence=${result.snapshotEvidenceCount} snapshotRelations=${result.snapshotRelationCount} recommendationEligible=${result.recommendationEligibleCount} correctedOrRetracted=${result.correctedOrRetractedCount} discoveryOnly=${result.discoveryOnlyCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);
if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.evidenceRecordCount === 0) {
  console.log("Bitemporal Evidence contracts are valid, but no local evidence record exists. Milestone remains unproven.");
} else {
  console.log("✓ BITEMPORAL_EVIDENCE_RECORDS_VALID");
  console.log("Latest truth never overwrites issue-time evidence; Recommendation uses system_replay only.");
}
