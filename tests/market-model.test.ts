// 市場モデル推定のテスト。
//
// なぜ要るか（実測 2026-09-11、44営業日 / 閾値 -8%）:
//   2024-08-05  候補 553件  benchmark -10.82%   ← 全候補の38%
//   2024-08-06  候補 168件  benchmark  +6.04%
//   上位3日で797件 = 全体の55%
//   → `r_i - r_m`（β=1仮定）は市場の急変日に高β銘柄を大量に拾う。
//
// 守りたい性質:
//   1. 既知の α・β を持つ系列から、その α・β を復元できる
//   2. 推定期間に事件日を含めない（含めるとβが汚れ、異常収益が小さく出る）
//   3. 銘柄と benchmark は**日付で**突き合わせる（添字だと片方の休みでずれる）
//   4. 観測が足りなければ推定しない（fail closed）

import assert from "node:assert/strict";
import {
  DEFAULT_MARKET_MODEL_PARAMS,
  estimateMarketModel,
  marketModelAbnormalReturnPct,
  standardizedAbnormalReturn,
  type MarketModelParams,
} from "../src/research/signals/market-model.js";
import type { PriceSeries } from "../src/research/backtest.js";

const PARAMS: MarketModelParams = {
  estimationBars: 100,
  gapBars: 0,
  minObservations: 30,
  maxPriorGapDays: 10,
};

function isoDate(dayOffset: number): string {
  // 2024-01-01 起点。休日は考えない（暦日で連続させる）。
  return new Date(Date.UTC(2024, 0, 1 + dayOffset)).toISOString().slice(0, 10);
}

/**
 * 既知の α・β から系列を組む。
 * benchmark のリターンを決め打ちし、r_i = α + β·r_m を満たす終値を作る。
 */
function buildSeries(input: {
  benchmarkReturnsPct: number[];
  alpha: number;
  beta: number;
  /** t 番目のリターンに足すノイズ（%）。 */
  noisePct?: number[];
}): { security: PriceSeries; benchmarkCloseByDate: Map<string, number> } {
  const benchmarkCloseByDate = new Map<string, number>();
  const bars: PriceSeries["bars"] = [];
  let securityClose = 1000;
  let benchmarkClose = 2000;

  bars.push({ date: isoDate(0), open: securityClose, high: securityClose, low: securityClose, close: securityClose, volume: 1000 });
  benchmarkCloseByDate.set(isoDate(0), benchmarkClose);

  for (const [index, benchmarkReturnPct] of input.benchmarkReturnsPct.entries()) {
    benchmarkClose *= 1 + benchmarkReturnPct / 100;
    const securityReturnPct = input.alpha + input.beta * benchmarkReturnPct + (input.noisePct?.[index] ?? 0);
    securityClose *= 1 + securityReturnPct / 100;
    const date = isoDate(index + 1);
    benchmarkCloseByDate.set(date, benchmarkClose);
    bars.push({ date, open: securityClose, high: securityClose, low: securityClose, close: securityClose, volume: 1000 });
  }
  return { security: { code: "99990", bars }, benchmarkCloseByDate };
}

/** ±で振れる決定的な benchmark リターン列。分散を持たせる。 */
function benchmarkReturns(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index % 2 === 0 ? 1 : -1) * (1 + (index % 5) * 0.4));
}

function testRecoversKnownAlphaAndBeta(): void {
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(80), alpha: 0.05, beta: 1.6,
  });
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(estimate.ok, JSON.stringify(estimate));
  // 複利で組んだので厳密には一致しないが、桁と符号は復元されること。
  assert.ok(Math.abs(estimate.fit.beta - 1.6) < 0.05, `beta=${estimate.fit.beta}`);
  assert.ok(Math.abs(estimate.fit.alpha - 0.05) < 0.05, `alpha=${estimate.fit.alpha}`);
  assert.ok(estimate.fit.residualStdPct < 0.05, `残差σ=${estimate.fit.residualStdPct}`);
  assert.equal(estimate.fit.observations, 79);
  assert.ok(
    estimate.fit.toDate < security.bars[security.bars.length - 1]!.date,
    "gapBars=0 でも事件日そのものは推定期間に入らない",
  );
}

function testHighBetaCrashIsNotAbnormal(): void {
  // 実測で踏んだ問題そのもの。β=1.5 の銘柄が市場 -10.8% の日に -16.2% 下げる。
  // 素朴な差し引きだと -5.4% の「異常」が残るが、市場モデルではほぼ 0。
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(80), alpha: 0, beta: 1.5,
  });
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(estimate.ok);

  const crashBenchmarkPct = -10.8;
  const crashSecurityPct = 1.5 * crashBenchmarkPct;
  const naive = crashSecurityPct - crashBenchmarkPct;
  const modelled = marketModelAbnormalReturnPct(estimate.fit, crashSecurityPct, crashBenchmarkPct);

  assert.ok(naive < -5, `素朴な差し引きは異常に見える: ${naive.toFixed(1)}%`);
  assert.ok(Math.abs(modelled) < 0.5, `市場モデルなら異常ではない: ${modelled.toFixed(2)}%`);
}

function testIdiosyncraticDropIsStillAbnormal(): void {
  // 逆方向。市場が動いていない日の個別下落は、ちゃんと異常として残ること。
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(80), alpha: 0, beta: 1.5,
  });
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(estimate.ok);
  const modelled = marketModelAbnormalReturnPct(estimate.fit, -20, 0.2);
  assert.ok(modelled < -19, `個別要因は残るべき: ${modelled.toFixed(1)}%`);
}

function testEstimationWindowExcludesTheEventItself(): void {
  // 事件日を推定に含めるとβが汚れ、異常収益が小さく出る。
  // gapBars で事件前の助走も外せること。
  const returns = benchmarkReturns(80);
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: returns, alpha: 0, beta: 1.0,
    // 末尾5本に大きな個別下落を入れる（事件と助走）。
    noisePct: returns.map((_, index) => (index >= returns.length - 5 ? -12 : 0)),
  });
  const eventIndex = security.bars.length - 1;

  const contaminated = estimateMarketModel(security, benchmarkCloseByDate, eventIndex, PARAMS);
  const clean = estimateMarketModel(security, benchmarkCloseByDate, eventIndex, { ...PARAMS, gapBars: 5 });
  assert.ok(contaminated.ok && clean.ok);

  assert.ok(
    clean.fit.residualStdPct < contaminated.fit.residualStdPct,
    `gap を空けたほうが残差σは小さいはず: clean=${clean.fit.residualStdPct} contaminated=${contaminated.fit.residualStdPct}`,
  );
  assert.ok(clean.fit.toDate < security.bars[eventIndex]!.date, "推定期間は事件日より前で終わる");
}

function testAlignsByDateNotByIndex(): void {
  // benchmark に休みがある日を作る。添字で合わせていると全期間がずれ、
  // β が意味の無い値になる。
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(80), alpha: 0, beta: 1.4,
  });
  const holidays = [security.bars[10]!.date, security.bars[11]!.date, security.bars[40]!.date];
  for (const date of holidays) benchmarkCloseByDate.delete(date);

  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(estimate.ok);
  assert.ok(Math.abs(estimate.fit.beta - 1.4) < 0.05, `beta=${estimate.fit.beta}`);
  // 欠測日にかかるリターンは落ちる（休日そのものと翌日の2本）。
  assert.ok(estimate.fit.observations < 79, "欠測日を含むリターンは推定に使わない");
}

/** テスト側で独立に OLS を解く。実装の式（特に自由度）を突き合わせるため。 */
function independentOls(security: PriceSeries, benchmarkCloseByDate: Map<string, number>, endIndex: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 1; index <= endIndex; index += 1) {
    const bar = security.bars[index]!;
    const prior = security.bars[index - 1]!;
    const bench = benchmarkCloseByDate.get(bar.date);
    const benchPrior = benchmarkCloseByDate.get(prior.date);
    if (bench === undefined || benchPrior === undefined) continue;
    xs.push((bench - benchPrior) / benchPrior * 100);
    ys.push((bar.close - prior.close) / prior.close * 100);
  }
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0; let varX = 0;
  for (let i = 0; i < n; i += 1) { cov += (xs[i]! - meanX) * (ys[i]! - meanY); varX += (xs[i]! - meanX) ** 2; }
  const beta = cov / varX;
  const alpha = meanY - beta * meanX;
  let sse = 0;
  for (let i = 0; i < n; i += 1) sse += (ys[i]! - alpha - beta * xs[i]!) ** 2;
  // 自由度は n-2。α と β の2つを推定に使っている。
  return { alpha, beta, residualStdPct: Math.sqrt(sse / (n - 2)), observations: n };
}

function testResidualStdUsesTwoDegreesOfFreedom(): void {
  // ノイズのある系列で、実装の残差σがテスト側の独立計算と一致すること。
  // n で割ると 79/77 のぶんだけ小さく出て、標準化 AR が過大になる。
  const returns = benchmarkReturns(80);
  const noise = returns.map((_, index) => (index % 3 === 0 ? 1.7 : index % 3 === 1 ? -2.3 : 0.6));
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: returns, alpha: 0.02, beta: 1.3, noisePct: noise,
  });
  const eventIndex = security.bars.length - 1;
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, eventIndex, PARAMS);
  assert.ok(estimate.ok);

  const expected = independentOls(security, benchmarkCloseByDate, eventIndex - 1);
  assert.equal(estimate.fit.observations, expected.observations);
  assert.ok(Math.abs(estimate.fit.beta - expected.beta) < 1e-9, "β が独立計算と一致");
  assert.ok(Math.abs(estimate.fit.alpha - expected.alpha) < 1e-9, "α が独立計算と一致");
  assert.ok(
    Math.abs(estimate.fit.residualStdPct - expected.residualStdPct) < 1e-9,
    `残差σが独立計算と一致しない: ${estimate.fit.residualStdPct} vs ${expected.residualStdPct}`,
  );
  assert.ok(estimate.fit.residualStdPct > 0.5, "テスト前提: ノイズが載っている");
}

/** 日付とリターンを明示して系列を組む。停止など不連続を作りたいとき用。 */
function buildFromDatedReturns(
  rows: readonly { date: string; securityPct: number; benchmarkPct: number }[],
): { security: PriceSeries; benchmarkCloseByDate: Map<string, number> } {
  const benchmarkCloseByDate = new Map<string, number>();
  const bars: PriceSeries["bars"] = [];
  let securityClose = 1000;
  let benchmarkClose = 2000;
  bars.push({ date: "2023-12-31", open: securityClose, high: securityClose, low: securityClose, close: securityClose, volume: 1000 });
  benchmarkCloseByDate.set("2023-12-31", benchmarkClose);
  for (const row of rows) {
    securityClose *= 1 + row.securityPct / 100;
    benchmarkClose *= 1 + row.benchmarkPct / 100;
    benchmarkCloseByDate.set(row.date, benchmarkClose);
    bars.push({ date: row.date, open: securityClose, high: securityClose, low: securityClose, close: securityClose, volume: 1000 });
  }
  return { security: { code: "99990", bars }, benchmarkCloseByDate };
}

function testSuspensionGapsAreExcludedFromEstimation(): void {
  // 売買停止明けの「1日の値動き」は、実際には数週間ぶんの値動き。
  // これを推定に混ぜると残差σが跳ね上がり、本物の異常が σ に隠れる。
  const benchmark = benchmarkReturns(80);
  const rows: { date: string; securityPct: number; benchmarkPct: number }[] = [];
  let dayOffset = 0;
  for (const [index, benchmarkPct] of benchmark.entries()) {
    // 30本目のあとに30日の空白（売買停止）。明けの1本で -40%。
    if (index === 31) dayOffset += 30;
    dayOffset += 1;
    rows.push({
      date: isoDate(dayOffset),
      securityPct: index === 31 ? -40 : 1.2 * benchmarkPct,
      benchmarkPct,
    });
  }

  const { security, benchmarkCloseByDate } = buildFromDatedReturns(rows);
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(estimate.ok, JSON.stringify(estimate));

  assert.ok(
    estimate.fit.residualStdPct < 1,
    `停止明けの1本を混ぜると残差σが跳ねる: ${estimate.fit.residualStdPct}`,
  );
  assert.ok(Math.abs(estimate.fit.beta - 1.2) < 0.05, `β=${estimate.fit.beta}`);
  assert.equal(estimate.fit.observations, 78, "停止をまたぐリターン1本だけ除かれる");
}

function testEstimationWindowLengthIsRespected(): void {
  // 履歴が窓より長いとき、窓の本数ちょうどを使うこと。
  // ここが1本ずれると、古いレジームを引きずるか直近を落とすかになる。
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(200), alpha: 0, beta: 1.1,
  });
  const eventIndex = security.bars.length - 1;
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, eventIndex, {
    ...PARAMS, estimationBars: 50, minObservations: 30,
  });
  assert.ok(estimate.ok);
  assert.equal(estimate.fit.observations, 50, "窓の本数ちょうど");
  // 直近から数えた50本。事件日そのものは含まない。
  assert.equal(estimate.fit.toDate, security.bars[eventIndex - 1]!.date);
  assert.equal(estimate.fit.fromDate, security.bars[eventIndex - 50]!.date);

  const withGap = estimateMarketModel(security, benchmarkCloseByDate, eventIndex, {
    ...PARAMS, estimationBars: 50, minObservations: 30, gapBars: 10,
  });
  assert.ok(withGap.ok);
  assert.equal(withGap.fit.observations, 50);
  assert.equal(withGap.fit.toDate, security.bars[eventIndex - 11]!.date, "gap のぶん手前で終わる");
}

function testInsufficientObservationsFailsClosed(): void {
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(10), alpha: 0, beta: 1,
  });
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(!estimate.ok);
  assert.equal(estimate.reason, "insufficient_observations");
}

function testEstimationWindowBeforeHistoryFailsClosed(): void {
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: benchmarkReturns(80), alpha: 0, beta: 1,
  });
  // gap を空けると推定期間が履歴の手前に出る。
  assert.deepEqual(
    estimateMarketModel(security, benchmarkCloseByDate, 5, { ...PARAMS, gapBars: 5 }),
    { ok: false, reason: "estimation_window_before_history" },
  );
  // 事件日そのものを外すぶんの1本も足りない。
  assert.deepEqual(
    estimateMarketModel(security, benchmarkCloseByDate, 1, { ...PARAMS, gapBars: 0 }),
    { ok: false, reason: "estimation_window_before_history" },
  );
}

function testFlatBenchmarkFailsClosed(): void {
  // benchmark が全く動かない期間では β を推定できない。0 で割らない。
  const { security, benchmarkCloseByDate } = buildSeries({
    benchmarkReturnsPct: Array.from({ length: 80 }, () => 0), alpha: 0.1, beta: 1,
  });
  const estimate = estimateMarketModel(security, benchmarkCloseByDate, security.bars.length - 1, PARAMS);
  assert.ok(!estimate.ok);
  assert.equal(estimate.reason, "benchmark_has_no_variance");
}

function testStandardizedReturnHandlesZeroSigma(): void {
  const fit = { alpha: 0, beta: 1, residualStdPct: 0, observations: 60, fromDate: "2024-01-01", toDate: "2024-06-01" };
  assert.equal(standardizedAbnormalReturn(fit, -10), null, "σ=0 を無限に異常と読ませない");
  assert.equal(standardizedAbnormalReturn({ ...fit, residualStdPct: 2 }, -6), -3);
}

function testParamsValidation(): void {
  const bad = (patch: Partial<MarketModelParams>) =>
    () => estimateMarketModel({ code: "1", bars: [] }, new Map(), 0, { ...PARAMS, ...patch });
  assert.throws(bad({ estimationBars: 0 }), /estimationBars/);
  assert.throws(bad({ gapBars: -1 }), /gapBars/);
  assert.throws(bad({ minObservations: 2 }), /at least 3/);
  assert.throws(bad({ minObservations: 200 }), /cannot exceed/);
}

function testDefaultsFollowEventStudyConvention(): void {
  // 慣行（Brown & Warner 系）の120本前後。推定に事件日を含めない gap も持つ。
  assert.equal(DEFAULT_MARKET_MODEL_PARAMS.estimationBars, 120);
  assert.ok(DEFAULT_MARKET_MODEL_PARAMS.gapBars > 0, "事件前の助走を推定から外す");
  assert.ok(DEFAULT_MARKET_MODEL_PARAMS.minObservations >= 3);
}

testRecoversKnownAlphaAndBeta();
testHighBetaCrashIsNotAbnormal();
testIdiosyncraticDropIsStillAbnormal();
testEstimationWindowExcludesTheEventItself();
testAlignsByDateNotByIndex();
testResidualStdUsesTwoDegreesOfFreedom();
testSuspensionGapsAreExcludedFromEstimation();
testEstimationWindowLengthIsRespected();
testInsufficientObservationsFailsClosed();
testEstimationWindowBeforeHistoryFailsClosed();
testFlatBenchmarkFailsClosed();
testStandardizedReturnHandlesZeroSigma();
testParamsValidation();
testDefaultsFollowEventStudyConvention();

console.log("market-model: 全テスト成功");
