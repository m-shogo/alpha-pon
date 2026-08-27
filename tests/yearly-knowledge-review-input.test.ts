import assert from "node:assert/strict";
import {
  isUsableYearlyNonMoveHistory,
  isUsableYearlyRegimeHistory,
  isUsableYearlySourceHealthHistory,
} from "../src/yearly-knowledge-review-input.js";

const yearlyAsOf = "2026-08-21";
const validNonMoveHistory = {
  date: yearlyAsOf,
  code: "8136",
  name: "sample",
  category: "theme",
  hypothesis: "sample hypothesis",
  outcome: "mixed",
  nonMoveReasons: ["already_priced_in"],
  lesson: "sample lesson",
  nextAction: "review primary sources",
  source: "analogy:event:1m",
};
assert.equal(isUsableYearlyNonMoveHistory(validNonMoveHistory, yearlyAsOf), true);
assert.equal(isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, date: "2026-08-22" }, yearlyAsOf), false);
assert.equal(isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, date: "2026-02-31" }, yearlyAsOf), false);
assert.equal(isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, date: "0000-01-01" }, yearlyAsOf), false);
assert.equal(isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, nonMoveReasons: "broken" }, yearlyAsOf), false);
assert.equal(
  isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, nonMoveReasons: ["already_priced_in", "already_priced_in"] }, yearlyAsOf),
  false,
);
assert.equal(isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, nonMoveReasons: [""] }, yearlyAsOf), false);
assert.equal(isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, nonMoveReasons: [" already_priced_in"] }, yearlyAsOf), false);
for (const field of ["code", "name", "category", "hypothesis", "outcome", "lesson", "nextAction", "source"] as const) {
  assert.equal(
    isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, [field]: "" }, yearlyAsOf),
    false,
    `${field} empty provenance must fail closed`,
  );
  assert.equal(
    isUsableYearlyNonMoveHistory({ ...validNonMoveHistory, [field]: ` ${validNonMoveHistory[field]} ` }, yearlyAsOf),
    false,
    `${field} padded provenance must fail closed`,
  );
}
assert.equal(
  isUsableYearlyNonMoveHistory({ date: yearlyAsOf, nonMoveReasons: ["already_priced_in"] }, yearlyAsOf),
  false,
);
assert.equal(isUsableYearlyNonMoveHistory(null, yearlyAsOf), false);

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
    sourceHealth: { exists: true, size: 256 },
    daily: { exists: true, size: 128 },
    scores: { exists: false, size: 0 },
    proposals: { exists: true, size: 64 },
    stockPro: { exists: true, size: 64 },
    regime: { exists: true, size: 64 },
  },
};
assert.equal(isUsableYearlySourceHealthHistory(validSourceHealth, yearlyAsOf), true);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "2026-08-22" }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "2026-02-31" }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ ...validSourceHealth, date: "0000-01-01" }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: null }, yearlyAsOf), false);
assert.equal(isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: {} }, yearlyAsOf), false);
assert.equal(
  isUsableYearlySourceHealthHistory({
    ...validSourceHealth,
    reports: { ...validSourceHealth.reports, sourceHealth: undefined },
  }, yearlyAsOf),
  false,
);
assert.equal(isUsableYearlySourceHealthHistory({ date: yearlyAsOf, reports: { daily: null } }, yearlyAsOf), false);
assert.equal(
  isUsableYearlySourceHealthHistory({
    ...validSourceHealth,
    reports: { ...validSourceHealth.reports, daily: { exists: true, size: -1 } },
  }, yearlyAsOf),
  false,
);
assert.equal(
  isUsableYearlySourceHealthHistory({
    ...validSourceHealth,
    reports: { ...validSourceHealth.reports, daily: { exists: "yes", size: 1 } },
  }, yearlyAsOf),
  false,
);
assert.equal(
  isUsableYearlySourceHealthHistory({
    ...validSourceHealth,
    reports: { ...validSourceHealth.reports, bogus: { exists: false, size: 0 } },
  }, yearlyAsOf),
  false,
  "unknown report keys must not become yearly missing-report evidence",
);

console.log("yearly-knowledge-review-input.test.ts passed");