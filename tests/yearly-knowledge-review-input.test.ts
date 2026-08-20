import assert from "node:assert/strict";
import {
  isUsableYearlyRegimeHistory,
  isUsableYearlySourceHealthHistory,
} from "../src/yearly-knowledge-review-input.js";

const yearlyAsOf = "2026-08-21";
const validRegimeHistory = {
  date: yearlyAsOf,
  activeRegimes: [{
    id: "risk-off",
    level: "high",
    why: "test",
    watchCategories: ["macro"],
    caution: ["liquidity"],
  }],
};
assert.equal(isUsableYearlyRegimeHistory(validRegimeHistory, yearlyAsOf), true);
assert.equal(isUsableYearlyRegimeHistory({ ...validRegimeHistory, date: "2026-08-22" }, yearlyAsOf), false);
assert.equal(isUsableYearlyRegimeHistory({ ...validRegimeHistory, date: "2026-02-31" }, yearlyAsOf), false);
assert.equal(isUsableYearlyRegimeHistory({ ...validRegimeHistory, date: "0000-01-01" }, yearlyAsOf), false);
assert.equal(isUsableYearlyRegimeHistory({ date: yearlyAsOf, activeRegimes: "broken" }, yearlyAsOf), false);
assert.equal(isUsableYearlyRegimeHistory({ date: yearlyAsOf, activeRegimes: ["broken"] }, yearlyAsOf), false);
assert.equal(isUsableYearlyRegimeHistory(null, yearlyAsOf), false);

const validSourceHealth = {
  date: yearlyAsOf,
  reports: {
    daily: { exists: true, size: 128 },
    scores: { exists: false, size: 0 },
  },
};
assert.equal(isUsableYearlySourceHealthHistory(validSourceHealth, yearlyAsOf), true);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "2026-08-22" }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "2026-02-31" }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "0000-01-01" }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: null }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: { daily: null } }, yearlyAsOf), false);
assert.equal(
  isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: { daily: { exists: true, size: -1 } } }, yearlyAsOf),
  false,
);
assert.equal(
  isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: { daily: { exists: "yes", size: 1 } } }, yearlyAsOf),
  false,
);

console.log("yearly-knowledge-review-input.test.ts passed");
