import assert from "node:assert/strict";
import { loadShockCaseSelection, resolveShockCaseSelection } from "../src/idiosyncratic-shock-case-selection.js";

const registry = loadShockCaseSelection();
const batch2 = [
  "jal-2018-alcohol-compliance",
  "kobe-steel-2017-quality-falsification",
  "recruit-2019-rikunabi-dmp",
  "equifax-2017-cybersecurity-breach",
  "tesla-2018-musk-sec",
  "wells-fargo-2016-unauthorized-accounts",
] as const;

for (const id of batch2) {
  const record = registry.get(id);
  assert(record, `${id}: selection expansion must be auto-loaded`);
  assert.equal(record.selectionMode, "retrospective_research");
  assert.equal(record.outcomeVisibilityAtSelection, "known_or_available");
  const resolved = resolveShockCaseSelection(id, record);
  assert.equal(resolved.provenance, "explicit");
  assert.equal(resolved.validationHoldoutEligible, false, `${id}: retrospective backlog research must never become prospective holdout`);
}

assert(registry.size >= batch2.length + 10, `base + expansion provenance should be merged: ${registry.size}`);
console.log(`idiosyncratic-shock case selection expansion tests: batch2=${batch2.length}, registry=${registry.size}`);
