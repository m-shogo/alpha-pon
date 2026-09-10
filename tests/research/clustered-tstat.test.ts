// イベント日クラスタリング補正のテスト。
//
// 同じ日に出たシグナルは同じ出来事への反応であり、独立な観測ではない。
// 独立と見なすと t 値が膨らみ、存在しないエッジが有意に見える。
// これは「損をする」種類の誤りではなく「偽のエッジを生む」種類の誤りなので最も危険。

import assert from "node:assert/strict";
import { aggregate } from "../../src/research/net-alpha.js";
import { runBacktest, type BacktestSpec, type PriceSeries } from "../../src/research/backtest.js";

function testSameDaySignalsCollapseToOneObservation() {
  const values: number[] = [];
  const keys: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    values.push(100 + (i % 3) * 2);
    keys.push("2026-01-07");
  }
  const stats = aggregate(values, keys);
  assert.equal(stats.count, 30);
  assert.equal(stats.clusterCount, 1, "全部同日なら 1 クラスタ");
  assert.ok((stats.tStat ?? 0) > 100, "未補正 t は極端に大きく出る");
  assert.equal(
    stats.clusteredTStat,
    null,
    "1 クラスタでは t を算出しない。30件ではなく1観測しかない",
  );
}

function testClusteredTStatIsAlwaysSmaller() {
  const values: number[] = [];
  const keys: string[] = [];
  for (let day = 0; day < 6; day += 1) {
    for (let i = 0; i < 5; i += 1) {
      values.push(100 + day * 10 + (i % 3) * 2);
      keys.push(`2026-01-0${day + 1}`);
    }
  }
  const stats = aggregate(values, keys);
  assert.equal(stats.count, 30);
  assert.equal(stats.clusterCount, 6);
  assert.ok(stats.tStat !== null && stats.clusteredTStat !== null);
  assert.ok(
    Math.abs(stats.clusteredTStat!) < Math.abs(stats.tStat!),
    `補正後 (${stats.clusteredTStat}) は必ず未補正 (${stats.tStat}) より小さい`,
  );
}

function testOneSignalPerDayLeavesTStatUnchanged() {
  const values = [10, -5, 20, -15, 30, 8];
  const keys = values.map((_, index) => `2026-02-0${index + 1}`);
  const stats = aggregate(values, keys);
  assert.equal(stats.clusterCount, 6);
  assert.ok(stats.tStat !== null && stats.clusteredTStat !== null);
  assert.ok(
    Math.abs(stats.tStat! - stats.clusteredTStat!) < 1e-9,
    "1日1件なら補正しても値は変わらない",
  );
}

function testClusterKeysAreOptionalAndReportNull() {
  const stats = aggregate([10, 20, 30]);
  assert.equal(stats.clusterCount, null, "キー未指定なら算出しない");
  assert.equal(stats.clusteredTStat, null);
  assert.ok(stats.tStat !== null, "未補正 t は従来どおり出る");
}

function testMisalignedClusterKeysFailClosed() {
  assert.throws(
    () => aggregate([1, 2, 3], ["2026-01-01"]),
    /cluster keys must align with values/,
    "キーと値の数が合わないまま集計してはいけない",
  );
}

function testEmptyInputIsSafe() {
  const withKeys = aggregate([], []);
  assert.equal(withKeys.clusterCount, 0);
  assert.equal(withKeys.clusteredTStat, null);
  const withoutKeys = aggregate([]);
  assert.equal(withoutKeys.clusterCount, null);
}

function testBacktestClustersByEntryDate() {
  // 同じ反応日に 3 銘柄がエントリーするケース。
  const dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
  const makeSeries = (code: string, drift: number): PriceSeries => ({
    code,
    bars: dates.map((date, index) => {
      const close = 1000 + index * drift;
      const open = index === 0 ? close : 1000 + (index - 1) * drift;
      return {
        date,
        open,
        high: Math.max(open, close) + 5,
        low: Math.min(open, close) - 5,
        close,
        volume: 5_000_000,
      };
    }),
  });
  const spec: BacktestSpec = {
    schemaVersion: 1,
    id: "cluster-entry-spec",
    edgeId: "cluster-probe",
    side: "long",
    notionalJpy: 1_000_000,
    entry: { mode: "next_open" },
    exit: { mode: "holding_period", holdingPeriodDays: 2 },
    costs: { commissionBps: 1, spreadBps: 2, slippageBps: 1 },
    liquidity: { participationLimitPct: 50 },
  };
  const signals = ["1111", "2222", "3333"].map((code) => ({
    id: `sig-${code}`,
    code,
    observedAt: "2026-01-05T15:30:00+09:00",
  }));
  const prices = new Map([
    ["1111", makeSeries("1111", 10)],
    ["2222", makeSeries("2222", 12)],
    ["3333", makeSeries("3333", 8)],
  ]);
  const report = runBacktest(spec, signals, prices);
  assert.equal(report.executedCount, 3);
  assert.equal(report.net.count, 3);
  assert.equal(report.net.clusterCount, 1, "同じ日にエントリーした3件は1クラスタ");
  assert.equal(report.net.clusteredTStat, null, "1クラスタでは判定用 t を出さない");
}

testSameDaySignalsCollapseToOneObservation();
testClusteredTStatIsAlwaysSmaller();
testOneSignalPerDayLeavesTStatUnchanged();
testClusterKeysAreOptionalAndReportNull();
testMisalignedClusterKeysFailClosed();
testEmptyInputIsSafe();
testBacktestClustersByEntryDate();

console.log("research/clustered-tstat: 全テスト成功");
