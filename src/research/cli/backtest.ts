// Research OS — Backtest 実行 CLI。
//
//   pnpm research:backtest --bundle=research/fixtures/backtests/<name>.json
//   pnpm research:backtest --bundle=... --out=research/reports/xxx.generated.json
//
// bundle は { spec, signals, prices, benchmark? } を1ファイルにまとめたもの。
// 価格を外部から取りに行かないため、実行は決定論的で CI でも安全に回せる。

import { existsSync, readFileSync } from "fs";
import { runBacktest, type BacktestSignal, type BacktestSpec, type PriceSeries } from "../backtest.js";
import { loadSchema, writeGeneratedJson } from "../io.js";
import { falseDiscoveryGuard } from "../net-alpha.js";
import { formatErrors, validate } from "../schema.js";
import { fail, parseArgs } from "./common.js";

interface Bundle {
  spec: BacktestSpec;
  signals: BacktestSignal[];
  prices: PriceSeries[];
  benchmark?: PriceSeries;
  /** これまでに試した仮説の数。False Discovery Guard の閾値に使う。 */
  trials?: number;
}

function bps(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}bps`;
}

function main(): void {
  const { options } = parseArgs();
  const bundlePath = options.get("bundle");
  if (!bundlePath) fail("--bundle=<file.json> を指定してください");
  if (!existsSync(bundlePath)) fail(`ファイルがありません: ${bundlePath}`);

  const bundle = JSON.parse(readFileSync(bundlePath, "utf-8")) as Bundle;
  const errors = validate(bundle.spec, loadSchema("backtest"));
  if (errors.length > 0) fail(`spec がスキーマに適合しません:\n${formatErrors(errors)}`);

  const prices = new Map(bundle.prices.map((series) => [series.code, series]));
  const report = runBacktest(bundle.spec, bundle.signals, prices, bundle.benchmark);
  const guard = falseDiscoveryGuard(report.net.tStat, bundle.trials ?? 1);

  console.log(`Backtest: ${report.specId} (edge=${report.edgeId}, side=${report.side})`);
  console.log(`  シグナル ${report.signalCount} 件 / 執行できた ${report.executedCount} 件`);
  for (const skip of report.skipped) console.log(`  skip: ${skip.signalId} — ${skip.reason}`);
  console.log(`  Gross Alpha 平均: ${bps(report.gross.meanNetAlphaBps)}`);
  console.log(`  Net   Alpha 平均: ${bps(report.net.meanNetAlphaBps)} / 中央値 ${bps(report.net.medianNetAlphaBps)}`);
  console.log(`  勝率: ${(report.net.hitRate * 100).toFixed(1)}% / t = ${report.net.tStat?.toFixed(2) ?? "n/a"}`);
  console.log(`  False Discovery Guard: ${guard.passed ? "PASS" : "FAIL"} — ${guard.reason}`);

  const out = options.get("out");
  if (out) {
    writeGeneratedJson(out, { ...report, falseDiscoveryGuard: guard, trials: bundle.trials ?? 1 });
    console.log(`✓ ${out} に保存しました`);
  }

  if (report.executedCount === 0) {
    fail("執行できた取引が 0 件です。Net Alpha は評価できません。");
  }
}

main();
