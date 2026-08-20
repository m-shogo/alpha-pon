import assert from "node:assert/strict";
import {
  isUsableYearlyRegimeHistory,
  isUsableYearlySourceHealthHistory,
} from "../src/yearly-knowledge-review-input.js";

assert.equal(
  isUsableYearlyRegimeHistory({
    activeRegimes: [{
      id: "risk-off",
      level: "high",
      why: "test",
      watchCategories: ["macro"],
      caution: ["liquidity"],
    }],
  }),
  true,
);
assert.equal(isUsableYearlyRegimeHistory({ activeRegimes: "broken" }), false);
assert.equal(isUsableYearlyRegimeHistory({ activeRegimes: ["broken"] }), false);
assert.equal(isUsableYearlyRegimeHistory(null), false);

assert.equal(
  isUsableYearlySourceHealthHistory({
    reports: {
      daily: { exists: true, size: 128 },
      scores: { exists: false, size: 0 },
    },
  }),
  true,
);
assert.equal(isUsableYearlySourceHealthHistory({ reports: null }), false);
assert.equal(isUsableYearlySourceHealthHistory({ reports: { daily: null } }), false);
assert.equal(isUsableYearlySourceHealthHistory({ reports: { daily: { exists: true, size: -1 } } }), false);
assert.equal(isUsableYearlySourceHealthHistory({ reports: { daily: { exists: "yes", size: 1 } } }), false);

console.log("yearly-knowledge-review-input.test.ts passed");
