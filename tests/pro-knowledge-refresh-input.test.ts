import assert from "node:assert/strict";
import {
  isUsableProKnowledgeRegime,
  isUsableProKnowledgeRegimeAsOf,
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

console.log("pro-knowledge-refresh-input.test.ts passed");
