import assert from "node:assert/strict";
import {
  loadShockCaseSelection,
  resolveShockCaseSelection,
  validateShockCaseSelectionRecord,
} from "../src/idiosyncratic-shock-case-selection.js";

const retrospective = validateShockCaseSelectionRecord({
  registeredAt: "2026-07-31",
  selectionMode: "retrospective_research",
  outcomeVisibilityAtSelection: "known_or_available",
  selectionReason: "historical boundary case selected for calibration research",
});
assert.equal(resolveShockCaseSelection("retro", retrospective).validationHoldoutEligible, false);

const prospective = validateShockCaseSelectionRecord({
  registeredAt: "2026-07-31",
  decisionCheckpointAtRegistration: "2026-07-31",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "live case registered before the future outcome horizon was observed",
});
assert.equal(resolveShockCaseSelection("future", prospective, "2026-07-31").validationHoldoutEligible, true);
assert.equal(resolveShockCaseSelection("future", prospective, "2026-08-01").validationHoldoutEligible, false, "frozen checkpoint must match current case checkpoint");

const forgedHistoricalProspective = validateShockCaseSelectionRecord({
  registeredAt: "2026-03-30",
  decisionCheckpointAtRegistration: "2026-03-30",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "fixture attempts to relabel an existing historical case using a wrong frozen checkpoint",
});
const forgedHistoricalResolution = resolveShockCaseSelection("kddi-2026-biglobe-circular-transactions", forgedHistoricalProspective);
assert.equal(forgedHistoricalResolution.validationHoldoutEligible, false, "resolver must cross-check frozen checkpoint against historical case DB even when caller omits checkpoint");
assert.match(forgedHistoricalResolution.reason, /does not match repository case checkpoint 2026-03-31/);

assert.throws(() => validateShockCaseSelectionRecord({
  registeredAt: "2026-07-31",
  decisionCheckpointAtRegistration: "2026-07-31",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "known_or_available",
  selectionReason: "invalid prospective case because future outcome is already known",
}), /requires outcomeVisibilityAtSelection=not_observed/);

assert.throws(() => validateShockCaseSelectionRecord({
  registeredAt: "2026-08-01",
  decisionCheckpointAtRegistration: "2026-07-31",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "invalid prospective case because it was registered after the frozen checkpoint",
}), /no later than decisionCheckpointAtRegistration/);

assert.throws(() => validateShockCaseSelectionRecord({
  registeredAt: "2026-07-31",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "invalid prospective case because no checkpoint was frozen",
}), /requires decisionCheckpointAtRegistration/);

assert.throws(() => validateShockCaseSelectionRecord({
  registeredAt: "2026-07-31",
  selectionMode: "retrospective_research",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "retrospective data cannot claim pristine unseen outcome status",
}), /cannot claim not_observed/);

const legacy = resolveShockCaseSelection("legacy", null);
assert.equal(legacy.provenance, "legacy_untracked");
assert.equal(legacy.validationHoldoutEligible, false, "missing selection provenance fails closed for holdout claims");

const registry = loadShockCaseSelection();
for (const id of [
  "ootoya-2019-employee-video",
  "wynn-2018-founder",
  "kadokawa-2022-bribery",
  "sukiya-2025-rat",
  "activision-2021-culture",
  "kobayashi-pharma-2024-benikoji",
  "kddi-2026-biglobe-circular-transactions",
  "united-2017-flight3411",
]) {
  const resolved = resolveShockCaseSelection(id, registry.get(id));
  assert.equal(resolved.selectionMode, "retrospective_research");
  assert.equal(resolved.validationHoldoutEligible, false);
}

for (const id of ["kddi-2026-biglobe-circular-transactions", "united-2017-flight3411"]) {
  const record = registry.get(id);
  assert(record, `${id}: explicit selection provenance required`);
  assert.equal(record.outcomeVisibilityAtSelection, "known_or_available", `${id}: historical research must not masquerade as unseen outcome`);
}

console.log("idiosyncratic-shock case selection tests: prospective registration timing + checkpoint freeze enforced");
