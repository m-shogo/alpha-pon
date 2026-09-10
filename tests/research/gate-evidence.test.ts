// 測定結果から Gate の裏付けを導出するテスト。
//
// 守りたい性質:
//   1. 証拠が無い Gate は supported: false（既定で通さない）
//   2. 「まだ測っていない」と「測って問題なかった」を区別する
//   3. 何をすれば埋まるかを必ず返す
//   4. サンプル数が足りていてもクラスタが少なければ通さない

import assert from "node:assert/strict";
import { aggregate } from "../../src/research/net-alpha.js";
import { GATE_KEYS } from "../../src/research/types.js";
import {
  deriveGateEvidence,
  formatGateEvidence,
  type GateEvidenceInput,
} from "../../src/research/signals/gate-evidence.js";

function stats(meanBps: number, samples: number, clusters: number) {
  const values: number[] = [];
  const keys: string[] = [];
  for (let index = 0; index < samples; index += 1) {
    values.push(meanBps + (index % 3) * 4);
    keys.push(`d-${index % clusters}`);
  }
  return aggregate(values, keys);
}

function eventStudyWith(samples: number, clusters: number) {
  return {
    observations: [],
    summaryByHorizon: [{
      horizonBars: 20,
      treatment: stats(120, samples, clusters),
      control: stats(10, samples, clusters),
      differenceBps: 110,
      treatmentReclaimRate: 0.6,
      controlReclaimRate: 0.3,
    }],
    skipped: [],
    skippedCounts: {} as never,
    subjectCount: samples,
  };
}

function fullInput(over: Partial<GateEvidenceInput> = {}): GateEvidenceInput {
  return {
    edgeId: "misconduct-overreaction-recovery",
    requiredSamples: 120,
    eventStudy: eventStudyWith(130, 48) as never,
    backtest: {
      net: stats(45, 130, 48),
      skippedReasons: {},
      falseDiscoveryPassed: true,
      borrowCostIncluded: true,
    },
    decay: {
      edgeId: "misconduct-overreaction-recovery",
      verdict: "maintained",
      historical: { periodLabels: ["a"], sampleCount: 80, clusterCount: 30, meanNetAlphaBps: 100, clusteredTStats: [2.1] },
      recent: { periodLabels: ["b"], sampleCount: 50, clusterCount: 18, meanNetAlphaBps: 90, clusteredTStats: [1.8] },
      deltaBps: -10,
      reasons: [],
      warnings: [],
    },
    holdout: { partitioned: true, openedWindowIds: ["vault"], accessRecorded: true },
    controls: { matched: 130, unmatchedTreatments: 0 },
    confounders: { excludedCount: 22, scanned: true },
    pit: { violations: 0, checked: true },
    paperTrades: {
      outcomes: [], intentCount: 20, filledCount: 20, unfilledCount: 0,
      openCount: 0, closedCount: 20, fillRate: 1,
      meanSlippageBps: -12, meanNetReturnBps: 40, warnings: [],
    },
    ...over,
  };
}

function testEmptyInputSupportsNothing() {
  const report = deriveGateEvidence({ edgeId: "e", requiredSamples: 120 });
  assert.equal(report.supportedCount, 0, "測っていないものを通さない");
  assert.equal(report.totalCount, GATE_KEYS.length);
  assert.ok(report.rows.every((row) => row.missing !== undefined), "全てに次の一手が付く");
}

function testAllGatesCanBeSupported() {
  const report = deriveGateEvidence(fullInput());
  const unmet = report.rows.filter((row) => !row.supported);
  assert.deepEqual(unmet.map((row) => row.gate), [], `未達: ${JSON.stringify(unmet)}`);
  assert.ok(
    report.warnings.some((one) => one.includes("自動昇格を意味しません")),
    "全部揃っても人間の判断であることを明示する",
  );
}

function testSamplesWithFewClustersDoNotPass() {
  const report = deriveGateEvidence(fullInput({
    eventStudy: eventStudyWith(130, 3) as never,
  }));
  const row = report.rows.find((one) => one.gate === "sufficientSamples")!;
  assert.equal(row.supported, false, "件数だけ足りていても実効的な観測が少なければ通さない");
  assert.ok(row.evidence.includes("クラスタ"));
  assert.ok(report.warnings.some((one) => one.includes("同日イベントが多く")));
}

function testNegativeNetAlphaSaysDoNotTuneThresholds() {
  const report = deriveGateEvidence(fullInput({
    backtest: { net: stats(-30, 130, 48), skippedReasons: {}, falseDiscoveryPassed: true, borrowCostIncluded: true },
  }));
  const row = report.rows.find((one) => one.gate === "netAlphaPositive")!;
  assert.equal(row.supported, false);
  assert.ok(row.missing?.includes("閾値をいじらず"), "閾値調整で通す道を示さない");
}

function testUnopenedHoldoutIsNotAPass() {
  const report = deriveGateEvidence(fullInput({
    holdout: { partitioned: true, openedWindowIds: [], accessRecorded: false },
  }));
  const row = report.rows.find((one) => one.gate === "holdoutPass")!;
  assert.equal(row.supported, false, "除外しただけでは Holdout PASS にならない");
  assert.ok(row.evidence.includes("未開封"));
}

function testUnrecordedHoldoutOpeningIsFlagged() {
  const report = deriveGateEvidence(fullInput({
    holdout: { partitioned: true, openedWindowIds: ["vault"], accessRecorded: false },
  }));
  assert.equal(report.rows.find((one) => one.gate === "holdoutPass")!.supported, false);
  assert.ok(report.warnings.some((one) => one.includes("記録の無い開封")));
}

function testInsufficientDecayDataIsNotAPass() {
  const report = deriveGateEvidence(fullInput({
    decay: { ...fullInput().decay!, verdict: "insufficient_data" },
  }));
  const row = report.rows.find((one) => one.gate === "decayChecked")!;
  assert.equal(row.supported, false, "判定できていないことを確認済みにしない");
  // 「判定できていない」と「劣化している」は違う。同じ文言で片付けない。
  assert.ok(
    row.evidence.includes("サンプル不足で判定できていません"),
    `判定不能であることが読み取れない: ${row.evidence}`,
  );
  assert.ok(row.missing?.includes("クラスタ数を増やす"), "次の一手が「原因を特定」ではなく増量であるべき");

  const weakened = deriveGateEvidence(fullInput({
    decay: { ...fullInput().decay!, verdict: "weakened" },
  })).rows.find((one) => one.gate === "decayChecked")!;
  assert.ok(weakened.evidence.includes("weakened"), "劣化は劣化として出す");
  assert.notEqual(
    weakened.evidence,
    row.evidence,
    "判定不能と劣化を同じ文言にしない",
  );
}

function testUnmatchedTreatmentsBlockCounterfactual() {
  const report = deriveGateEvidence(fullInput({
    controls: { matched: 100, unmatchedTreatments: 30 },
  }));
  const row = report.rows.find((one) => one.gate === "counterfactualExplained")!;
  assert.equal(row.supported, false);
  assert.ok(row.missing?.includes("残った分だけの比較は偏る"));
}

function testLowFillRateBlocksExecutionFeasible() {
  const report = deriveGateEvidence(fullInput({
    paperTrades: { ...fullInput().paperTrades!, fillRate: 0.6, filledCount: 12, unfilledCount: 8 },
  }));
  const row = report.rows.find((one) => one.gate === "executionFeasible")!;
  assert.equal(row.supported, false);
  assert.ok(report.warnings.some((one) => one.includes("全件約定を前提")));
}

function testNoPaperTradesMeansExecutionUnproven() {
  const report = deriveGateEvidence(fullInput({ paperTrades: undefined }));
  const row = report.rows.find((one) => one.gate === "executionFeasible")!;
  assert.equal(row.supported, false, "backtest 上通っただけでは執行可能とみなさない");
  assert.ok(row.missing?.includes("紙トレード"));
}

function testBorrowCostMustBeIncluded() {
  const report = deriveGateEvidence(fullInput({
    backtest: { ...fullInput().backtest!, borrowCostIncluded: false },
  }));
  assert.equal(report.rows.find((one) => one.gate === "borrowCostCovered")!.supported, false);
}

function testFalseDiscoveryFailureSaysDoNotLowerTheBar() {
  const report = deriveGateEvidence(fullInput({
    backtest: { ...fullInput().backtest!, falseDiscoveryPassed: false },
  }));
  const row = report.rows.find((one) => one.gate === "falseDiscoveryGuard")!;
  assert.ok(row.missing?.includes("閾値を緩めることで通してはいけない"));
}

function testFormatShowsMissingSteps() {
  const text = formatGateEvidence(deriveGateEvidence({ edgeId: "e", requiredSamples: 120 }));
  assert.ok(text.includes("裏付けのある Gate 0/11"));
  assert.ok(text.includes("❌"));
  assert.ok(text.includes("→ "), "次の一手を出す");
}

function testInvalidInputFailsClosed() {
  assert.throws(() => deriveGateEvidence({ edgeId: "", requiredSamples: 1 }), /edgeId/);
  assert.throws(() => deriveGateEvidence({ edgeId: "e", requiredSamples: 0 }), /requiredSamples/);
  assert.throws(
    () => deriveGateEvidence({ edgeId: "e", requiredSamples: 1, minClusters: 0 }),
    /minClusters/,
  );
}

testEmptyInputSupportsNothing();
testAllGatesCanBeSupported();
testSamplesWithFewClustersDoNotPass();
testNegativeNetAlphaSaysDoNotTuneThresholds();
testUnopenedHoldoutIsNotAPass();
testUnrecordedHoldoutOpeningIsFlagged();
testInsufficientDecayDataIsNotAPass();
testUnmatchedTreatmentsBlockCounterfactual();
testLowFillRateBlocksExecutionFeasible();
testNoPaperTradesMeansExecutionUnproven();
testBorrowCostMustBeIncluded();
testFalseDiscoveryFailureSaysDoNotLowerTheBar();
testFormatShowsMissingSteps();
testInvalidInputFailsClosed();

console.log("research/gate-evidence: 全テスト成功");
