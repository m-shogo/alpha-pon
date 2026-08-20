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

const sourceHealthAsOf = "2026-08-21";
const validSourceHealth = {
  date: sourceHealthAsOf,
  reports: {
    daily: { exists: true, size: 128 },
    scores: { exists: false, size: 0 },
  },
};
assert.equal(isUsableYearlySourceHealthHistory(validSourceHealth, sourceHealthAsOf), true);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "2026-08-22" }, sourceHealthAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "2026-02-31" }, sourceHealthAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "0000-01-01" }, sourceHealthAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ date: sourceHealthAsOf, reports: null }, sourceHealthAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ date: sourceHealthAsOf, reports: { daily: null } }, sourceHealthAsOf), false);
assert.equal(
  isUsableYearlySourceHealthHistory({ date: sourceHealthAsOf, reports: { daily: { exists: true, size: -1 } } }, sourceHealthAsOf),
  false,
);
assert.equal(
  isUsableYearlySourceHealthHistory({ date: sourceHealthAsOf, reports: { daily: { exists: "yes", size: 1 } } }, sourceHealthAsOf),
  false,
);

console.log("yearly-knowledge-review-input.test.ts passed");
