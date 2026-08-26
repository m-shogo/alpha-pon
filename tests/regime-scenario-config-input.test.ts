import assert from "node:assert/strict";
import { normalizeRegimeScenarioConfig } from "../src/regime-scenario-config-input.js";

assert.deepEqual(
  normalizeRegimeScenarioConfig(null),
  { scenarios: {}, warnings: ["regime-scenarios.yml root/scenarios shape is invalid"] },
  "null scenario config must fail closed before Object.entries",
);
assert.deepEqual(
  normalizeRegimeScenarioConfig({ scenarios: [] }),
  { scenarios: {}, warnings: ["regime-scenarios.yml root/scenarios shape is invalid"] },
  "non-object scenario collection must fail closed",
);

const normalized = normalizeRegimeScenarioConfig({
  scenarios: {
    pandemic: {
      label: "Pandemic",
      description: "Health shock",
      watch_themes: ["health"],
      avoid_or_caution: ["travel"],
      non_move_reasons: ["priced_in"],
      evidence_checks: ["official data"],
    },
    broken: {
      label: "Broken",
      description: "Broken arrays",
      watch_themes: "health",
      avoid_or_caution: [],
      non_move_reasons: [],
      evidence_checks: [],
    },
    blank: {
      label: "Blank",
      description: "Blank evidence",
      watch_themes: ["   "],
      avoid_or_caution: [],
      non_move_reasons: [],
      evidence_checks: [],
    },
  },
});
assert.deepEqual(Object.keys(normalized.scenarios), ["pandemic"], "malformed scenario rows must not reach report join/render paths");
assert.equal(normalized.warnings.length, 2, "malformed scenario rows remain visible as warnings");

console.log("regime-scenario-config-input.test.ts passed");
