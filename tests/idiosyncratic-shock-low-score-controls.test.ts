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

const ootoya = cases.get("ootoya-2019-employee-video");
assert(ootoya);
assert.equal(ootoya.score, 11);
assert.equal(resolveHistoricalStrategyEligibility(ootoya, contexts.get(ootoya.id)), "confirmed_block", "below-threshold control remains production BLOCK");
assert.equal(calibration(ootoya.id).status, "confirmed_pass", "Ootoya is an explicit shadow PASS after checkpoint-safe research");

for (const id of [
  "papa-johns-2018-schnatter",
  "cbs-2018-moonves",
  "super-retail-2025-heraghty",
  "wynn-2018-founder",
  "kadokawa-2022-bribery",
  "sukiya-2025-rat",
  "activision-2021-culture",
]) {
  const result = calibration(id);
  assert.equal(result.status, "confirmed_block", `${id} must not become a shadow control merely because its score is below 12`);
  assert(result.blockers.length > 0, `${id} needs a deterministic non-score blocker`);
}

assert(calibration("wynn-2018-founder").blockers.includes("investigationStatus=open"));
assert(calibration("wynn-2018-founder").blockers.includes("criticalLicenseOrDelistingRisk=true"));
assert(calibration("kadokawa-2022-bribery").blockers.includes("investigationStatus=open"));
assert(calibration("sukiya-2025-rat").blockers.includes("investigationStatus=open"));
assert(calibration("sukiya-2025-rat").blockers.includes("confounderStatus=major"));
assert(calibration("sukiya-2025-rat").blockers.includes("incidentClusterStatus=cascade"));
assert(calibration("activision-2021-culture").blockers.includes("investigationStatus=open"));
assert(calibration("activision-2021-culture").blockers.includes("recurrenceStatus=systemic"));
assert(calibration("activision-2021-culture").blockers.includes("remediationStatus=weak"));

console.log("idiosyncratic-shock low-score control tests: Ootoya PASS; unsafe 8-11 controls remain BLOCK");
