import assert from "node:assert/strict";
import {
  findValidatedLocalThreshold,
  loadShockCalibrationConfig,
  resolveShockCalibration,
  validateShockCalibrationConfig,
  type ShockCalibrationConfig,
} from "../src/idiosyncratic-shock-calibration-config.js";
import { inferShockJurisdictionGroup, type ShockJurisdictionGroup } from "../src/idiosyncratic-shock-jurisdiction.js";
import type { ShockCalibrationObservation } from "../src/idiosyncratic-shock-calibration.js";

const committed = loadShockCalibrationConfig();
assert.equal(committed.globalDefaultThreshold, 12);
assert.equal(committed.validatedLocalThresholds.length, 0, "初期状態ではlocal thresholdを有効化しない");

const invalid: ShockCalibrationConfig = {
  version: 1,
  globalDefaultThreshold: 12,
  validatedLocalThresholds: [{
    id: "bad-overlap",
    modelLevel: "country",
    country: "US",
    market: "US",
    threshold: 14,
    trainFrom: "2020-01-01",
    trainThrough: "2024-12-31",
    validationFrom: "2024-01-01",
    validationThrough: "2025-12-31",
    trainCases: 30,
    validationCases: 8,
    benchmarkMetric: "benchmarkRelative3m",
    evidenceNote: "invalid overlap fixture",
  }],
};
assert.throws(() => validateShockCalibrationConfig(invalid), /trainFrom <= trainThrough/);

const registry: ShockCalibrationConfig = {
  version: 1,
  globalDefaultThreshold: 12,
  validatedLocalThresholds: [{
    id: "us-country-v1",
    modelLevel: "country",
    country: "US",
    market: "US",
    threshold: 14,
    trainFrom: "2018-01-01",
    trainThrough: "2023-12-31",
    validationFrom: "2024-01-01",
    validationThrough: "2025-12-31",
    trainCases: 22,
    validationCases: 8,
    benchmarkMetric: "benchmarkRelative3m",
    evidenceNote: "fixture validated threshold",
  }],
};
validateShockCalibrationConfig(registry);
assert.equal(findValidatedLocalThreshold(registry, {
  modelLevel: "country",
  country: "US",
  market: "US",
})?.threshold, 14);
assert.equal(findValidatedLocalThreshold(registry, {
  modelLevel: "country",
  country: "JP",
  market: "JP",
}), null, "別国thresholdを誤適用しない");
assert.equal(findValidatedLocalThreshold(registry, {
  modelLevel: "country_category",
  country: "US",
  market: "US",
  category: "executive_relationship",
}), null, "country thresholdをcountry-categoryへ誤適用しない");

function observations(count: number): ShockCalibrationObservation[] {
  const group: ShockJurisdictionGroup = inferShockJurisdictionGroup({ country: "US", market: "US" });
  return Array.from({ length: count }, (_, index) => ({
    caseId: `us-${index}`,
    company: `US ${index}`,
    checkpoint: `${2018 + Math.floor(index / 6)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
    market: "US",
    country: "US",
    jurisdictionGroup: group,
    category: index < 15 ? "executive_relationship" : "personal_behavior",
    score: 12 + (index % 4),
    benchmarkRelative1m: 1,
    benchmarkRelative3m: 2,
    benchmarkRelative1y: 4,
  }));
}

const resolved = resolveShockCalibration(registry, {
  country: "US",
  market: "US",
  category: "executive_relationship",
  observations: observations(30),
});
assert.equal(resolved.readiness.modelLevel, "country", "カテゴリが薄ければ検証済みcountry registryを使う");
assert.equal(resolved.readiness.status, "validated");
assert.equal(resolved.readiness.effectiveThreshold, 14);
assert.equal(resolved.registryEntry?.id, "us-country-v1");

const sparse = resolveShockCalibration(registry, {
  country: "US",
  market: "US",
  category: "executive_relationship",
  observations: observations(10),
});
assert.equal(sparse.readiness.modelLevel, "global");
assert.equal(sparse.readiness.effectiveThreshold, 12);
assert.equal(sparse.registryEntry, null, "古いlocal registryがあっても現在データが不足なら使わない");

console.log("idiosyncratic-shock calibration config tests: OK");
