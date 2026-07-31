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
const batch3 = [
  "snow-peak-2022-yamai",
  "subaru-2017-final-inspection",
  "lululemon-2018-potdevin",
  "barnes-noble-2018-parneros",
] as const;
const batch4 = [
  "eneos-2022-sugimori",
  "japan-post-insurance-2019-improper-sales",
  "intel-2018-krzanich",
  "mcdonalds-2019-easterbrook",
] as const;
const batch5 = [
  "nissan-2018-ghosn-misconduct",
  "mitsubishi-motors-2016-fuel-economy",
  "hp-2010-hurd-resignation",
  "facebook-2018-cambridge-analytica",
] as const;

for (const id of [...batch2, ...batch3, ...batch4, ...batch5]) {
  const record = registry.get(id);
  assert(record, `${id}: selection expansion must be auto-loaded`);
  assert.equal(record.selectionMode, "retrospective_research");
  assert.equal(record.outcomeVisibilityAtSelection, "known_or_available");
  const resolved = resolveShockCaseSelection(id, record);
  assert.equal(resolved.provenance, "explicit");
  assert.equal(resolved.validationHoldoutEligible, false, `${id}: retrospective backlog research must never become prospective holdout`);
}

assert(registry.size >= batch2.length + batch3.length + batch4.length + batch5.length + 10, `base + expansion provenance should be merged: ${registry.size}`);
console.log(`idiosyncratic-shock case selection expansion tests: batch2=${batch2.length}, batch3=${batch3.length}, batch4=${batch4.length}, batch5=${batch5.length}, registry=${registry.size}`);
