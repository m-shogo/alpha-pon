// 売りのシグナルを貸借銘柄に絞るテスト。
//
// 守りたい性質:
//   1. 判定はシグナル日（observedAt の JST 日付）
//   2. 区分が分からない銘柄は落とす（fail closed）
//   3. 落とした件数を理由ごとに返す

import assert from "node:assert/strict";
import { filterLendableSignals } from "../../src/research/signals/lendable-filter.js";

const TYPES = new Map<string, string>([
  ["1111|2025-01-06", "2"],
  ["1111|2025-01-07", "1"],
  ["2222|2025-01-06", "1"],
]);
const on = (code: string, date: string): string | null => TYPES.get(`${code}|${date}`) ?? null;

function testFilterByTheSignalDay() {
  const result = filterLendableSignals([
    { id: "a", code: "1111", observedAt: "2025-01-06T15:30:00+09:00" },
    // UTC で書かれていても JST の日付で引く（06:30Z = 15:30 JST の 1/7）
    { id: "b", code: "1111", observedAt: "2025-01-07T06:30:00Z" },
    { id: "c", code: "2222", observedAt: "2025-01-06T15:30:00+09:00" },
    { id: "d", code: "3333", observedAt: "2025-01-06T15:30:00+09:00" },
  ], on, "2");
  assert.deepEqual(result.kept.map((one) => one.id), ["a"]);
  assert.equal(result.notLendable, 2, "1/7 の 1111 と 2222 は信用のみ");
  assert.equal(result.unknown, 1, "区分が分からない 3333 は落とす");
}

function testLateEveningUtcCrossesTheJstDate() {
  // 2025-01-06T16:00Z は JST で 1/7 01:00。1/6 の区分で判定してはいけない。
  const result = filterLendableSignals([
    { id: "x", code: "1111", observedAt: "2025-01-06T16:00:00Z" },
  ], on, "2");
  assert.equal(result.kept.length, 0);
  assert.equal(result.notLendable, 1);
}

testFilterByTheSignalDay();
testLateEveningUtcCrossesTheJstDate();

console.log("research/lendable-filter: 全テスト成功");
