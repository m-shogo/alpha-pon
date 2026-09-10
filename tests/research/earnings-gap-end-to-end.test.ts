// 決算ギャップ配管の end-to-end 回帰テスト。
//
// signal生成 → bundle組立 → runBacktest が繋がったままであることを守る。
// **収益性は検証しない。** fixtureは合成データであり、Edgeの存在を主張しない。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  runBacktest,
  type BacktestSignal,
  type BacktestSpec,
  type PriceSeries,
} from "../../src/research/backtest.js";
import { buildUniquePriceSeriesMap } from "../../src/research/backtest-bundle-input.js";
import { loadSchema } from "../../src/research/io.js";
import { formatErrors, validate } from "../../src/research/schema.js";

interface Bundle {
  spec: BacktestSpec;
  signals: BacktestSignal[];
  prices: PriceSeries[];
  benchmark?: PriceSeries;
  trials?: number;
}

const FIXTURE_PATH = resolve(process.cwd(), "research/fixtures/backtests/synthetic-earnings-gap.json");

function loadBundle(): Bundle {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as Bundle;
}

function testFixtureSpecMatchesSchema() {
  const bundle = loadBundle();
  const errors = validate(bundle.spec, loadSchema("backtest"));
  assert.equal(errors.length, 0, `spec がスキーマ違反:\n${formatErrors(errors)}`);
}

function testFixtureShape() {
  const bundle = loadBundle();
  assert.equal(bundle.spec.edgeId, "earnings-gap-overreaction");
  assert.equal(bundle.spec.benchmark, "9999", "benchmark 調整を必ず通す");
  assert.equal(bundle.signals.length, 6, "深いギャップかつ会社予想据え置きの6件だけが signal");
  assert.equal(bundle.prices.length, 6, "signal が参照する code の価格だけ載る");
  assert.ok(bundle.benchmark, "benchmark 系列が同梱される");

  for (const signal of bundle.signals) {
    assert.match(signal.id, /^eg-\d{4}-\d{4}-\d{2}-\d{2}$/, `signal id 形式: ${signal.id}`);
    assert.match(signal.observedAt, /T15:30:00\+09:00$/, "observedAt は反応日の引け");
  }

  for (const series of [...bundle.prices, bundle.benchmark!]) {
    for (let index = 1; index < series.bars.length; index += 1) {
      assert.ok(
        series.bars[index - 1].date < series.bars[index].date,
        `${series.code} の bars が日付昇順でない`,
      );
    }
  }
}

function testEntryIsAfterObservation() {
  // PIT: エントリー日は必ず observedAt の JST 日付より後でなければならない。
  const bundle = loadBundle();
  const report = runBacktest(
    bundle.spec,
    bundle.signals,
    buildUniquePriceSeriesMap(bundle.prices),
    bundle.benchmark,
  );
  const observedByeId = new Map(bundle.signals.map((one) => [one.id, one.observedAt.slice(0, 10)]));
  let checked = 0;
  for (const trade of report.trades) {
    if (!trade.executable || !trade.entryDate) continue;
    const observedDate = observedByeId.get(trade.signalId)!;
    assert.ok(
      trade.entryDate > observedDate,
      `${trade.signalId}: entry ${trade.entryDate} は observed ${observedDate} より後でなければならない`,
    );
    checked += 1;
  }
  assert.ok(checked > 0, "検査対象の約定が1件も無いのは異常");
}

function testBenchmarkAdjustmentIsAlwaysApplied() {
  const bundle = loadBundle();
  const report = runBacktest(
    bundle.spec,
    bundle.signals,
    buildUniquePriceSeriesMap(bundle.prices),
    bundle.benchmark,
  );
  for (const trade of report.trades) {
    if (!trade.executable) continue;
    assert.notEqual(
      trade.benchmarkReturnBps,
      undefined,
      `${trade.signalId}: benchmark 未調整のまま返してはいけない`,
    );
    assert.ok(trade.totalCostBps! > 0, "コストが0のまま報告してはいけない");
    assert.notEqual(trade.grossAlphaBps, trade.netAlphaBps, "Gross と Net が同一なのはコスト未計上");
  }
}

function testReportIsDeterministic() {
  const bundle = loadBundle();
  const first = runBacktest(
    bundle.spec,
    bundle.signals,
    buildUniquePriceSeriesMap(bundle.prices),
    bundle.benchmark,
  );
  const second = runBacktest(
    bundle.spec,
    bundle.signals,
    buildUniquePriceSeriesMap(bundle.prices),
    bundle.benchmark,
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second), "同じ入力で同じレポート");
  assert.equal(first.signalCount, 6);
  assert.equal(first.executedCount + first.skipped.length, first.signalCount, "全 signal が説明される");
}

testFixtureSpecMatchesSchema();
testFixtureShape();
testEntryIsAfterObservation();
testBenchmarkAdjustmentIsAlwaysApplied();
testReportIsDeterministic();

console.log("research/earnings-gap-end-to-end: 全テスト成功");
