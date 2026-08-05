import assert from "node:assert/strict";
import {
  summarizeThresholdDiversity,
  THRESHOLD_DIVERSITY_TARGETS,
  type ThresholdDiversityRow,
} from "../src/idiosyncratic-shock-threshold-diversity-audit.js";

function row(input: Partial<ThresholdDiversityRow> & Pick<ThresholdDiversityRow, "id" | "score" | "category" | "market">): ThresholdDiversityRow {
  return {
    id: input.id,
    company: input.company ?? input.id,
    ticker: input.ticker ?? "9999",
    country: input.country ?? (input.market === "US" ? "US" : "JP"),
    market: input.market,
    score: input.score,
    category: input.category,
    actorType: input.actorType ?? "employee",
    calibrationEligibility: input.calibrationEligibility ?? "confirmed_pass",
    replayReady: input.replayReady ?? true,
    supportedMarket: input.supportedMarket ?? true,
    usable3m: input.usable3m ?? true,
  };
}

const allNearBoundary = Array.from({ length: 8 }, (_, index) => row({
  id: `near-${index}`,
  score: 11,
  category: "employee_sabotage",
  market: index < 4 ? "JP" : "US",
}));
const concentrated = summarizeThresholdDiversity(allNearBoundary);
assert.equal(concentrated.totalReplayReadyBelow12, 8, "simple count target alone can be met");
assert.equal(concentrated.nearBoundary10to11, 8);
assert.equal(concentrated.deeper8to9, 0);
assert.equal(concentrated.distinctCategories, 1);
assert.equal(concentrated.ready, false, "8件あってもscore帯/category偏重ならthreshold変更readyにしない");
assert(concentrated.blockers.some(value => value.includes("score8-9 controls")));
assert(concentrated.blockers.some(value => value.includes("distinct categories")));

const diverse: ThresholdDiversityRow[] = [
  row({ id: "jp-11-a", score: 11, category: "employee_sabotage", market: "JP" }),
  row({ id: "jp-11-b", score: 11, category: "customer_sabotage", market: "JP", actorType: "customer" }),
  row({ id: "us-10-a", score: 10, category: "personal_behavior", market: "US", actorType: "executive" }),
  row({ id: "us-10-b", score: 10, category: "executive_relationship", market: "US", actorType: "ceo" }),
  row({ id: "jp-9-a", score: 9, category: "product_safety", market: "JP", actorType: "organization" }),
  row({ id: "us-8-a", score: 8, category: "localized_food_safety", market: "US", actorType: "organization" }),
  row({ id: "jp-7-a", score: 7, category: "personal_behavior", market: "JP", actorType: "founder" }),
  row({ id: "us-7-a", score: 7, category: "employee_sabotage", market: "US" }),
];
const ready = summarizeThresholdDiversity(diverse);
assert.equal(ready.totalReplayReadyBelow12, THRESHOLD_DIVERSITY_TARGETS.totalReplayReadyBelow12);
assert.equal(ready.nearBoundary10to11, 4);
assert.equal(ready.deeper8to9, 2);
assert(ready.distinctCategories >= THRESHOLD_DIVERSITY_TARGETS.distinctCategories);
assert(ready.jpControls >= THRESHOLD_DIVERSITY_TARGETS.jpControls);
assert(ready.usControls >= THRESHOLD_DIVERSITY_TARGETS.usControls);
assert.equal(ready.usable3mBelow12, 8);
assert.deepEqual(ready.blockers, []);
assert.equal(ready.ready, true);

const noOutcome = summarizeThresholdDiversity(diverse.map(value => ({ ...value, usable3m: false })));
assert.equal(noOutcome.totalReplayReadyBelow12, 8);
assert.equal(noOutcome.ready, false, "structural diversity alone cannot replace quantitative outcome target");
assert(noOutcome.blockers.some(value => value.includes("usable shadow 3m")));

const oneMarket = summarizeThresholdDiversity(diverse.map(value => ({ ...value, market: "JP" as const, country: "JP" })));
assert.equal(oneMarket.ready, false, "JP-only controls cannot validate a JP/US global threshold change");
assert(oneMarket.blockers.some(value => value.includes("US controls")));

const unknownRows = summarizeThresholdDiversity(diverse.map((value, index) => index === 0 ? { ...value, calibrationEligibility: "unknown" as const } : value));
assert.equal(unknownRows.totalReplayReadyBelow12, 7, "unknown eligibility never counts toward diversity target");
assert.equal(unknownRows.ready, false);

console.log("idiosyncratic-shock threshold diversity tests: OK");
