// 会社予想の「直前の値」を会計年度ごとに引く。
//
// 守りたい性質:
//   1. 1Q の基準は本決算の来期予想（NxFOP）。本決算の FOP は空なので、
//      「直前の開示の FOP」だと常に基準なしになる
//   2. 別の会計年度の予想を基準にしない
//   3. 同時刻の開示どうしは互いの基準にならない
//   4. 訂正（updatesBaseline=false）は基準を動かさない
//   5. 時刻不明の開示は基準にも使わない

import assert from "node:assert/strict";
import {
  previousForecasts,
  type ForecastTimelineEntry,
} from "../../src/research/signals/forecast-timeline.js";

function entry(over: Partial<ForecastTimelineEntry>): ForecastTimelineEntry {
  return {
    code: "1234",
    disclosedAt: "2025-05-13T15:30:00+09:00",
    fiscalYearEnd: "2026-03-31",
    forecast: null,
    nextFiscalYearEnd: null,
    nextForecast: null,
    updatesBaseline: true,
    ...over,
  };
}

function testFirstQuarterUsesFullYearGuidance() {
  const entries = [
    // 本決算（FY2025-03）: 今期予想は空、来期（2026-03）予想 100
    entry({ disclosedAt: "2025-05-13T15:30:00+09:00", fiscalYearEnd: "2025-03-31", nextFiscalYearEnd: "2026-03-31", nextForecast: 100 }),
    // 1Q（FY2026-03）: 予想 100 → 据え置き
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", fiscalYearEnd: "2026-03-31", forecast: 100 }),
  ];
  const result = previousForecasts(entries);
  assert.equal(result[0], null, "本決算の今期（2025-03）の予想は手前に無い");
  assert.deepEqual(result[1], { value: 100, disclosedAt: "2025-05-13T15:30:00+09:00" }, "1Q は本決算の来期予想と比べる");
}

function testOtherFiscalYearIsNeverTheBaseline() {
  const entries = [
    entry({ disclosedAt: "2025-02-10T15:30:00+09:00", fiscalYearEnd: "2025-03-31", forecast: 500 }),
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", fiscalYearEnd: "2026-03-31", forecast: 100 }),
  ];
  assert.equal(previousForecasts(entries)[1], null, "前年度の 500 と比べない");
}

function testRevisionUpdatesAndQuarterSeesIt() {
  const entries = [
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", forecast: 100 }),
    entry({ disclosedAt: "2025-10-01T15:00:00+09:00", forecast: 130 }), // 業績予想の修正
    entry({ disclosedAt: "2025-11-05T15:30:00+09:00", forecast: 130 }), // 2Q で据え置き
  ];
  const result = previousForecasts(entries);
  assert.equal(result[1]?.value, 100, "修正の基準は 1Q の予想");
  assert.equal(result[2]?.value, 130, "2Q の基準は修正後の予想");
}

function testSameInstantDisclosuresDoNotSeeEachOther() {
  const entries = [
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", forecast: 100 }),
    // 2Q 短信と業績予想の修正が同時刻。どちらの基準も 1Q の 100。
    entry({ disclosedAt: "2025-11-05T15:30:00+09:00", forecast: 150 }),
    entry({ disclosedAt: "2025-11-05T06:30:00Z", forecast: 150 }), // 同じ瞬間を UTC で書いたもの
    entry({ disclosedAt: "2026-02-05T15:30:00+09:00", forecast: 150 }),
  ];
  const result = previousForecasts(entries);
  assert.equal(result[1]?.value, 100);
  assert.equal(result[2]?.value, 100, "表記が違っても同じ瞬間なら同じ束");
  assert.equal(result[3]?.value, 150);
}

function testInputOrderDoesNotMatter() {
  const entries = [
    entry({ disclosedAt: "2025-11-05T15:30:00+09:00", forecast: 130 }),
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", forecast: 100 }),
  ];
  const result = previousForecasts(entries);
  assert.equal(result[0]?.value, 100, "入力が時刻順でなくても時刻で並べる");
  assert.equal(result[1], null);
}

function testCorrectionDoesNotMoveBaseline() {
  const entries = [
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", forecast: 100 }),
    entry({ disclosedAt: "2025-08-06T15:30:00+09:00", forecast: 200, updatesBaseline: false }),
    entry({ disclosedAt: "2025-11-05T15:30:00+09:00", forecast: 100 }),
  ];
  const result = previousForecasts(entries);
  assert.equal(result[1]?.value, 100, "訂正自身の基準は引ける");
  assert.equal(result[2]?.value, 100, "訂正は基準を動かさない");
}

function testUnknownInstantIsIgnored() {
  const entries = [
    entry({ disclosedAt: null, forecast: 999 }),
    entry({ disclosedAt: "2025-08-05T15:30:00+09:00", forecast: 100 }),
  ];
  const result = previousForecasts(entries);
  assert.equal(result[0], null);
  assert.equal(result[1], null, "時刻不明の 999 を基準にしない");
}

function testCodesAreIndependentAndNullForecastDoesNotErase() {
  const entries = [
    entry({ code: "1111", disclosedAt: "2025-08-05T15:30:00+09:00", forecast: 100 }),
    entry({ code: "2222", disclosedAt: "2025-09-05T15:30:00+09:00", forecast: 300 }),
    entry({ code: "1111", disclosedAt: "2025-09-10T15:30:00+09:00", forecast: null }),
    entry({ code: "1111", disclosedAt: "2025-11-05T15:30:00+09:00", forecast: 90 }),
  ];
  const result = previousForecasts(entries);
  assert.equal(result[1], null, "別銘柄の予想を基準にしない");
  assert.equal(result[2]?.value, 100);
  assert.equal(result[3]?.value, 100, "予想が空の開示は基準を消さない");
}

function testInvalidValuesFailClosed() {
  assert.throws(() => previousForecasts([entry({ fiscalYearEnd: "2026/03/31" })]), /YYYY-MM-DD/);
  assert.throws(() => previousForecasts([entry({ forecast: Number.NaN })]), /finite/);
  assert.throws(
    () => previousForecasts([entry({ disclosedAt: "2025-08-05T15:30:00" })]),
    /disclosedAt/,
    "タイムゾーンの無い時刻は、比較相手が居なくても通さない",
  );
}

testFirstQuarterUsesFullYearGuidance();
testOtherFiscalYearIsNeverTheBaseline();
testRevisionUpdatesAndQuarterSeesIt();
testSameInstantDisclosuresDoNotSeeEachOther();
testInputOrderDoesNotMatter();
testCorrectionDoesNotMoveBaseline();
testUnknownInstantIsIgnored();
testCodesAreIndependentAndNullForecastDoesNotErase();
testInvalidValuesFailClosed();

console.log("research/forecast-timeline: 全テスト成功");
