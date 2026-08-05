import assert from "node:assert/strict";
import { buildShockBackfillPlan } from "../src/idiosyncratic-shock-backfill-plan.js";

const plan = buildShockBackfillPlan("2026-07-31");

assert(plan.totalHistoricalCases >= 59, "historical dataset must not shrink below current audit floor");
assert(plan.tickerCases > 0);
assert(plan.supportedMarketCases > 0);
assert(plan.replayReadyAnchors >= 17, "committed replay-ready anchor seed must not regress");
assert(plan.signalReplayEligible > 0, "at least one case must be ready for production signal replay");
assert(plan.thresholdCalibrationReplayEligible > 0, "at least one case must be ready for threshold calibration replay");

const productionReady = plan.rows.filter(row => row.signalReplayEligible);
assert.equal(productionReady.length, plan.signalReplayEligible);
for (const row of productionReady) {
  assert.equal(row.strategyEligibility, "confirmed_pass", `${row.id}: production replay requires confirmed_pass`);
  assert.equal(row.reactionAnchorReplayReady, true, `${row.id}: production replay requires replay-ready anchor`);
  assert(row.provider === "jquants" || row.provider === "twelve_data");
  assert(row.ticker && row.fetchFrom && row.fetchTo);
  assert.equal(row.blockers.length, 0, `${row.id}: production-ready row must not carry blockers`);
}

const calibrationReady = plan.rows.filter(row => row.thresholdCalibrationReplayEligible);
assert.equal(calibrationReady.length, plan.thresholdCalibrationReplayEligible);
for (const row of calibrationReady) {
  assert.equal(row.thresholdCalibrationEligibility, "confirmed_pass", `${row.id}: shadow replay requires calibration pass`);
  assert.equal(row.reactionAnchorReplayReady, true, `${row.id}: shadow replay requires replay-ready anchor`);
  assert(row.provider === "jquants" || row.provider === "twelve_data");
  assert(row.ticker && row.fetchFrom && row.fetchTo);
  assert.equal(row.calibrationBlockers.length, 0, `${row.id}: calibration-ready row must not carry blockers`);
}

const sanrio = plan.rows.find(row => row.id === "sanrio-2026-compensation");
assert(sanrio, "Sanrio historical case must remain in backfill plan");
assert.equal(sanrio?.market, "JP");
assert.equal(sanrio?.provider, "jquants");
assert.equal(sanrio?.strategyEligibility, "confirmed_pass");
assert.equal(sanrio?.thresholdCalibrationEligibility, "confirmed_pass");
assert.equal(sanrio?.reactionAnchorReplayReady, true);
assert.equal(sanrio?.reactionStartDate, "2026-06-01");
assert.equal(sanrio?.signalReplayEligible, true);
assert.equal(sanrio?.thresholdCalibrationReplayEligible, true);

const ootoya = plan.rows.find(row => row.id === "ootoya-2019-employee-video");
assert(ootoya, "Ootoya low-score control must remain in backfill plan");
assert.equal(ootoya?.score, 11);
assert.equal(ootoya?.market, "JP");
assert.equal(ootoya?.provider, "jquants");
assert.equal(ootoya?.strategyEligibility, "confirmed_block", "score=11 remains blocked in production");
assert.equal(ootoya?.thresholdCalibrationEligibility, "confirmed_pass", "score thresholdだけを外したshadow研究では明示PASS");
assert.equal(ootoya?.reactionAnchorReplayReady, true);
assert.equal(ootoya?.reactionStartDate, "2019-02-18");
assert.equal(ootoya?.signalReplayEligible, false, "Ootoya must never leak into production replay");
assert.equal(ootoya?.thresholdCalibrationReplayEligible, true, "Ootoya is the first below-threshold shadow control");
assert.equal(ootoya?.calibrationBlockers.length, 0);

const belowThresholdReady = calibrationReady.filter(row => row.score < 12);
assert(belowThresholdReady.length >= 1, "threshold=12を下方向へ検証するcontrolが最低1件必要");

for (const row of plan.rows.filter(row => row.strategyEligibility === "confirmed_block")) {
  assert.equal(row.signalReplayEligible, false, `${row.id}: production block must never enter production replay`);
}
for (const row of plan.rows.filter(row => row.thresholdCalibrationEligibility === "unknown")) {
  assert.equal(row.thresholdCalibrationReplayEligible, false, `${row.id}: unknown shadow eligibility must never enter calibration replay`);
}

console.log(`idiosyncratic-shock backfill-plan tests: production=${plan.signalReplayEligible} calibration=${plan.thresholdCalibrationReplayEligible} replayReady=${plan.replayReadyAnchors} OK`);
