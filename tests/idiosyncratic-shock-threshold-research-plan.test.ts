import assert from "node:assert/strict";
import type { ThresholdDiversityRow } from "../src/idiosyncratic-shock-threshold-diversity-audit.js";
import { buildThresholdResearchPlan } from "../src/idiosyncratic-shock-threshold-research-plan.js";

function row(input: Partial<ThresholdDiversityRow> & Pick<ThresholdDiversityRow, "id" | "score" | "category" | "market" | "calibrationEligibility">): ThresholdDiversityRow {
  return {
    id: input.id,
    company: input.company ?? input.id,
    ticker: input.ticker ?? (input.market === "US" ? "TEST" : "9999"),
    country: input.country ?? (input.market === "US" ? "US" : "JP"),
    market: input.market,
    score: input.score,
    category: input.category,
    actorType: input.actorType ?? "employee",
    calibrationEligibility: input.calibrationEligibility,
    replayReady: input.replayReady ?? false,
    supportedMarket: input.supportedMarket ?? true,
    usable3m: input.usable3m ?? false,
  };
}

const rows: ThresholdDiversityRow[] = [
  row({ id: "only-pass", score: 11, category: "employee_sabotage", market: "JP", calibrationEligibility: "confirmed_pass", replayReady: true }),
  row({ id: "deep-us-new-category", score: 8, category: "personal_behavior", market: "US", calibrationEligibility: "unknown", replayReady: true }),
  row({ id: "deep-jp-same-category", score: 9, category: "employee_sabotage", market: "JP", calibrationEligibility: "unknown" }),
  row({ id: "near-us-new-category", score: 10, category: "executive_relationship", market: "US", calibrationEligibility: "unknown", replayReady: true }),
  row({ id: "blocked-deep", score: 8, category: "product_safety", market: "US", calibrationEligibility: "confirmed_block", replayReady: true }),
  row({ id: "below-band", score: 7, category: "other", market: "US", calibrationEligibility: "unknown", replayReady: true }),
];

const plan = buildThresholdResearchPlan(rows);
assert.equal(plan.deficits.deeper8to9, 2);
assert.equal(plan.deficits.nearBoundary10to11, 3);
assert.equal(plan.deficits.usControls, 2);
assert.equal(plan.queue[0]?.id, "deep-us-new-category", "deep band + missing US + new category + ready anchor should be first");
assert(plan.queue[0]?.gapReasons.some(value => value.includes("score8-9 deficit")));
assert(plan.queue[0]?.gapReasons.some(value => value.includes("US deficit")));
assert(plan.queue[0]?.gapReasons.some(value => value.includes("new category")));
assert(!plan.queue.some(value => value.id === "blocked-deep"), "confirmed BLOCK is resolved research, not UNKNOWN queue");
assert(!plan.queue.some(value => value.id === "below-band"), "threshold review queue is score 8-11 only");

const noFutureOutcomeField = plan.queue[0] as Record<string, unknown>;
assert.equal("return3m" in noFutureOutcomeField, false, "research priority must not depend on future return fields");

console.log("idiosyncratic-shock threshold research plan tests: structural-gap priority only");
