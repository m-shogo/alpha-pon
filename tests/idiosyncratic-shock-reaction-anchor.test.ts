import assert from "node:assert/strict";
import { loadHistoricalShockCaseContext, isHistoricalReactionAnchorVerified } from "../src/idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";

const contexts = loadHistoricalShockCaseContext();
const cases = loadHistoricalShockCases();
const caseById = new Map(cases.map(item => [item.id, item]));

const expectedVerifiedAnchors: Record<string, string> = {
  "sanrio-2026-compensation": "2026-06-01",
  "mcdonalds-2019-easterbrook": "2019-11-04",
  "hp-2010-hurd": "2010-08-09",
  "sushiro-2023-customer": "2023-01-30",
  "skylark-2019-bamiyan": "2019-02-12",
  "seven-eleven-2019-employee-video": "2019-02-12",
  "intel-2018-krzanich": "2018-06-21",
  "priceline-2016-huston": "2016-04-28",
  "ti-2018-crutcher": "2018-07-18",
  "keurig-dr-pepper-2022-ceo-conduct": "2022-11-10",
  "boeing-2005-stonecipher": "2005-03-07",
  "ebay-2020-cyberstalking": "2020-06-15",
  "dominos-japan-2024-employee-video": "2024-02-13",
  "lockheed-2012-kubasik": "2012-11-09",
};

for (const [id, expectedReactionStart] of Object.entries(expectedVerifiedAnchors)) {
  const context = contexts.get(id);
  const historical = caseById.get(id);
  assert(context, `${id}: context/anchor overlay must exist`);
  assert(historical, `${id}: historical case must exist`);
  assert.equal(isHistoricalReactionAnchorVerified(context), true, `${id}: anchor must satisfy shared verifier`);
  assert.equal(context.priceReactionStartDate, expectedReactionStart, `${id}: reaction start must stay pinned`);
  assert.match(context.priceReactionStartDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert((context.priceReactionStartDate ?? "") >= historical.eventDate, `${id}: reaction start cannot precede eventDate`);
}

assert.equal(contexts.get("lockheed-2012-kubasik")?.announcementTiming, "before_open", "reaction-anchor expansion must overlay base context");
assert.equal(contexts.get("lockheed-2012-kubasik")?.strategyEligibilityAtCheckpoint, "confirmed_pass", "anchor overlay must preserve eligibility fields");
assert((contexts.get("lockheed-2012-kubasik")?.reactionAnchorEvidenceSources?.length ?? 0) >= 1);

for (const [id, context] of contexts) {
  if (!isHistoricalReactionAnchorVerified(context)) continue;
  const historical = caseById.get(id);
  assert(historical, `${id}: verified anchor must not be orphaned`);
  assert(context.announcementTiming && context.announcementTiming !== "unknown");
  assert(context.priceReactionStartDate);
}

assert.equal(Object.keys(expectedVerifiedAnchors).length, 14, "verified anchor seed count changed; update expected registry deliberately");
console.log(`idiosyncratic-shock reaction-anchor tests: verified=${Object.keys(expectedVerifiedAnchors).length} OK`);
