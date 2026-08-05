import "./idiosyncratic-shock-context-schema.test.js";
import assert from "node:assert/strict";
import { loadHistoricalShockCaseContext, isHistoricalReactionAnchorVerified } from "../src/idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";
import {
  historicalReactionAnchorReplayBlockers,
  isHistoricalReactionAnchorReplayReady,
} from "../src/idiosyncratic-shock-reaction-anchor.js";

const contexts = loadHistoricalShockCaseContext();
const cases = loadHistoricalShockCases();
const caseById = new Map(cases.map(item => [item.id, item]));

const expectedReplayReadyAnchors: Record<string, string> = {
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
  "yoshinoya-2022-remark": "2022-04-18",
  "zensho-sukiya-2019-employee-video": "2019-01-29",
  "ootoya-2019-employee-video": "2019-02-18",
  "united-2017-flight3411": "2017-04-10",
};

for (const [id, expectedReactionStart] of Object.entries(expectedReplayReadyAnchors)) {
  const context = contexts.get(id);
  const historical = caseById.get(id);
  assert(context, `${id}: context/anchor overlay must exist`);
  assert(historical, `${id}: historical case must exist`);
  assert.equal(isHistoricalReactionAnchorVerified(context), true, `${id}: timing/date anchor must be structurally verified`);
  assert.equal(isHistoricalReactionAnchorReplayReady(context), true, `${id}: anchor must be replay-ready`);
  assert.deepEqual(historicalReactionAnchorReplayBlockers(context), [], `${id}: replay-ready anchor must have no blockers`);
  assert.equal(context.priceReactionStartDate, expectedReactionStart, `${id}: reaction start must stay pinned`);
  assert.match(context.priceReactionStartDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert((context.priceReactionStartDate ?? "") >= historical.eventDate, `${id}: reaction start cannot precede eventDate`);
  assert((context.reactionAnchorEvidenceSources?.length ?? 0) >= 1, `${id}: replay-ready anchor requires evidence source`);
  assert(context.reactionAnchorNotes?.trim(), `${id}: replay-ready anchor requires provenance note`);
}

assert.equal(contexts.get("lockheed-2012-kubasik")?.announcementTiming, "before_open", "reaction-anchor expansion must overlay base context");
assert.equal(contexts.get("lockheed-2012-kubasik")?.strategyEligibilityAtCheckpoint, "confirmed_pass", "anchor overlay must preserve eligibility fields");
assert.equal(contexts.get("yoshinoya-2022-remark")?.announcementTiming, "during_session");
assert.equal(contexts.get("zensho-sukiya-2019-employee-video")?.announcementTiming, "during_session");
assert.equal(contexts.get("ootoya-2019-employee-video")?.announcementTiming, "non_trading_day");
assert.equal(contexts.get("united-2017-flight3411")?.announcementTiming, "non_trading_day");

assert.equal(isHistoricalReactionAnchorReplayReady({
  announcementTiming: "before_open",
  priceReactionStartDate: "2026-01-05",
}), false, "timing/dateだけではreplay-readyにしない");
assert(historicalReactionAnchorReplayBlockers({
  announcementTiming: "before_open",
  priceReactionStartDate: "2026-01-05",
}).includes("reactionAnchorEvidenceSources missing or invalid"));

for (const [id, context] of contexts) {
  if (!isHistoricalReactionAnchorReplayReady(context)) continue;
  const historical = caseById.get(id);
  assert(historical, `${id}: replay-ready anchor must not be orphaned`);
}

assert.equal(Object.keys(expectedReplayReadyAnchors).length, 18, "replay-ready anchor seed count changed; update expected registry deliberately");
console.log(`idiosyncratic-shock reaction-anchor tests: replayReady=${Object.keys(expectedReplayReadyAnchors).length} OK`);
