import {
  validateEvidencePackageRepository,
} from "../evidence-package-repository.js";

const result = validateEvidencePackageRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Evidence Packages: manifests=${result.manifestCount} activeHeads=${result.activeHeadCount} draftHeads=${result.draftHeadCount} completeHeads=${result.completeHeadCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);

if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.manifestCount === 0) {
  console.log("Evidence Package contracts are valid, but no local manifest exists. Milestone remains unproven.");
} else if (result.completeHeadCount === 0) {
  console.log("Evidence Package manifests are structurally valid, but no governed complete head exists.");
} else {
  console.log("✓ EVIDENCE_PACKAGE_MANIFESTS_VALID");
  console.log("A complete package is a Council input only; it is not a Recommendation, BUY or order.");
}
