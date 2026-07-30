import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import {
  DEFAULT_MIN_RELATIVE_SHOCK_DRAWDOWN_PCT,
  DEFAULT_MIN_SHOCK_DRAWDOWN_PCT,
  DEFAULT_SHOCK_WINDOW_DAYS,
  labelShockScore,
} from "../src/idiosyncratic-shock.js";

type Rules = {
  notificationThreshold: number;
  researchPriorityThreshold: number;
  hardGates: {
    requireConfirmedEvidence: boolean;
    requireInvestigationScopeResolved: boolean;
    requireActualShockDrawdown: boolean;
    minimumShockDrawdownPct: number;
    shockWindowDays: number;
    requireMarketRelativeShock: boolean;
    minimumRelativeShockDrawdownPct: number;
    benchmarkCode: string;
    requirePriceStabilized: boolean;
    rejectAccountingFraud: boolean;
    rejectMacroPrimaryCause: boolean;
    rejectCriticalLicenseOrDelistingRisk: boolean;
  };
  categories: Array<{ id: string }>;
  investigationStatuses: string[];
};

const rules = load(readFileSync("config/idiosyncratic-shock-rules.yml", "utf-8")) as Rules;

assert.equal(rules.notificationThreshold, 12, "通知閾値は12点から開始");
assert.equal(labelShockScore(rules.notificationThreshold), "watch", "12点はwatch帯の開始点");
assert.equal(rules.researchPriorityThreshold, 16, "research_priorityは16点から");
assert.equal(labelShockScore(rules.researchPriorityThreshold), "research_priority");

assert.equal(rules.hardGates.minimumShockDrawdownPct, DEFAULT_MIN_SHOCK_DRAWDOWN_PCT, "絶対ショック閾値をコードと設定で同期");
assert.equal(rules.hardGates.minimumRelativeShockDrawdownPct, DEFAULT_MIN_RELATIVE_SHOCK_DRAWDOWN_PCT, "TOPIX相対ショック閾値をコードと設定で同期");
assert.equal(rules.hardGates.shockWindowDays, DEFAULT_SHOCK_WINDOW_DAYS, "event shock窓をコードと設定で同期");
assert.equal(rules.hardGates.benchmarkCode, "1306", "日本株の市場ベンチマークはTOPIX ETF 1306");

assert.equal(rules.hardGates.requireConfirmedEvidence, true);
assert.equal(rules.hardGates.requireInvestigationScopeResolved, true);
assert.equal(rules.hardGates.requireActualShockDrawdown, true);
assert.equal(rules.hardGates.requireMarketRelativeShock, true);
assert.equal(rules.hardGates.requirePriceStabilized, true);
assert.equal(rules.hardGates.rejectAccountingFraud, true);
assert.equal(rules.hardGates.rejectMacroPrimaryCause, true);
assert.equal(rules.hardGates.rejectCriticalLicenseOrDelistingRisk, true);

const categoryIds = new Set(rules.categories.map(row => row.id));
for (const required of [
  "executive_relationship",
  "personal_behavior",
  "personal_crime",
  "employee_sabotage",
  "customer_sabotage",
  "accounting_fraud",
  "organizational_governance",
  "systemic_misconduct",
  "quality_falsification",
  "product_safety",
  "improper_sales",
]) {
  assert(categoryIds.has(required), `required category missing: ${required}`);
}

for (const status of ["open", "substantially_complete", "closed", "not_applicable", "unknown"]) {
  assert(rules.investigationStatuses.includes(status), `investigation status missing: ${status}`);
}

console.log("idiosyncratic-shock-config tests: OK");
