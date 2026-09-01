import assert from "node:assert/strict";
import { isOwnerResearchSummaryIntegritySafe } from "../../apps/web/lib/research-summary-integrity.js";

assert.equal(
  isOwnerResearchSummaryIntegritySafe({
    integrity: { status: "ok", issueCount: 0, errorCount: 0, warningCount: 0, knowledgeIssueCount: 0 },
  }),
  true,
);

assert.equal(
  isOwnerResearchSummaryIntegritySafe({
    integrity: { status: "attention", issueCount: 3, errorCount: 2, warningCount: 1, knowledgeIssueCount: 1 },
  }),
  true,
);

for (const contradictory of [
  { integrity: { status: "ok" as const, issueCount: 1, errorCount: 1, warningCount: 0, knowledgeIssueCount: 1 } },
  { integrity: { status: "attention" as const, issueCount: 0, errorCount: 0, warningCount: 0, knowledgeIssueCount: 0 } },
  { integrity: { status: "attention" as const, issueCount: 2, errorCount: 1, warningCount: 0, knowledgeIssueCount: 1 } },
  { integrity: { status: "attention" as const, issueCount: 1, errorCount: 1, warningCount: 0, knowledgeIssueCount: 2 } },
]) {
  assert.equal(
    isOwnerResearchSummaryIntegritySafe(contradictory),
    false,
    "contradictory integrity status/count projections must fail closed",
  );
}

console.log("research/owner summary: integrity status/count consistency contract OK");
