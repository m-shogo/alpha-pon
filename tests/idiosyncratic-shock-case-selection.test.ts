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
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "live case registered before the future outcome horizon was observed",
});
assert.equal(resolveShockCaseSelection("future", prospective).validationHoldoutEligible, true);

assert.throws(() => validateShockCaseSelectionRecord({
  registeredAt: "2026-07-31",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "known_or_available",
  selectionReason: "invalid prospective case because future outcome is already known",
}), /requires outcomeVisibilityAtSelection=not_observed/);

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
]) {
  const resolved = resolveShockCaseSelection(id, registry.get(id));
  assert.equal(resolved.selectionMode, "retrospective_research");
  assert.equal(resolved.validationHoldoutEligible, false);
}

console.log("idiosyncratic-shock case selection tests: retrospective research separated from prospective holdout");
