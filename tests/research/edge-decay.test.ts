// Edge の劣化検知のテスト。
//
// 守りたい性質:
//   1. サンプル不足を「維持されている」と読ませない
//   2. 符号の反転を目減りと区別する
//   3. 期間が時系列順であることを強制する
//   4. 過去も効いていない Edge を「維持」と誤読させない

import assert from "node:assert/strict";
import { aggregate } from "../../src/research/net-alpha.js";
import {
  checkEdgeDecay,
  type DecayCheckInput,
  type DecayPeriod,
} from "../../src/research/signals/edge-decay.js";

/** 指定の平均・クラスタ数を持つ集計を作る。 */
function stats(meanBps: number, clusters: number, perCluster = 3) {
  const values: number[] = [];
  const keys: string[] = [];
  for (let cluster = 0; cluster < clusters; cluster += 1) {
    for (let index = 0; index < perCluster; index += 1) {
      values.push(meanBps + (index - 1) * 5);
      keys.push(`d-${cluster}`);
    }
  }
  return aggregate(values, keys);
}

function period(label: string, from: string, to: string, meanBps: number, clusters: number): DecayPeriod {
  return { label, from, to, stats: stats(meanBps, clusters) };
}

function input(over: Partial<DecayCheckInput> = {}): DecayCheckInput {
  return {
    edgeId: "misconduct-overreaction-recovery",
    periods: [
      period("2024H1", "2024-01-01", "2024-06-30", 120, 20),
      period("2024H2", "2024-07-01", "2024-12-31", 100, 20),
      period("2025H1", "2025-01-01", "2025-06-30", 110, 20),
    ],
    ...over,
  };
}

function testMaintainedWhenRecentHoldsUp() {
  const result = checkEdgeDecay(input());
  assert.equal(result.verdict, "maintained");
  assert.deepEqual(result.recent.periodLabels, ["2025H1"]);
  assert.deepEqual(result.historical.periodLabels, ["2024H1", "2024H2"]);
  assert.ok(result.deltaBps !== null);
}

function testWeakenedWhenRecentShrinks() {
  const result = checkEdgeDecay(input({
    periods: [
      period("2024H1", "2024-01-01", "2024-06-30", 200, 20),
      period("2024H2", "2024-07-01", "2024-12-31", 200, 20),
      period("2025H1", "2025-01-01", "2025-06-30", 40, 20),
    ],
  }));
  assert.equal(result.verdict, "weakened");
  assert.ok(result.reasons.some((one) => one.includes("目減り")));
}

function testReversedIsDistinctFromWeakened() {
  const result = checkEdgeDecay(input({
    periods: [
      period("2024H1", "2024-01-01", "2024-06-30", 150, 20),
      period("2024H2", "2024-07-01", "2024-12-31", 150, 20),
      period("2025H1", "2025-01-01", "2025-06-30", -80, 20),
    ],
  }));
  assert.equal(result.verdict, "reversed", "符号の反転は単なる目減りと別扱い");
  assert.ok(result.reasons.some((one) => one.includes("符号が反転")));
}

function testInsufficientDataIsNotMaintained() {
  const result = checkEdgeDecay(input({
    periods: [
      period("2024H1", "2024-01-01", "2024-06-30", 120, 20),
      period("2025H1", "2025-01-01", "2025-06-30", 110, 2),  // クラスタ2つだけ
    ],
  }));
  assert.equal(result.verdict, "insufficient_data", "サンプル不足を維持と読ませない");
  assert.equal(result.deltaBps, null, "判定できないときに差分を出さない");
  assert.ok(
    result.warnings.some((one) => one.includes("「劣化を検出しなかった」ではありません")),
    "何も言えない状態を問題なしと読ませない",
  );
}

function testMinClustersIsConfigurable() {
  const periods = [
    period("2024H1", "2024-01-01", "2024-06-30", 120, 5),
    period("2025H1", "2025-01-01", "2025-06-30", 110, 5),
  ];
  assert.equal(checkEdgeDecay(input({ periods })).verdict, "insufficient_data");
  assert.equal(
    checkEdgeDecay(input({ periods, minClustersPerSide: 5 })).verdict,
    "maintained",
  );
}

function testHistoricallyIneffectiveEdgeIsFlagged() {
  const result = checkEdgeDecay(input({
    periods: [
      period("2024H1", "2024-01-01", "2024-06-30", -50, 20),
      period("2024H2", "2024-07-01", "2024-12-31", -30, 20),
      period("2025H1", "2025-01-01", "2025-06-30", 60, 20),
    ],
  }));
  assert.ok(
    result.reasons.some((one) => one.includes("劣化を測る前提が成立していません")),
    "過去も効いていない Edge を普通の維持判定にしない",
  );
  assert.ok(result.warnings.some((one) => one.includes("額面どおり読まないでください")));
}

function testRecentPeriodCountIsConfigurable() {
  const result = checkEdgeDecay(input({ recentPeriodCount: 2 }));
  assert.deepEqual(result.recent.periodLabels, ["2024H2", "2025H1"]);
  assert.deepEqual(result.historical.periodLabels, ["2024H1"]);
}

function testChronologicalOrderIsEnforced() {
  assert.throws(
    () => checkEdgeDecay(input({
      periods: [
        period("2025H1", "2025-01-01", "2025-06-30", 110, 20),
        period("2024H1", "2024-01-01", "2024-06-30", 120, 20),
      ],
    })),
    /chronological order/,
    "順序が崩れると「直近」が定まらない",
  );
  assert.throws(
    () => checkEdgeDecay(input({
      periods: [
        period("A", "2024-01-01", "2024-12-31", 120, 20),
        period("B", "2024-06-01", "2025-06-30", 110, 20),
      ],
    })),
    /without overlap/,
  );
}

function testAtLeastTwoPeriodsAreRequired() {
  assert.throws(
    () => checkEdgeDecay(input({ periods: [period("only", "2024-01-01", "2024-12-31", 120, 20)] })),
    /at least 2 periods/,
  );
}

function testInvalidParamsFailClosed() {
  for (const [over, pattern] of [
    [{ edgeId: "" }, /edgeId must be a non-empty string/],
    [{ recentPeriodCount: 0 }, /recentPeriodCount/],
    [{ recentPeriodCount: 3 }, /recentPeriodCount/],
    [{ minClustersPerSide: 0 }, /minClustersPerSide/],
    [{ weakenedRatio: 0 }, /weakenedRatio/],
    [{ weakenedRatio: 1 }, /weakenedRatio/],
  ] as const) {
    assert.throws(() => checkEdgeDecay(input(over as Partial<DecayCheckInput>)), pattern);
  }
}

testMaintainedWhenRecentHoldsUp();
testWeakenedWhenRecentShrinks();
testReversedIsDistinctFromWeakened();
testInsufficientDataIsNotMaintained();
testMinClustersIsConfigurable();
testHistoricallyIneffectiveEdgeIsFlagged();
testRecentPeriodCountIsConfigurable();
testChronologicalOrderIsEnforced();
testAtLeastTwoPeriodsAreRequired();
testInvalidParamsFailClosed();

console.log("research/edge-decay: 全テスト成功");
