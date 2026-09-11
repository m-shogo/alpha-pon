// 決算開示から「説明のつく日」を組むテスト。
//
// 守りたい性質:
//   1. 引け前の開示は当日、引け後は翌営業日が反応日
//   2. 東証の引け時刻の変更（2024-11-05 に 15:00 → 15:30）に従う
//   3. 開示当日も既定で外す（外し損ねより外しすぎを選ぶ）
//   4. カレンダー外の開示を黙って捨てない
//   5. 形式が壊れた開示で止まる

import assert from "node:assert/strict";
import { buildEarningsEventDates } from "../../src/research/signals/earnings-event-dates.js";

// 2024-11-01(金) までは引け15:00、2024-11-05(火) 以降は 15:30。
const TRADING_DATES = [
  "2024-10-31", "2024-11-01", "2024-11-05", "2024-11-06", "2024-11-07",
];

function build(
  disclosures: Array<{ code: string; disclosedDate: string; disclosedTime: string }>,
  includeDisclosureDay?: boolean,
) {
  return buildEarningsEventDates({
    disclosures, tradingDates: TRADING_DATES, includeDisclosureDay,
  });
}

function testBeforeCloseReactsSameDay() {
  const r = build([{ code: "13010", disclosedDate: "2024-11-06", disclosedTime: "13:00:00" }]);
  assert.deepEqual([...r.byCode.get("13010")!].sort(), ["2024-11-06"]);
  assert.equal(r.resolved, 1);
}

function testAfterCloseReactsNextTradingDay() {
  const r = build([{ code: "13010", disclosedDate: "2024-11-06", disclosedTime: "16:00:00" }]);
  // 翌営業日に加え、開示当日も既定で外す。
  assert.deepEqual([...r.byCode.get("13010")!].sort(), ["2024-11-06", "2024-11-07"]);
}

function testCloseTimeChangeIsHonored() {
  // 15:15 の開示は、11-01（引け15:00）では引け後、11-05（引け15:30）では引け前。
  const before = build([{ code: "A", disclosedDate: "2024-11-01", disclosedTime: "15:15:00" }], false);
  assert.deepEqual([...before.byCode.get("A")!], ["2024-11-05"], "旧ルールでは引け後");

  const after = build([{ code: "A", disclosedDate: "2024-11-05", disclosedTime: "15:15:00" }], false);
  assert.deepEqual([...after.byCode.get("A")!], ["2024-11-05"], "新ルールでは引け前");
}

function testDisclosureDayCanBeExcludedFromMarking() {
  const r = build([{ code: "B", disclosedDate: "2024-11-06", disclosedTime: "16:00:00" }], false);
  assert.deepEqual([...r.byCode.get("B")!], ["2024-11-07"]);
}

function testNonTradingDayDisclosureDoesNotMarkItself() {
  // 2024-11-04 は営業日リストに無い。開示当日として印を付けない。
  const r = build([{ code: "C", disclosedDate: "2024-11-04", disclosedTime: "10:00:00" }]);
  assert.deepEqual([...r.byCode.get("C")!], ["2024-11-05"]);
}

function testOutsideCalendarIsCountedNotDropped() {
  // カレンダーより後の開示。**黙って捨てると「決算が無かった」に見える。**
  const r = build([{ code: "D", disclosedDate: "2030-01-07", disclosedTime: "10:00:00" }]);
  assert.equal(r.unresolved, 1);
  assert.equal(r.resolved, 0);
  assert.equal(r.byCode.size, 0);
}

function testSameDayMultipleDisclosuresAreMergedNotDoubled() {
  // 1社が同日に決算＋予想修正を出すのは普通（実測で日内に重複あり）。
  const r = build([
    { code: "E", disclosedDate: "2024-11-06", disclosedTime: "15:00:00" },
    { code: "E", disclosedDate: "2024-11-06", disclosedTime: "16:00:00" },
  ]);
  assert.deepEqual([...r.byCode.get("E")!].sort(), ["2024-11-06", "2024-11-07"]);
  assert.equal(r.resolved, 2, "開示は2件として数える");
  assert.equal(r.markedDates, 2, "印の付いた日は2日");
}

function testMalformedDisclosureFailsClosed() {
  assert.throws(
    () => build([{ code: "F", disclosedDate: "2024/11/06", disclosedTime: "10:00:00" }]),
    /disclosedDate must be YYYY-MM-DD/,
  );
  assert.throws(
    () => build([{ code: "F", disclosedDate: "2024-11-06", disclosedTime: "" }]),
    /disclosedTime must be HH:MM:SS/,
  );
}

testBeforeCloseReactsSameDay();
testAfterCloseReactsNextTradingDay();
testCloseTimeChangeIsHonored();
testDisclosureDayCanBeExcludedFromMarking();
testNonTradingDayDisclosureDoesNotMarkItself();
testOutsideCalendarIsCountedNotDropped();
testSameDayMultipleDisclosuresAreMergedNotDoubled();
testMalformedDisclosureFailsClosed();

console.log("earnings-event-dates: 全テスト成功");
