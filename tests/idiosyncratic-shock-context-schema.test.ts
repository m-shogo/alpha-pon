import assert from "node:assert/strict";
import {
  assertHistoricalShockContextDocument,
  validateHistoricalShockContextDocument,
} from "../src/idiosyncratic-shock-context-schema.js";

const validContext = {
  version: 1,
  generatedAt: "2026-07-31",
  description: "fixture",
  cases: {
    fixture: {
      incidentCountry: "JP",
      sector: "restaurant_food_service",
      stakeholder: "employee",
      incidentScope: "site",
      confounderStatus: "clear",
      informationLeakStatus: "possible",
      recurrenceStatus: "first_known",
      remediationStatus: "credible",
      listingStructure: "single",
      ownershipControl: "dispersed",
      liquidityStatus: "normal",
      incidentClusterStatus: "single",
      disclosureObservability: "high",
      announcementTiming: "during_session",
      priceReactionStartDate: "2026-07-30",
      incidentRevenueExposurePct: 5,
      estimatedDirectCostPctMarketCap: 0.2,
      industryRelativeShockDrawdownPct: -4.5,
      strategyEligibilityAtCheckpoint: "confirmed_pass",
      calibrationEligibilityAtCheckpoint: "confirmed_pass",
      strategyInvestigationStatusAtCheckpoint: "closed",
      strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
      reactionAnchorEvidenceSources: [{
        title: "Official",
        url: "https://example.com/release",
        sourceType: "company",
        publishedAt: "2026-07-30",
      }],
      reactionAnchorNotes: "12:00 JST during session",
    },
  },
};

assert.doesNotThrow(() => assertHistoricalShockContextDocument(validContext, "fixture.yml", "context"));

const badEnum = structuredClone(validContext);
badEnum.cases.fixture.confounderStatus = "cleer" as never;
assert(validateHistoricalShockContextDocument(badEnum, "bad-enum.yml", "context")
  .some(issue => issue.path.endsWith("confounderStatus")));

const badDate = structuredClone(validContext);
badDate.cases.fixture.priceReactionStartDate = "2026-02-30";
assert(validateHistoricalShockContextDocument(badDate, "bad-date.yml", "context")
  .some(issue => issue.path.endsWith("priceReactionStartDate")));

const badSource = structuredClone(validContext);
badSource.cases.fixture.reactionAnchorEvidenceSources[0]!.sourceType = "blog" as never;
badSource.cases.fixture.reactionAnchorEvidenceSources[0]!.url = "javascript:alert(1)";
const badSourceIssues = validateHistoricalShockContextDocument(badSource, "bad-source.yml", "context");
assert(badSourceIssues.some(issue => issue.path.endsWith("sourceType")));
assert(badSourceIssues.some(issue => issue.path.endsWith("url")));

const unknownField = structuredClone(validContext) as typeof validContext & { cases: { fixture: Record<string, unknown> } };
unknownField.cases.fixture.typoField = true;
assert(validateHistoricalShockContextDocument(unknownField, "unknown.yml", "context")
  .some(issue => issue.path.endsWith("typoField")));

const badPercent = structuredClone(validContext);
badPercent.cases.fixture.incidentRevenueExposurePct = 120;
assert(validateHistoricalShockContextDocument(badPercent, "bad-percent.yml", "context")
  .some(issue => issue.path.endsWith("incidentRevenueExposurePct")));

const anchorWithContextOnlyField = {
  version: 1,
  generatedAt: "2026-07-31",
  cases: {
    fixture: {
      announcementTiming: "after_close",
      priceReactionStartDate: "2026-08-03",
      reactionAnchorEvidenceSources: [{ title: "Release", url: "https://example.com", sourceType: "company" }],
      reactionAnchorNotes: "Friday after close; next Monday reaction",
      confounderStatus: "clear",
    },
  },
};
assert(validateHistoricalShockContextDocument(anchorWithContextOnlyField, "anchor.yml", "reaction_anchor")
  .some(issue => issue.path.endsWith("confounderStatus")));

console.log("idiosyncratic-shock context-schema tests: OK");
