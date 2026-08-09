import assert from "node:assert/strict";
import {
  buildFoundationReadinessReadOnlyFollowUp,
} from "../src/research/foundation-readiness-readonly-advisory.js";

const cwd = "/repo/alpha-pon";
const auditPath = "/repo/alpha-pon/data/edinet/sanrio-acquisition.20260809T120000Z/configured-foundation-readiness-audit-v1.20260809T121500Z.json";
const followUp = buildFoundationReadinessReadOnlyFollowUp(auditPath, cwd);

assert.equal(followUp.purpose, "foundation_readiness_remediation_plan");
assert.equal(followUp.foundationGateStillPending, true);
assert.equal(
  followUp.command,
  [
    "bash scripts/run-foundation-readiness-remediation-plan-local.sh \\",
    "  --audit 'data/edinet/sanrio-acquisition.20260809T120000Z/configured-foundation-readiness-audit-v1.20260809T121500Z.json' \\",
    "  --execute-remediation-plan",
  ].join("\n"),
);
assert.doesNotMatch(followUp.command, /foundation-mapping|preview|append|replacement/i);

assert.throws(
  () => buildFoundationReadinessReadOnlyFollowUp(
    "/repo/alpha-pon/data/edinet/sanrio-acquisition.20260809T120000Z/not-an-audit.json",
    cwd,
  ),
  /readiness audit filename is invalid/,
);
assert.throws(
  () => buildFoundationReadinessReadOnlyFollowUp(
    "/repo/other/configured-foundation-readiness-audit-v1.20260809T121500Z.json",
    cwd,
  ),
  /readiness audit path must remain inside the repository/,
);
assert.throws(
  () => buildFoundationReadinessReadOnlyFollowUp(
    "/repo/alpha-pon/tmp/configured-foundation-readiness-audit-v1.20260809T121500Z.json",
    cwd,
  ),
  /readiness audit path must remain under data\/edinet/,
);

console.log("foundation-readiness-readonly-advisory.test.ts passed");
