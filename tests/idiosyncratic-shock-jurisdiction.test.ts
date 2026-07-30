import assert from "node:assert/strict";
import {
  buildShockJurisdictionReview,
  inferShockJurisdictionGroup,
  jurisdictionAnalogyPenalty,
  shockCategoryJurisdictionSensitivity,
} from "../src/idiosyncratic-shock-jurisdiction.js";

assert.equal(inferShockJurisdictionGroup({ country: "JP" }), "JP");
assert.equal(inferShockJurisdictionGroup({ country: "US" }), "US");
assert.equal(inferShockJurisdictionGroup({ country: "DE" }), "EUROPE");
assert.equal(inferShockJurisdictionGroup({ country: "AU" }), "COMMONWEALTH");
assert.equal(inferShockJurisdictionGroup({ market: "US" }), "US");

assert.equal(shockCategoryJurisdictionSensitivity("executive_relationship"), "high");
assert.equal(shockCategoryJurisdictionSensitivity("employee_sabotage"), "high");
assert.equal(shockCategoryJurisdictionSensitivity("personal_compensation"), "medium");
assert.equal(shockCategoryJurisdictionSensitivity("accounting_fraud"), "low");
assert.equal(shockCategoryJurisdictionSensitivity("quality_falsification"), "low");

assert.equal(jurisdictionAnalogyPenalty({
  category: "executive_relationship",
  candidateCountry: "US",
  historicalCountry: "US",
}), 0, "同国の文化依存事例はpenaltyなし");

assert.equal(jurisdictionAnalogyPenalty({
  category: "executive_relationship",
  candidateCountry: "US",
  historicalCountry: "JP",
}), 4, "恋愛/行動問題は遠いjurisdictionを強く割り引く");

assert.equal(jurisdictionAnalogyPenalty({
  category: "accounting_fraud",
  candidateCountry: "US",
  historicalCountry: "JP",
}), 1, "粉飾は国をまたいでも構造比較を強く残す");

const historical = [
  { category: "executive_relationship", country: "US" },
  { category: "executive_relationship", country: "JP" },
  { category: "accounting_fraud", country: "US" },
  { category: "accounting_fraud", country: "JP" },
];

const thinUsRelationship = buildShockJurisdictionReview({
  category: "executive_relationship",
  country: "US",
  market: "US",
}, historical);
assert.equal(thinUsRelationship.sensitivity, "high");
assert.equal(thinUsRelationship.sameCountryCategoryCases, 1);
assert.equal(thinUsRelationship.manualReviewRequired, true);
assert.equal(thinUsRelationship.blockers.length, 1);

const enoughUsRelationship = buildShockJurisdictionReview({
  category: "executive_relationship",
  country: "US",
  market: "US",
}, [...historical, { category: "executive_relationship", country: "US" }]);
assert.equal(enoughUsRelationship.sameCountryCategoryCases, 2);
assert.equal(enoughUsRelationship.confidence, "adequate");
assert.equal(enoughUsRelationship.manualReviewRequired, false);

const crossCountryAccounting = buildShockJurisdictionReview({
  category: "accounting_fraud",
  country: "US",
  market: "US",
}, [{ category: "accounting_fraud", country: "JP" }]);
assert.equal(crossCountryAccounting.sensitivity, "low");
assert.equal(crossCountryAccounting.sameCountryCategoryCases, 0);
assert.equal(crossCountryAccounting.manualReviewRequired, false, "会計不正は同国不足だけでblockしない");

console.log("idiosyncratic-shock jurisdiction tests: OK");
