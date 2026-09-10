// 権利落ち観測台帳のテスト。
//
// なぜ要るか（実測）:
//   2024-06-19〜2025-03 の189営業日を取り込み、単日 -25% 以下を数えたら 470件。
//   先頭は `15680` 2024-06-28 の -99%。API で照合すると AdjFactor=0.01、
//   つまり 1:100 分割だった。これを除かずに F1 を回すと候補の大半が分割になる。
//
// 守りたい性質:
//   1. factor=1 を「イベント」にしない（4,400銘柄×520日ぶんのゴミになる）
//   2. 中断・再開で同じ観測が二重に載っても畳める
//   3. だが同じ日に別の factor が来たら畳まずに落ちる（どちらが正か決められない）
//   4. 原因（分割/併合/権利落ち）を名乗らない。向きだけは factor から確実

import assert from "node:assert/strict";
import {
  adjustmentDirection,
  dedupeAdjustmentEvents,
  parseAdjustmentLedger,
  toCorporateActionDates,
  withAdjustmentHash,
  type JQuantsAdjustmentEventInput,
} from "../src/research/providers/jquants-adjustment-events.js";

function input(code: string, effectiveDate: string, factor: number): JQuantsAdjustmentEventInput {
  return {
    schemaVersion: 1,
    code,
    effectiveDate,
    factor,
    source: "jquants",
    sourceVersion: "test",
    observedAt: `${effectiveDate}T23:59:59.999999999+09:00`,
    retrievedAt: "2026-09-11T00:00:00.000Z",
  };
}

function testDirectionFromFactor(): void {
  // 1:100 分割は factor=0.01。値段が下がる向き。
  assert.equal(adjustmentDirection(0.01), "price_decrease");
  // 10:1 併合は factor=10。値段が上がる向き。
  assert.equal(adjustmentDirection(10), "price_increase");
  // 1 はイベントではない。ここを通すと全銘柄・全日がイベントになる。
  assert.throws(() => adjustmentDirection(1), /not an adjustment event/);
  assert.throws(() => adjustmentDirection(0), /positive finite/);
  assert.throws(() => adjustmentDirection(-1), /positive finite/);
  assert.throws(() => adjustmentDirection(Number.NaN), /positive finite/);
}

function testHashIsFactBasedNotObservationBased(): void {
  // 同じ権利落ちを別の時刻に2回観測しても「同じ事実」。
  const first = withAdjustmentHash(input("15680", "2024-06-28", 0.01));
  const second = withAdjustmentHash({
    ...input("15680", "2024-06-28", 0.01),
    retrievedAt: "2026-12-31T00:00:00.000Z",
  });
  assert.equal(first.contentHash, second.contentHash, "観測時刻で事実は変わらない");

  const differentFactor = withAdjustmentHash(input("15680", "2024-06-28", 0.5));
  assert.notEqual(first.contentHash, differentFactor.contentHash);
  const differentCode = withAdjustmentHash(input("15790", "2024-06-28", 0.01));
  assert.notEqual(first.contentHash, differentCode.contentHash);
  const differentDate = withAdjustmentHash(input("15680", "2024-06-27", 0.01));
  assert.notEqual(first.contentHash, differentDate.contentHash);
}

function testInvalidInputFailsClosed(): void {
  assert.throws(() => withAdjustmentHash(input("15680", "20240628", 0.01)), /YYYY-MM-DD/);
  assert.throws(() => withAdjustmentHash(input("abc", "2024-06-28", 0.01)), /invalid security code/);
  assert.throws(() => withAdjustmentHash(input("15680", "2024-06-28", 1)), /not an adjustment event/);
}

function testDuplicateObservationsAreFolded(): void {
  // 価格ファイルの rename より前に追記するので、中断・再開で二重に載る。
  const event = withAdjustmentHash(input("15680", "2024-06-28", 0.01));
  const folded = dedupeAdjustmentEvents([event, event, event]);
  assert.equal(folded.length, 1);
}

function testConflictingFactorsFailClosed(): void {
  // 同じ日に別の factor は畳めない。黙って片方を採ると、その銘柄の
  // 異常変動判定が静かに狂う（分割を除けたつもりで除けていない）。
  assert.throws(
    () => dedupeAdjustmentEvents([
      withAdjustmentHash(input("15680", "2024-06-28", 0.01)),
      withAdjustmentHash(input("15680", "2024-06-28", 0.5)),
    ]),
    /conflicting adjustment factors for 15680 on 2024-06-28: 0.01 vs 0.5/,
  );
}

function testDedupeIsOrdered(): void {
  const folded = dedupeAdjustmentEvents([
    withAdjustmentHash(input("99840", "2025-01-01", 0.5)),
    withAdjustmentHash(input("13060", "2024-06-28", 0.01)),
    withAdjustmentHash(input("15790", "2024-06-28", 0.01)),
  ]);
  assert.deepEqual(
    folded.map((event) => `${event.effectiveDate}/${event.code}`),
    ["2024-06-28/13060", "2024-06-28/15790", "2025-01-01/99840"],
    "日付昇順、同日は code 昇順",
  );
}

function testCorporateActionDatesShape(): void {
  // F1 / earnings-gap がそのまま受け取れる形であること。
  const dates = toCorporateActionDates([
    withAdjustmentHash(input("15680", "2024-06-28", 0.01)),
    withAdjustmentHash(input("15680", "2025-03-21", 0.1)),
    withAdjustmentHash(input("15790", "2024-06-28", 0.01)),
  ]);
  assert.deepEqual([...dates.keys()].sort(), ["15680", "15790"]);
  assert.deepEqual([...dates.get("15680")!].sort(), ["2024-06-28", "2025-03-21"]);
  assert.deepEqual([...dates.get("15790")!], ["2024-06-28"]);
}

function testCorporateActionDatesPropagatesConflicts(): void {
  // 畳めない矛盾を握りつぶして「権利落ちなし」で返してはいけない。
  assert.throws(
    () => toCorporateActionDates([
      withAdjustmentHash(input("15680", "2024-06-28", 0.01)),
      withAdjustmentHash(input("15680", "2024-06-28", 0.02)),
    ]),
    /conflicting adjustment factors/,
  );
}

function testLedgerParsing(): void {
  const event = withAdjustmentHash(input("15680", "2024-06-28", 0.01));
  assert.deepEqual(parseAdjustmentLedger(`${JSON.stringify(event)}\n`), [event]);
  assert.deepEqual(parseAdjustmentLedger(""), [], "空の台帳は空。エラーではない");
  assert.deepEqual(parseAdjustmentLedger("\n\n"), []);
  // 壊れた台帳のまま進むと、次工程が黙って「権利落ちなし」で走る。
  assert.throws(() => parseAdjustmentLedger("{broken\n"), /is not JSON/);
}

testDirectionFromFactor();
testHashIsFactBasedNotObservationBased();
testInvalidInputFailsClosed();
testDuplicateObservationsAreFolded();
testConflictingFactorsFailClosed();
testDedupeIsOrdered();
testCorporateActionDatesShape();
testCorporateActionDatesPropagatesConflicts();
testLedgerParsing();

console.log("jquants-adjustment-events: 全テスト成功");
