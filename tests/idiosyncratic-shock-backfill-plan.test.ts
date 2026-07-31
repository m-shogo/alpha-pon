import assert from "node:assert/strict";
import { buildShockBackfillPlan } from "../src/idiosyncratic-shock-backfill-plan.js";

const plan = buildShockBackfillPlan("2026-07-31");

assert(plan.totalHistoricalCases >= 59, "historical dataset must not shrink below current audit floor");
assert(plan.tickerCases > 0);
assert(plan.supportedMarketCases > 0);
assert(plan.replayReadyAnchors >= 16, "committed replay-ready anchor seed must not regress");
assert(plan.signalReplayEligible > 0, "at least one case must be ready for signal replay");

const readyRows = plan.rows.filter(row => row.signalReplayEligible);
assert.equal(readyRows.length, plan.signalReplayEligible);
for (const row of readyRows) {
  assert.equal(row.strategyEligibility, "confirmed_pass", `${row.id}: signal replay requires confirmed_pass`);
  assert.equal(row.reactionAnchorReplayReady, true, `${row.id}: signal replay requires replay-ready anchor`);
  assert(row.provider === "jquants" || row.provider === "twelve_data", `${row.id}: signal replay requires supported provider`);
  assert(row.benchmark === "TOPIX" || row.benchmark === "S&P 500", `${row.id}: signal replay requires market benchmark`);
  assert(row.ticker, `${row.id}: signal replay requires ticker`);
  assert(row.fetchFrom && row.fetchTo, `${row.id}: signal replay requires deterministic fetch range`);
  assert.equal(row.blockers.length, 0, `${row.id}: ready row must not carry blockers`);
}

const sanrio = plan.rows.find(row => row.id === "sanrio-2026-compensation");
assert(sanrio, "Sanrio historical case must remain in backfill plan");
assert.equal(sanrio?.market, "JP");
assert.equal(sanrio?.provider, "jquants");
assert.equal(sanrio?.strategyEligibility, "confirmed_pass");
assert.equal(sanrio?.reactionAnchorReplayReady, true);
assert.equal(sanrio?.reactionStartDate, "2026-06-01");
assert.equal(sanrio?.signalReplayEligible, true);

const blockedRows = plan.rows.filter(row => row.strategyEligibility === "confirmed_block");
for (const row of blockedRows) {
  assert.equal(row.signalReplayEligible, false, `${row.id}: confirmed_block must never enter signal replay`);
}

const unknownRows = plan.rows.filter(row => row.strategyEligibility === "unknown");
for (const row of unknownRows) {
  assert.equal(row.signalReplayEligible, false, `${row.id}: unknown eligibility must never enter signal replay`);
}

console.log(`idiosyncratic-shock backfill-plan tests: ready=${plan.signalReplayEligible} replayReady=${plan.replayReadyAnchors} OK`);
