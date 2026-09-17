// 適時開示の見出しからイベントの母集団を作るテスト。
//
// 守りたい性質（事前登録 docs/research/preregistrations/2026-09-17-misconduct-disclosure.md）:
//   1. キーワードに当たり、続報の印が無く、期間内で公表済みのものだけ
//   2. 同じ会社は最初の1件だけ（N 日以内の2件目は数えない。N 日を過ぎれば別のイベント）
//   3. 反応日は引け前なら当日、引け以降なら翌営業日
//   4. 4桁コードは5桁にそろえる
//   5. 時刻が無い・JST 表記でないものは落とす
//   6. 落とした行は理由つきで全件数える

import assert from "node:assert/strict";
import {
  buildDisclosureKeywordEvents,
  type DisclosureKeywordPopulation,
  type DisclosureRow,
} from "../../src/research/signals/disclosure-keyword-events.js";

const POPULATION: DisclosureKeywordPopulation = {
  eventFrom: "2026-08-03",
  eventTo: "2026-12-30",
  keywords: ["第三者委員会", "不正アクセス", "不適切"],
  followUpMarkers: ["報告書", "第２報", "経過"],
  dedupeCalendarDays: 120,
};

const TRADING_DATES = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-12-07", "2026-12-08"];

function row(over: Partial<DisclosureRow>): DisclosureRow {
  return {
    observationDate: "2026-08-03",
    status: "published",
    code: "1234",
    sourceCode: "12340",
    title: "第三者委員会設置に関するお知らせ",
    publishedAt: "2026-08-03T15:00:00+09:00",
    url: "https://www.release.tdnet.info/inbs/x.pdf",
    ...over,
  };
}

function testBasicSelectionAndTiming() {
  const result = buildDisclosureKeywordEvents([
    row({}),
    row({ code: "5678", sourceCode: "56780", title: "不正アクセスに関するお知らせ", publishedAt: "2026-08-03T15:30:00+09:00" }),
  ], POPULATION, TRADING_DATES);
  assert.deepEqual(result.events.map((event) => [event.id, event.reactionDate, event.publishedBeforeClose, event.matchedKeyword]), [
    ["dk-12340-2026-08-03", "2026-08-03", true, "第三者委員会"],
    ["dk-56780-2026-08-04", "2026-08-04", false, "不正アクセス"],
  ], "15:00 は当日、引けちょうど 15:30 は翌営業日");
}

function testRejections() {
  const rows = [
    row({ status: "withdrawn" }),
    row({ observationDate: "2026-07-31", publishedAt: "2026-07-31T15:00:00+09:00" }),
    row({ observationDate: "2026-12-31", publishedAt: "2026-12-31T15:00:00+09:00" }),
    row({ title: "自己株式の取得に関するお知らせ" }),
    row({ title: "第三者委員会の調査報告書受領に関するお知らせ" }),
    row({ title: "不正アクセスに関するお知らせ（第２報）" }),
    row({ title: "（経過開示）不適切な取引について" }),
    row({ code: "??", sourceCode: null }),
    row({ publishedAt: null }),
    // JST では 08-04 01:00。先頭10文字（08-03）で日付を読むと取り違えるので落とす
    row({ publishedAt: "2026-08-03T16:00:00Z" }),
    row({ observationDate: "2026-12-30", publishedAt: "2026-12-30T16:00:00+09:00" }),
  ];
  const result = buildDisclosureKeywordEvents(rows, POPULATION, TRADING_DATES);
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.rejectedCounts, {
    not_published: 1,
    outside_window: 2,
    no_keyword: 1,
    follow_up: 3,
    invalid_code: 1,
    no_published_at: 2,
    no_trading_day: 1,
    duplicate_within_window: 0,
  });
  const counted = Object.values(result.rejectedCounts).reduce((sum, value) => sum + value, 0);
  assert.equal(counted + result.events.length, result.rowCount, "silent drop を作らない");
}

function testUtcInstantOnTheSameJstDateIsTimedCorrectly() {
  // 06:00Z は JST の 15:00（同じ日付）。引け前なので当日が反応日。
  const result = buildDisclosureKeywordEvents([row({ publishedAt: "2026-08-03T06:00:00Z" })], POPULATION, TRADING_DATES);
  assert.equal(result.events[0]?.reactionDate, "2026-08-03");
  assert.equal(result.events[0]?.publishedBeforeClose, true);
}

function testFirstDisclosurePerCompany() {
  const result = buildDisclosureKeywordEvents([
    // 入力順は逆でも、時刻の早いほうが残る
    row({ observationDate: "2026-08-05", publishedAt: "2026-08-05T10:00:00+09:00", title: "不適切な会計処理の判明について" }),
    row({}),
    // 120日を過ぎた同じ会社は別のイベント
    row({ observationDate: "2026-12-07", publishedAt: "2026-12-07T10:00:00+09:00", title: "不正アクセスに関するお知らせ" }),
    // 4桁しか無くても5桁にそろえて同じ会社として扱う
    row({ sourceCode: null, observationDate: "2026-08-06", publishedAt: "2026-08-06T10:00:00+09:00" }),
  ], POPULATION, TRADING_DATES);
  assert.deepEqual(result.events.map((event) => event.id), ["dk-12340-2026-08-03", "dk-12340-2026-12-07"]);
  assert.equal(result.rejectedCounts.duplicate_within_window, 2);
}

function testDedupeBoundary() {
  const population = { ...POPULATION, dedupeCalendarDays: 2 };
  const result = buildDisclosureKeywordEvents([
    row({}),
    row({ observationDate: "2026-08-05", publishedAt: "2026-08-05T10:00:00+09:00" }), // 2日後 → 数えない
    row({ observationDate: "2026-08-06", publishedAt: "2026-08-06T10:00:00+09:00" }), // 3日後 → 別のイベント
  ], population, TRADING_DATES);
  assert.deepEqual(result.events.map((event) => event.reactionDate), ["2026-08-03", "2026-08-06"]);
}

function testInvalidPopulationFailsClosed() {
  assert.throws(() => buildDisclosureKeywordEvents([], { ...POPULATION, keywords: [] }, TRADING_DATES), /keywords/);
  assert.throws(() => buildDisclosureKeywordEvents([], { ...POPULATION, followUpMarkers: [""] }, TRADING_DATES), /空の語/);
  assert.throws(() => buildDisclosureKeywordEvents([], { ...POPULATION, eventFrom: "2027-01-01" }, TRADING_DATES), /以前/);
  assert.throws(() => buildDisclosureKeywordEvents([], { ...POPULATION, dedupeCalendarDays: -1 }, TRADING_DATES), /0 以上/);
}

testBasicSelectionAndTiming();
testRejections();
testUtcInstantOnTheSameJstDateIsTimedCorrectly();
testFirstDisclosurePerCompany();
testDedupeBoundary();
testInvalidPopulationFailsClosed();

console.log("research/disclosure-keyword-events: 全テスト成功");
