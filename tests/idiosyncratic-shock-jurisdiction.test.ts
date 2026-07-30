import assert from "node:assert/strict";
import {
  buildShockJurisdictionReview,
  inferShockJurisdictionGroup,
  jurisdictionAnalogyPenalty,
  shockCategoryJurisdictionSensitivity,
  temporalAnalogyPenalty,
} from "../src/idiosyncratic-shock-jurisdiction.js";
import {
  buildShockContextReview,
  inferIncidentGeography,
  inferSectorRiskClass,
} from "../src/idiosyncratic-shock-context.js";

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

assert.equal(temporalAnalogyPenalty({
  category: "executive_relationship",
  candidateDate: "2026-07-30",
  historicalDate: "2016-01-01",
}), 3, "文化依存事件の10年前事例は強く減衰");
assert.equal(temporalAnalogyPenalty({
  category: "executive_relationship",
  candidateDate: "2026-07-30",
  historicalDate: "2025-01-01",
}), 0, "最近の同型は減衰なし");
assert.equal(temporalAnalogyPenalty({
  category: "accounting_fraud",
  candidateDate: "2026-07-30",
  historicalDate: "2016-01-01",
}), 0, "粉飾の構造比較は10年でも保持");

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

assert.equal(inferIncidentGeography("JP", "US", "JP"), "foreign");
assert.equal(inferIncidentGeography("US", "US", "US"), "domestic");
assert.equal(inferSectorRiskClass("banking and securities"), "trust_critical");
assert.equal(inferSectorRiskClass("restaurant / food service"), "safety_critical");
assert.equal(inferSectorRiskClass("casino gaming"), "license_critical");

const crossBorderClear = buildShockContextReview({
  issuerCountry: "JP",
  incidentCountry: "US",
  market: "JP",
  sector: "consumer_ip",
  stakeholder: "investor",
  incidentScope: "subsidiary",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.equal(crossBorderClear.incidentGeography, "foreign");
assert.equal(crossBorderClear.blockers.length, 0);
assert.ok(crossBorderClear.reviewNotes.some(note => note.includes("本社国外")));

const unknownAttribution = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "unknown",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.equal(unknownAttribution.blockers.length, 1, "同時材料未確認なら通知を止める");

const majorConfounder = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "major",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.equal(majorConfounder.blockers.length, 1, "決算等の重大同時材料があれば不祥事下げへ帰属しない");

const leakedEvent = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "likely",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.ok(leakedEvent.blockers.some(value => value.includes("re-anchor")), "情報漏れ濃厚ならevent dateを再設定するまでBLOCK");

const systemicRepeat = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "systemic",
  remediationStatus: "credible",
});
assert.ok(systemicRepeat.blockers.some(value => value.includes("systemic")), "再発が組織的ならisolated dip仮説を止める");

const weakRemediation = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "weak",
});
assert.ok(weakRemediation.blockers.some(value => value.includes("remediation")), "是正が弱いなら通知BLOCK");

const sectorMove = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  industryRelativeShockDrawdownPct: -0.5,
});
assert.ok(sectorMove.blockers.some(value => value.includes("peer-adjusted")), "同業比で固有下落が弱いなら通知BLOCK");

const materialForeignExposure = buildShockContextReview({
  issuerCountry: "JP",
  incidentCountry: "US",
  market: "JP",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  incidentRevenueExposurePct: 30,
  estimatedDirectCostPctMarketCap: 6,
});
assert.ok(materialForeignExposure.reviewNotes.some(value => value.includes("売上露出が大きい")));
assert.ok(materialForeignExposure.reviewNotes.some(value => value.includes("material")));

console.log("idiosyncratic-shock jurisdiction/context tests: OK");
