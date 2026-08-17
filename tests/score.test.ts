import assert from "node:assert/strict";
import { scoreHealthyPullback } from "../src/score/pullback.js";
import { scoreEarningsDrop } from "../src/score/earnings.js";
import { isRunCursorState } from "../apps/web/lib/generated-data.js";

function testPullbackMissingFinancials() {
  const result = scoreHealthyPullback({
    drawdownPct: -20,
    revenueYoY: null,
    operatingProfitYoY: null,
    hasDownwardRevision: null,
    hasStrategicTheme: true,
  });

  assert.equal(result.score, 11);
  assert.ok(result.negativeReasons.includes("売上前年比データなし"));
  assert.ok(result.negativeReasons.includes("営業利益前年比データなし"));
  assert.ok(result.negativeReasons.includes("下方修正有無のデータなし"));
}

function testEarningsDropMissingFinancials() {
  const result = scoreEarningsDrop({
    nextDayChangePct: null,
    hasDownwardRevision: null,
    revenueYoY: null,
    operatingProfitYoY: null,
    hasStrategicTheme: true,
  });

  assert.equal(result.score, 6);
  assert.ok(result.negativeReasons.includes("決算翌日の株価変化データなし"));
  assert.ok(result.negativeReasons.includes("売上前年比データなし"));
  assert.ok(result.negativeReasons.includes("営業利益前年比データなし"));
}

function testGeneratedRunCursorShape() {
  assert.equal(isRunCursorState({ jobName: "jquants", offset: 3, total: 10 }), true);
  assert.equal(isRunCursorState(null), false);
  assert.equal(isRunCursorState({ offset: "3", total: 10 }), false);
  assert.equal(isRunCursorState({ offset: Number.NaN, total: 10 }), false);
}

function main() {
  testPullbackMissingFinancials();
  testEarningsDropMissingFinancials();
  testGeneratedRunCursorShape();
  console.log("score.test.ts passed");
}

main();