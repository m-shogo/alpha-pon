import assert from "node:assert/strict";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
  resolveHistoricalThresholdCalibrationEligibilityDetailed,
} from "../src/idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";

const cases = new Map(loadHistoricalShockCases().map(item => [item.id, item]));
const contexts = loadHistoricalShockCaseContext();

function calibration(id: string) {
  const item = cases.get(id);
  assert(item, `missing historical case: ${id}`);
  return resolveHistoricalThresholdCalibrationEligibilityDetailed(item, contexts.get(id));
}

for (const [id, expectedScore] of [
  ["ootoya-2019-employee-video", 11],
  ["united-2017-flight3411", 10],
] as const) {
  const item = cases.get(id);
  assert(item, `missing low-score shadow PASS case: ${id}`);
  assert.equal(item.score, expectedScore);
  assert.equal(resolveHistoricalStrategyEligibility(item, contexts.get(id)), "confirmed_block", `${id}: below-threshold control remains production BLOCK`);
  const shadow = calibration(id);
  assert.equal(shadow.status, "confirmed_pass", `${id}: explicit shadow PASS requires checkpoint-safe research`);
  assert.deepEqual(shadow.blockers, [], `${id}: shadow PASS cannot retain a non-score hard blocker`);
  assert.deepEqual(shadow.missingEvidence, [], `${id}: shadow PASS cannot retain unresolved evidence`);
}

for (const id of [
  "papa-johns-2018-schnatter",
  "cbs-2018-moonves",
  "super-retail-2025-heraghty",
  "wynn-2018-founder",
  "kadokawa-2022-bribery",
  "sukiya-2025-rat",
  "activision-2021-culture",
  "kobayashi-pharma-2024-benikoji",
  "kddi-2026-biglobe-circular-transactions",
  "benesse-2014-data-leak",
  "dentsu-2016-labor-violation",
  "starbucks-2018-philadelphia",
  "jal-2018-alcohol-compliance",
  "kobe-steel-2017-quality-falsification",
  "tesla-2018-musk-sec",
  "recruit-2019-rikunabi-dmp",
  "subaru-2017-final-inspection",
]) {
  const result = calibration(id);
  assert.equal(result.status, "confirmed_block", `${id} must not become a shadow control merely because its score is below 12`);
  assert(result.blockers.length > 0, `${id} needs a deterministic non-score blocker`);
}

assert(calibration("wynn-2018-founder").blockers.includes("investigationStatus=open"));
assert(calibration("wynn-2018-founder").blockers.includes("criticalLicenseOrDelistingRisk=true"));
assert(calibration("kadokawa-2022-bribery").blockers.includes("investigationStatus=open"));
assert(calibration("sukiya-2025-rat").blockers.includes("incidentClusterStatus=cascade"));
assert(calibration("activision-2021-culture").blockers.includes("recurrenceStatus=systemic"));
assert(calibration("kobayashi-pharma-2024-benikoji").blockers.includes("investigationStatus=open"));
assert(calibration("kddi-2026-biglobe-circular-transactions").blockers.includes("accountingIntegrity=0"));
assert.equal(cases.get("benesse-2014-data-leak")?.score, 9);
assert(calibration("benesse-2014-data-leak").blockers.includes("investigationStatus=open"));
assert.equal(cases.get("dentsu-2016-labor-violation")?.score, 8);
assert(calibration("dentsu-2016-labor-violation").blockers.includes("recurrenceStatus=systemic"));
assert.equal(cases.get("starbucks-2018-philadelphia")?.score, 11);
assert(calibration("starbucks-2018-philadelphia").blockers.includes("investigationStatus=open"));
assert.equal(cases.get("jal-2018-alcohol-compliance")?.score, 9);
assert(calibration("jal-2018-alcohol-compliance").blockers.includes("incidentClusterStatus=cascade"));
assert.equal(cases.get("kobe-steel-2017-quality-falsification")?.score, 8);
assert(calibration("kobe-steel-2017-quality-falsification").blockers.includes("investigationStatus=open"));
assert.equal(cases.get("tesla-2018-musk-sec")?.score, 9);
assert(calibration("tesla-2018-musk-sec").blockers.includes("investigationStatus=open"));
assert.equal(cases.get("recruit-2019-rikunabi-dmp")?.score, 11);
assert(calibration("recruit-2019-rikunabi-dmp").blockers.includes("investigationStatus=open"), "Recruit Aug26 PPC release explicitly said investigation was continuing");
assert.equal(cases.get("subaru-2017-final-inspection")?.score, 8);
assert(calibration("subaru-2017-final-inspection").blockers.includes("investigationStatus=open"), "SUBARU process-level completion inspection issue remains a hard blocker at checkpoint");

for (const [id, expectedScore] of [
  ["snow-peak-2022-yamai", 12],
  ["lululemon-2018-potdevin", 14],
  ["barnes-noble-2018-parneros", 13],
  ["eneos-2022-sugimori", 14],
  ["mcdonalds-2019-easterbrook", 15],
] as const) {
  assert.equal(cases.get(id)?.score, expectedScore, `${id}: outcome-blind candidate must stay on the score actually produced by PIT research`);
  assert(expectedScore >= 12, `${id}: high-score cases are counterexamples to cherry-picking below-threshold candidates`);
}

assert.equal(cases.get("japan-post-insurance-2019-improper-sales")?.score, 4, "Japan Post Insurance must remain a deep systemic outcome-blind control");
assert(calibration("japan-post-insurance-2019-improper-sales").blockers.includes("investigationStatus=open"));
assert(calibration("japan-post-insurance-2019-improper-sales").blockers.includes("recurrenceStatus=systemic"));

assert.equal(cases.get("intel-2018-krzanich")?.score, 14, "Intel demonstrates that high score cannot override a hard gate");
assert.equal(calibration("intel-2018-krzanich").status, "confirmed_block");
assert(calibration("intel-2018-krzanich").blockers.includes("investigationStatus=open"), "Intel same-day release explicitly called investigation ongoing");

for (const id of ["eneos-2022-sugimori", "mcdonalds-2019-easterbrook"] as const) {
  const item = cases.get(id);
  assert(item);
  assert.equal(resolveHistoricalStrategyEligibility(item, contexts.get(id)), "confirmed_pass", `${id}: score>=12 and PIT non-score gates pass; reaction/price gates remain separate`);
}

console.log("idiosyncratic-shock low-score control tests: Ootoya + United shadow PASS; batch4 adds systemic 4-point BLOCK, high-score Intel BLOCK, and high-score PIT passes");
