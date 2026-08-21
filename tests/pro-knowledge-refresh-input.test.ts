import assert from "node:assert/strict";
import {
  isUsableProKnowledgeRegime,
  isUsableProKnowledgeRegimeAsOf,
  normalizeProKnowledgeRefreshConfig,
} from "../src/pro-knowledge-refresh-input.js";

const today = "2026-08-21";
assert.equal(isUsableProKnowledgeRegimeAsOf(today, today), true);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-08-20", today), true);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-08-22", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-02-31", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf("0000-01-01", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf("2026-08-21T00:00:00+09:00", today), false);
assert.equal(isUsableProKnowledgeRegimeAsOf(undefined, today), false);

const validRegime = {
  asOf: today,
  summary: "risk-off",
  activeRegimes: [{
    id: "rates",
    level: "high",
    why: "test",
    watchCategories: ["macro"],
    caution: ["liquidity"],
  }],
};
assert.equal(isUsableProKnowledgeRegime(validRegime, today), true);
assert.equal(isUsableProKnowledgeRegime({ ...validRegime, asOf: "2026-08-22" }, today), false);
assert.equal(isUsableProKnowledgeRegime({ ...validRegime, activeRegimes: {} }, today), false);
assert.equal(isUsableProKnowledgeRegime({ ...validRegime, activeRegimes: [null] }, today), false);
assert.equal(isUsableProKnowledgeRegime({ ...validRegime, summary: 123 }, today), false);
assert.equal(isUsableProKnowledgeRegime(null, today), false);

const validConfig = {
  refreshDomains: [{
    id: "ai_compute",
    label: "AI",
    reviewCadence: "weekly",
    why: "test",
    affectedAgents: ["growth_agent"],
    watchExamples: ["GPU"],
    mustUpdateWhen: ["capex changes"],
  }],
  refreshRules: ["keep current"],
  outputRequirements: ["show sources"],
};
const normalizedConfig = normalizeProKnowledgeRefreshConfig(validConfig);
assert.ok(normalizedConfig);
assert.deepEqual(normalizedConfig?.refreshDomains[0]?.affectedAgents, ["growth_agent"]);
assert.deepEqual(normalizeProKnowledgeRefreshConfig({}), {
  refreshDomains: [],
  refreshRules: [],
  outputRequirements: [],
});
assert.equal(normalizeProKnowledgeRefreshConfig({ ...validConfig, refreshDomains: {} }), null);
assert.equal(normalizeProKnowledgeRefreshConfig({ ...validConfig, refreshDomains: [null] }), null);
assert.equal(normalizeProKnowledgeRefreshConfig({ ...validConfig, refreshDomains: [{ ...validConfig.refreshDomains[0], id: "" }] }), null);
assert.equal(
  normalizeProKnowledgeRefreshConfig({
    ...validConfig,
    refreshDomains: [validConfig.refreshDomains[0], { ...validConfig.refreshDomains[0], label: "AI duplicate" }],
  }),
  null,
  "duplicate domain ids must not produce duplicate refresh queue identities",
);
assert.equal(normalizeProKnowledgeRefreshConfig({ ...validConfig, refreshDomains: [{ ...validConfig.refreshDomains[0], affectedAgents: "broken" }] }), null);
assert.equal(normalizeProKnowledgeRefreshConfig({ ...validConfig, refreshRules: "broken" }), null);
assert.equal(normalizeProKnowledgeRefreshConfig({ ...validConfig, outputRequirements: [123] }), null);
assert.equal(normalizeProKnowledgeRefreshConfig(null), null);

console.log("pro-knowledge-refresh-input.test.ts passed");
