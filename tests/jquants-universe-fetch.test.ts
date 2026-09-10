// 日付指定での全銘柄取得（PIT ユニバース）のテスト。
//
// なぜこの経路が要るか:
//   J-Quants はバースト枠制。銘柄ループだと1営業日あたり ~4,400 リクエストで
//   歴史を組めない。`?date=` なら1リクエストで全銘柄。
//   そして「その日に板が立った銘柄集合」＝その日の PIT ユニバースでもある。
//
// 守りたい性質:
//   1. 「枠外で聞いていない」「聞いたが0件」「聞いて件数あり」を混同しない
//   2. 要求した日付以外の行が混ざったら落ちる（黙って混ぜない）
//   3. 同じ銘柄が2行来たら落ちる
//   4. asOf より observedAt が後の日は1行も出さない（先読み防止）
//   5. 出す行は必ず PIT レコードとして妥当

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JQuantsFreePriceProvider,
  jquantsFreeObservedAt,
} from "../src/research/providers/jquants-free.js";
import { validatePriceRecord, withPriceRecordHash } from "../src/research/price-store.js";
import type { JsonSchema } from "../src/research/schema.js";
import type { DailyQuote } from "../src/fetcher/jquants.js";

const SCHEMA = JSON.parse(
  readFileSync("research/schemas/price-record.schema.json", "utf-8"),
) as JsonSchema;

const TRADING_DATE = "2025-09-01";
// observedAt は 84日遅延の終端。asOf はそれより十分あと。
const AS_OF = "2026-01-01T00:00:00.000Z";
const RETRIEVED_AT = "2026-01-01T00:00:00.000Z";
const FIRST_EXECUTABLE_AT = "2026-01-02T00:00:00.000Z";

function quote(code: string, date = TRADING_DATE, close = 1000): DailyQuote {
  return {
    Code: code,
    Date: date.replace(/-/g, ""),
    Open: close,
    High: close + 10,
    Low: close - 10,
    Close: close,
    Volume: 1000,
    AdjustmentFactor: 1,
    AdjustmentClose: close,
    AdjustmentVolume: 1000,
  };
}

function provider(fetchQuotesByDate: (date: string) => Promise<DailyQuote[] | null>) {
  return new JQuantsFreePriceProvider({
    fetchQuotesByDate,
    now: () => new Date(RETRIEVED_AT),
    resolveFirstExecutableAt: () => FIRST_EXECUTABLE_AT,
  });
}

async function testEntitledRowsProducesUniverse(): Promise<void> {
  const batch = await provider(async () => [quote("13060"), quote("72030"), quote("99840")])
    .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF });

  assert.equal(batch.outcome, "entitled_rows");
  assert.deepEqual(batch.universe, ["13060", "72030", "99840"]);
  assert.equal(batch.records.length, 3);
  assert.equal(batch.tradingDate, TRADING_DATE);
  assert.equal(batch.withheldForAsOf, 0);
}

async function testUniverseIsSorted(): Promise<void> {
  // API の返却順に依存しない。順序が入力任せだと差分が毎回汚れる。
  const batch = await provider(async () => [quote("99840"), quote("13060"), quote("72030")])
    .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF });
  assert.deepEqual(batch.universe, ["13060", "72030", "99840"]);
}

async function testNotEntitledIsNotConfusedWithEmpty(): Promise<void> {
  // 枠外（null）と 0件（[]）は別物。前者は「聞いていない」、後者は「聞いた」。
  const outside = await provider(async () => null)
    .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF });
  assert.equal(outside.outcome, "not_entitled");
  assert.equal(outside.records.length, 0);

  const empty = await provider(async () => [])
    .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF });
  assert.equal(empty.outcome, "entitled_empty");
  assert.equal(empty.records.length, 0);

  assert.notEqual(outside.outcome, empty.outcome);
}

async function testForeignDateRowFailsClosed(): Promise<void> {
  // 別の日の行が紛れ込むと、その銘柄の履歴が1日ずれる。黙って通してはいけない。
  await assert.rejects(
    provider(async () => [quote("13060"), quote("72030", "2025-09-02")])
      .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF }),
    /row for 20250902 while fetching 2025-09-01/,
  );
}

async function testDuplicateCodeFailsClosed(): Promise<void> {
  await assert.rejects(
    provider(async () => [quote("13060"), quote("13060")])
      .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF }),
    /duplicate J-Quants row for 13060/,
  );
}

async function testAsOfBeforeObservedAtWithholdsEveryRow(): Promise<void> {
  // 開示遅延の内側では1行も出さない。ここが漏れると全バックテストが先読みになる。
  const observedAt = jquantsFreeObservedAt(TRADING_DATE);
  const justBefore = new Date(Date.parse("2025-11-24T14:59:59.000Z")).toISOString();
  assert.ok(justBefore < observedAt.replace("+09:00", ""), "テスト前提: asOf は observedAt より前");

  const batch = await provider(async () => [quote("13060"), quote("72030")])
    .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: justBefore });

  assert.equal(batch.records.length, 0);
  assert.deepEqual(batch.universe, []);
  assert.equal(batch.withheldForAsOf, 2, "抑止した行数は報告する（黙って消さない）");
  assert.equal(batch.outcome, "entitled_rows", "枠内で行はあった、という事実は保つ");
}

async function testRecordsAreValidPitRecords(): Promise<void> {
  const batch = await provider(async () => [quote("13060")])
    .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: AS_OF });

  const record = withPriceRecordHash(batch.records[0]!);
  const errors = validatePriceRecord(record, SCHEMA, new Date(RETRIEVED_AT))
    .filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, [], JSON.stringify(errors));
  assert.equal(record.adjusted, false, "PIT v1 は無調整のみ");
  assert.equal(record.tradingDate, TRADING_DATE);
  assert.equal(record.status, "traded");
}

async function testInvalidAsOfFailsClosed(): Promise<void> {
  await assert.rejects(
    provider(async () => [quote("13060")])
      .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: "2026-01-01" }),
    /asOf/,
  );

  // 枠外（null）は比較の手前で早期 return する経路。入力検証をそこに任せると
  // 「枠外の日だけ不正な asOf が素通り」という穴になる。分岐に依らず落ちること。
  await assert.rejects(
    provider(async () => null)
      .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: "2026-01-01" }),
    /asOf/,
    "枠外の経路でも asOf の形式は検証される",
  );

  // 0件の経路も同じ。
  await assert.rejects(
    provider(async () => [])
      .fetchDailyUniverse({ tradingDate: TRADING_DATE, asOf: "not-a-timestamp" }),
    /asOf/,
  );
}

async function testInvalidTradingDateFailsClosed(): Promise<void> {
  await assert.rejects(
    provider(async () => [quote("13060")])
      .fetchDailyUniverse({ tradingDate: "2025-02-30", asOf: AS_OF }),
    /invalid J-Quants trading date/,
  );
}

async function main(): Promise<void> {
  await testEntitledRowsProducesUniverse();
  await testUniverseIsSorted();
  await testNotEntitledIsNotConfusedWithEmpty();
  await testForeignDateRowFailsClosed();
  await testDuplicateCodeFailsClosed();
  await testAsOfBeforeObservedAtWithholdsEveryRow();
  await testRecordsAreValidPitRecords();
  await testInvalidAsOfFailsClosed();
  await testInvalidTradingDateFailsClosed();
  console.log("jquants-universe-fetch: 全テスト成功");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
