import assert from "node:assert/strict";
import { buildShockContextReview, contextAnalogyPenalty } from "../src/idiosyncratic-shock-context.js";

const afterCloseMissingAnchor = buildShockContextReview({
  issuerCountry: "JP",
  incidentCountry: "JP",
  market: "JP",
  announcementTiming: "after_close",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.ok(
  afterCloseMissingAnchor.blockers.some(value => value.includes("priceReactionStartDate is required")),
  "引け後発表は次の取引日anchorを明示するまでBLOCK",
);

const afterCloseAnchored = buildShockContextReview({
  issuerCountry: "JP",
  incidentCountry: "JP",
  market: "JP",
  announcementTiming: "after_close",
  priceReactionStartDate: "2026-08-03",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.equal(
  afterCloseAnchored.blockers.some(value => value.includes("priceReactionStartDate")),
  false,
  "有効な次セッションanchorがあればtiming理由ではBLOCKしない",
);
assert.equal(afterCloseAnchored.priceReactionStartDate, "2026-08-03");

const invalidAnchor = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  announcementTiming: "after_close",
  priceReactionStartDate: "08/03/2026",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.ok(invalidAnchor.blockers.some(value => value.includes("expected YYYY-MM-DD")), "reaction anchor形式を固定");

const unknownTiming = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
});
assert.ok(unknownTiming.reviewNotes.some(value => value.includes("寄り前/場中/引け後/休場日")), "timing不明はreviewへ残す");

const halted = buildShockContextReview({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  liquidityStatus: "halted",
  incidentClusterStatus: "single",
  listingStructure: "single",
  ownershipControl: "dispersed",
  disclosureObservability: "high",
});
assert.ok(halted.blockers.some(value => value.includes("price discovery incomplete")), "売買停止中は下落一巡と判定しない");

const cascade = buildShockContextReview({
  issuerCountry: "JP",
  incidentCountry: "JP",
  market: "JP",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  liquidityStatus: "normal",
  incidentClusterStatus: "cascade",
  listingStructure: "single",
  ownershipControl: "dispersed",
  disclosureObservability: "high",
});
assert.ok(cascade.blockers.some(value => value.includes("connected incidents")), "不祥事連鎖中は単発ディップ扱いしない");

const adr = buildShockContextReview({
  issuerCountry: "GB",
  incidentCountry: "GB",
  market: "US",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  liquidityStatus: "normal",
  incidentClusterStatus: "single",
  listingStructure: "adr",
  ownershipControl: "dispersed",
  disclosureObservability: "high",
});
assert.ok(adr.reviewNotes.some(value => value.includes("primary listing")), "ADRは本国primary listingと照合する");

const founder = buildShockContextReview({
  issuerCountry: "KR",
  incidentCountry: "KR",
  market: "KR",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  liquidityStatus: "normal",
  incidentClusterStatus: "single",
  listingStructure: "single",
  ownershipControl: "founder_family",
  disclosureObservability: "medium",
});
assert.ok(founder.reviewNotes.some(value => value.includes("創業家")), "創業家支配はactor separabilityを別途確認する");

const lowObservability = buildShockContextReview({
  issuerCountry: "CN",
  incidentCountry: "CN",
  market: "CN",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  liquidityStatus: "normal",
  incidentClusterStatus: "single",
  listingStructure: "single",
  ownershipControl: "state_controlled",
  disclosureObservability: "low",
});
assert.ok(lowObservability.reviewNotes.some(value => value.includes("ニュース件数の少なさ")), "情報の少なさを事件の軽さと誤認しない");
assert.ok(lowObservability.reviewNotes.some(value => value.includes("国有")), "国有企業は政策/任命リスクを確認する");

const mismatchPenalty = contextAnalogyPenalty({
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  sector: "consumer",
  stakeholder: "employee",
  incidentScope: "individual",
  recurrenceStatus: "first_known",
  listingStructure: "single",
  ownershipControl: "dispersed",
  incidentClusterStatus: "single",
}, {
  issuerCountry: "US",
  incidentCountry: "US",
  market: "US",
  sector: "consumer",
  stakeholder: "employee",
  incidentScope: "individual",
  recurrenceStatus: "first_known",
  listingStructure: "adr",
  ownershipControl: "founder_family",
  incidentClusterStatus: "related_multiple",
});
assert.equal(mismatchPenalty, 4, "listing + ownership + cluster構造の違いを類似距離へ反映");

console.log("idiosyncratic-shock advanced context tests: OK");
