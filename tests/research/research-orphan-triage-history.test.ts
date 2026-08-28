import assert from "node:assert/strict";
import { checkChanges, ruleForPath } from "../../src/research/history-guard.js";

const path = "research/orphan_triage/decisions.jsonl";
assert.equal(ruleForPath(path), "append_only", "human triage memory must be protected as append-only audit history");

const violations = checkChanges([
  {
    path,
    changeType: "modified",
    oldContent: "{\"decisionId\":\"decision-one\"}\n",
    newContent: "{\"decisionId\":\"decision-rewritten\"}\n",
  },
], () => ({}));

assert.equal(violations.length, 1);
assert.equal(violations[0]?.code, "not_append_only", "rewriting a prior triage decision must be rejected");

const appendViolations = checkChanges([
  {
    path,
    changeType: "modified",
    oldContent: "{\"decisionId\":\"decision-one\"}\n",
    newContent: "{\"decisionId\":\"decision-one\"}\n{\"decisionId\":\"decision-two\"}\n",
  },
], () => ({}));
assert.deepEqual(appendViolations, [], "new human decisions may only append after intact prior history");

console.log("research/orphan-triage-history: append-only guard OK");
