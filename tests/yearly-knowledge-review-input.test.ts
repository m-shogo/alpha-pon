import assert from "node:assert/strict";
import { isUsableYearlyRegimeHistory } from "../src/yearly-knowledge-review-input.js";

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

console.log("yearly-knowledge-review-input.test.ts passed");
