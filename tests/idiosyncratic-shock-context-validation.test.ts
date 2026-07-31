import assert from "node:assert/strict";
import {
  validateHistoricalShockCaseContextShape,
  validateHistoricalShockReactionAnchorShape,
} from "../src/idiosyncratic-shock-case-context-validation.js";

const valid = validateHistoricalShockCaseContextShape({
  incidentCountry: "JP",
  sector: "restaurant_food_service",
  stakeholder: "employee",
  incidentScope: "individual",
  confounderStatus: "clear",
  informationLeakStatus: "clear",
  recurrenceStatus: "first_known",
  remediationStatus: "credible",
  listingStructure: "standalone",
  ownershipControl: "dispersed",
  liquidityStatus: "normal",
  incidentClusterStatus: "single",
  disclosureObservability: "high",
  announcementTiming: "during_session",
  priceReactionStartDate: "2026-01-05",
  strategyEligibilityAtCheckpoint: "confirmed_block",
  calibrationEligibilityAtCheckpoint: "confirmed_pass",
  calibrationEligibilityNotes: "shadow review complete",
  strategyInvestigationStatusAtCheckpoint: "substantially_complete",
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
  reactionAnchorEvidenceSources: [{
    title: "issuer release",
    url: "https://example.com/release",
    sourceType: "company",
    publishedAt: "2026-01-05",
  }],
}, "fixture");
assert.equal(valid.incidentScope, "individual");
assert.equal(valid.calibrationEligibilityAtCheckpoint, "confirmed_pass");

assert.throws(
  () => validateHistoricalShockCaseContextShape({ incidentScope: "executive" }, "bad-scope"),
  /bad-scope\.incidentScope: invalid enum value=executive/,
  "invalid incidentScope must fail at load time",
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({ stakeholder: "shareholder" }, "bad-stakeholder"),
  /bad-stakeholder\.stakeholder: invalid enum/,
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({ strategyInvestigationStatusAtCheckpoint: "done" }, "bad-investigation"),
  /bad-investigation\.strategyInvestigationStatusAtCheckpoint: invalid enum/,
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({ calibrationEligibilityAtCheckpoint: "confirmed_pass" }, "missing-note"),
  /calibrationEligibilityNotes: required/,
  "explicit shadow decision requires reproducible note",
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({
    strategyEligibilityEvidenceSources: [{ title: "x", url: "javascript:alert(1)", sourceType: "company" }],
  }, "bad-source"),
  /invalid http\(s\) URL/,
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({ priceReactionStartDate: "20260105" }, "bad-date"),
  /priceReactionStartDate: expected YYYY-MM-DD/,
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({ incidentRevenueExposurePct: "10" }, "bad-number"),
  /expected finite number/,
);
assert.throws(
  () => validateHistoricalShockCaseContextShape({ strategyCriticalLicenseOrDelistingRiskAtCheckpoint: "false" }, "bad-boolean"),
  /expected boolean/,
);

assert.throws(
  () => validateHistoricalShockReactionAnchorShape({ announcementTiming: "weekend" }, "bad-anchor-timing"),
  /announcementTiming: invalid enum/,
);
assert.throws(
  () => validateHistoricalShockReactionAnchorShape({
    announcementTiming: "before_open",
    priceReactionStartDate: "2026-01-05",
    reactionAnchorEvidenceSources: [{ title: "x", url: "not-a-url", sourceType: "other" }],
  }, "bad-anchor-source"),
  /invalid http\(s\) URL/,
);

console.log("idiosyncratic-shock context runtime validation tests: OK");
