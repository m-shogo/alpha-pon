import {
  validateDocumentRevisionDiffRepository,
} from "../document-revision-diff-repository.js";

const result = validateDocumentRevisionDiffRepository();
for (const issue of result.issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.target}: ${issue.message}`);
}

const errors = result.issues.filter((issue) => issue.severity === "error");
console.log(
  `Document Revision/Diff: revisions=${result.revisionRecordCount} diffs=${result.diffRecordCount} activeRevisionHeads=${result.activeRevisionHeadCount} activeDiffHeads=${result.activeDiffHeadCount} snapshotRevisions=${result.snapshotRevisionCount} snapshotDiffs=${result.snapshotDiffCount} claimEligibleChanges=${result.claimEligibleChangeCount} errors=${errors.length} warnings=${result.issues.length - errors.length}`,
);

if (errors.length > 0) {
  process.exitCode = 1;
} else if (result.revisionRecordCount === 0) {
  console.log("Document Revision/Diff contracts are valid, but no local revision record exists. Milestone remains unproven.");
} else {
  console.log("✓ DOCUMENT_REVISION_DIFF_RECORDS_VALID");
  console.log("Confirmed changes remain Claim inputs only; they are not Recommendations or orders.");
}
