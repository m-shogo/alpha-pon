import assert from "node:assert/strict";
import "./idiosyncratic-shock-context-advanced.test.js";
import "./idiosyncratic-shock-calibration-config.test.js";
import {
  GLOBAL_DEFAULT_SHOCK_THRESHOLD,
  MIN_PROSPECTIVE_HOLDOUT_CASES,
  buildShockCalibrationReadiness,
  type ShockCalibrationObservation,
} from "../src/idiosyncratic-shock-calibration.js";
import { inferShockJurisdictionGroup } from "../src/idiosyncratic-shock-jurisdiction.js";
import type { ShockMarket } from "../src/idiosyncratic-shock-market.js";

function rows(input: {
  count: number;
  country: string;
  market: ShockMarket;
  category: string | ((index: number) => string);
  startYear?: number;
  prospective?: boolean;
  idPrefix?: string;
}): ShockCalibrationObservation[] {
  const startYear = input.startYear ?? 1990;
  return Array.from({ length: input.count }, (_, index) => {
    const date = `${startYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-15`;
    return {
      caseId: `${input.idPrefix ?? input.country}-${index}`,
      company: `Company ${index}`,
      checkpoint: date,
      signalDate: date,
      market: input.market,
      country: input.country,
      jurisdictionGroup: inferShockJurisdictionGroup({ country: input.country, market: input.market }),
      category: typeof input.category === "function" ? input.category(index) : input.category,
      score: 12 + (index % 5),
      benchmarkRelative1m: index % 2 === 0 ? 3 : -1,
      benchmarkRelative3m: index % 3 === 0 ? 7 : 1,
      benchmarkRelative1y: index % 4 === 0 ? 12 : 2,
      selectionMode: input.prospective ? "prospective_pre_outcome" : "retrospective_research",
      validationHoldoutEligible: input.prospective ?? false,
    };
  });
}

const sparseJp = buildShockCalibrationReadiness({
  country: "JP",
  market: "JP",
  category: "executive_relationship",
  observations: rows({ count: 10, country: "JP", market: "JP", category: "executive_relationship" }),
});
assert.equal(sparseJp.modelLevel, "global");
assert.equal(sparseJp.status, "insufficient_data");
assert.equal(sparseJp.effectiveThreshold, GLOBAL_DEFAULT_SHOCK_THRESHOLD);
assert.equal(sparseJp.effectiveThresholdSource, "global_default");

const jpCountryRows = rows({
  count: 30,
  country: "JP",
  market: "JP",
  category: index => index < 15 ? "executive_relationship" : "personal_compensation",
});
const jpCountry = buildShockCalibrationReadiness({
  country: "JP",
  market: "JP",
  category: "executive_relationship",
  observations: jpCountryRows,
});
assert.equal(jpCountry.countryCases, 30);
assert.equal(jpCountry.countryCategoryCases, 15);
assert.equal(jpCountry.modelLevel, "country", "カテゴリ母数が薄ければ国モデルへ縮退");
assert.equal(jpCountry.status, "ready_for_validation");
assert.equal(jpCountry.effectiveThreshold, 12, "prospective validation前は12点を変えない");
assert.equal(jpCountry.prospectiveHoldoutCases, 0);

const categoryAlmostReady = rows({
  count: 30,
  country: "US",
  market: "US",
  category: index => index < 20 ? "executive_relationship" : "personal_behavior",
});
const usFallback = buildShockCalibrationReadiness({
  country: "US",
  market: "US",
  category: "executive_relationship",
  observations: categoryAlmostReady,
});
assert.equal(usFallback.countryCategoryCases, 20);
assert.equal(usFallback.modelLevel, "country", "20件あってもretrospective temporal split不足なら親のcountryを使う");
assert.ok(usFallback.notes.some(note => note.includes("country-category")));

const usCategoryRows = rows({ count: 32, country: "US", market: "US", category: "executive_relationship" });
const usCategory = buildShockCalibrationReadiness({
  country: "US",
  market: "US",
  category: "executive_relationship",
  observations: usCategoryRows,
});
assert.equal(usCategory.modelLevel, "country_category");
assert.equal(usCategory.status, "ready_for_validation");
assert(usCategory.trainCases >= 18);
assert(usCategory.validationCases >= 8);
assert.equal(usCategory.prospectiveHoldoutReady, false, "retrospective chronological slice is not a prospective holdout");

const registryWithoutProspective = buildShockCalibrationReadiness({
  country: "US",
  market: "US",
  category: "executive_relationship",
  observations: usCategoryRows,
  validatedThreshold: 14,
});
assert.equal(registryWithoutProspective.status, "ready_for_validation", "registry value alone cannot promote retrospective data to validated");
assert.equal(registryWithoutProspective.effectiveThreshold, 12);
assert.equal(registryWithoutProspective.effectiveThresholdSource, "global_default");
assert(registryWithoutProspective.blockers.some(value => value.includes("prospective holdout")));

const prospectiveUs = rows({
  count: MIN_PROSPECTIVE_HOLDOUT_CASES,
  country: "US",
  market: "US",
  category: "executive_relationship",
  startYear: 2027,
  prospective: true,
  idPrefix: "prospective-us",
});
const validatedUs = buildShockCalibrationReadiness({
  country: "US",
  market: "US",
  category: "executive_relationship",
  observations: [...usCategoryRows, ...prospectiveUs],
  validatedThreshold: 14,
});
assert.equal(validatedUs.status, "validated");
assert.equal(validatedUs.effectiveThreshold, 14);
assert.equal(validatedUs.effectiveThresholdSource, "validated_local");
assert.equal(validatedUs.prospectiveHoldoutCases, MIN_PROSPECTIVE_HOLDOUT_CASES);
assert.equal(validatedUs.prospectiveHoldoutReady, true);
assert.equal(validatedUs.usableOutcomeCases, 32, "prospective holdout must not leak back into threshold fitting sample");

const europeRows = [
  ...rows({ count: 20, country: "DE", market: "EUROPE", category: "accounting_fraud" }),
  ...rows({ count: 20, country: "FR", market: "EUROPE", category: "accounting_fraud", startYear: 2000, idPrefix: "FR" }),
];
const deGroupFallback = buildShockCalibrationReadiness({
  country: "DE",
  market: "EUROPE",
  category: "accounting_fraud",
  observations: europeRows,
});
assert.equal(deGroupFallback.countryCases, 20);
assert.equal(deGroupFallback.groupCases, 40);
assert.equal(deGroupFallback.modelLevel, "jurisdiction_group", "国が薄ければ十分な地域モデルへ縮退");
assert.equal(deGroupFallback.status, "ready_for_validation");

const missing3m = rows({ count: 40, country: "JP", market: "JP", category: "quality_falsification" })
  .map(row => ({ ...row, benchmarkRelative3m: null }));
const unusable = buildShockCalibrationReadiness({
  country: "JP",
  market: "JP",
  category: "quality_falsification",
  observations: missing3m,
});
assert.equal(unusable.globalCases, 0, "signal後3か月benchmark相対が無い事例はcalibration母数へ入れない");
assert.equal(unusable.modelLevel, "global");

const noSignal = rows({ count: 40, country: "US", market: "US", category: "personal_behavior" })
  .map(row => ({ ...row, signalDate: null }));
const noTradeIgnored = buildShockCalibrationReadiness({
  country: "US",
  market: "US",
  category: "personal_behavior",
  observations: noSignal,
});
assert.equal(noTradeIgnored.globalCases, 0, "no-tradeケースを0%リターンとしてcalibrationへ混ぜない");
assert.equal(noTradeIgnored.modelLevel, "global");

console.log("idiosyncratic-shock calibration tests: retrospective temporal validation + prospective holdout separated");
