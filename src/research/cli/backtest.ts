// Research OS — Backtest 実行 CLI。
//
//   pnpm research:backtest --bundle=... --intent="閾値 -7% の初回検証"
//   pnpm research:backtest --bundle=... --out=research/reports/xxx.generated.json
//   pnpm research:backtest --bundle=... --no-trial-ledger   （fixture / CI 用）
//
// bundle は { spec, signals, prices, benchmark? } を1ファイルにまとめたもの。
// 価格を外部から取りに行かないため、実行は決定論的で CI でも安全に回せる。
//
// 試行回数は既定で research/trials.jsonl から自動算出する。
// 自己申告の bundle.trials は --no-trial-ledger のときだけ使う。
// 閾値を変えて再実行すれば試行回数が増え、要求 t 値が自動的に上がる。

import { existsSync, readFileSync } from "fs";
import { isCanonicalReadOnlyJsonFile } from "../../read-only-json-file.js";
import { buildUniquePriceSeriesMap } from "../backtest-bundle-input.js";
import { runBacktest, type BacktestSignal, type BacktestSpec, type PriceSeries } from "../backtest.js";
import { loadSchema, writeGeneratedJson } from "../io.js";
import { falseDiscoveryGuard } from "../net-alpha.js";
import { formatErrors, validate } from "../schema.js";
import {
  computeDatasetFingerprint,
  DEFAULT_TRIALS_LEDGER_PATH,
  recordTrialOutcome,
  registerTrial,
} from "../trials-ledger.js";
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

/** 実験を定義するパラメータ。id / notes は表示上の違いなので試行の同一性から外す。 */
function experimentParams(spec: BacktestSpec): Record<string, unknown> {
  return {
    side: spec.side,
    notionalJpy: spec.notionalJpy,
    entry: spec.entry,
    exit: spec.exit,
    costs: spec.costs,
    liquidity: spec.liquidity,
    benchmark: spec.benchmark ?? null,
  };
}

function main(): void {
  const { flags, options } = parseArgs();
  const bundlePath = options.get("bundle");
  if (!bundlePath) fail("--bundle=<file.json> を指定してください");
  if (!existsSync(bundlePath)) fail(`ファイルがありません: ${bundlePath}`);
  if (!isCanonicalReadOnlyJsonFile(bundlePath)) {
    fail(`backtest bundle must be a standalone regular file: ${bundlePath}`);
  }

  const bundle = JSON.parse(readFileSync(bundlePath, "utf-8")) as Bundle;
  const errors = validate(bundle.spec, loadSchema("backtest"));
  if (errors.length > 0) fail(`spec がスキーマに適合しません:\n${formatErrors(errors)}`);

  const prices = buildUniquePriceSeriesMap(bundle.prices);
  const report = runBacktest(bundle.spec, bundle.signals, prices, bundle.benchmark);
  const useLedger = !flags.has("no-trial-ledger");
  let trials = bundle.trials ?? 1;
  let trialId: string | null = null;
  let trialSource = "bundle.trials（自己申告）";

  if (useLedger) {
    const intent = options.get("intent")?.trim();
    if (!intent) {
      fail('--intent="この試行で何を確かめるか" を指定してください（--no-trial-ledger で省略可）');
    }
    const ledgerPath = options.get("trials-ledger") ?? DEFAULT_TRIALS_LEDGER_PATH;
    const registered = registerTrial(
      {
        edgeId: bundle.spec.edgeId,
        specId: bundle.spec.id,
        params: experimentParams(bundle.spec),
        datasetFingerprint: computeDatasetFingerprint({
          signalIds: bundle.signals.map((signal) => signal.id),
          priceCodes: bundle.prices.map((series) => series.code),
          benchmarkCode: bundle.benchmark?.code,
          asOf: bundle.signals.map((signal) => signal.observedAt).sort().at(-1) ?? "",
        }),
        intent: intent!,
      },
      ledgerPath,
    );
    trials = registered.trialCount;
    trialId = registered.trialId;
    trialSource = `${ledgerPath}（${registered.isNew ? "新規試行" : "既存試行の再実行"}）`;
  }

  // 判定はクラスタ補正後の t で行う。未補正 t は参考表示のみ。
  const guard = falseDiscoveryGuard(report.net.clusteredTStat, trials);

  console.log(`Backtest: ${report.specId} (edge=${report.edgeId}, side=${report.side})`);
  console.log(`  シグナル ${report.signalCount} 件 / 執行できた ${report.executedCount} 件`);
  for (const skip of report.skipped) console.log(`  skip: ${skip.signalId} — ${skip.reason}`);
  console.log(`  Gross Alpha 平均: ${bps(report.gross.meanNetAlphaBps)}`);
  console.log(`  Net   Alpha 平均: ${bps(report.net.meanNetAlphaBps)} / 中央値 ${bps(report.net.medianNetAlphaBps)}`);
  console.log(`  勝率: ${(report.net.hitRate * 100).toFixed(1)}%`);
  console.log(
    `  t = ${report.net.clusteredTStat?.toFixed(2) ?? "n/a"} (クラスタ補正後 / ${report.net.clusterCount ?? 0}イベント日)`
    + ` ← 判定に使う値`,
  );
  console.log(
    `  t = ${report.net.tStat?.toFixed(2) ?? "n/a"} (未補正 / ${report.net.count}件)`
    + ` ← 同日の相関を無視した参考値。必ずこちらの方が大きく出る`,
  );
  const sign = report.net.meanNetAlphaBps >= 0 ? "" : "（負に有意）";
  console.log(`  試行回数: ${trials} — ${trialSource}`);
  console.log(`  False Discovery Guard: ${guard.passed ? `PASS${sign}` : "FAIL"} — ${guard.reason}`);

  if (trialId) {
    const ledgerPath = options.get("trials-ledger") ?? DEFAULT_TRIALS_LEDGER_PATH;
    recordTrialOutcome(
      trialId,
      {
        executedCount: report.executedCount,
        meanNetAlphaBps: report.net.meanNetAlphaBps,
        tStat: report.net.tStat,
        clusteredTStat: report.net.clusteredTStat,
        clusterCount: report.net.clusterCount,
      },
      ledgerPath,
    );
  }

  const out = options.get("out");
  if (out) {
    writeGeneratedJson(out, { ...report, falseDiscoveryGuard: guard, trials, trialId });
    console.log(`✓ ${out} に保存しました`);
  }

  if (report.executedCount === 0) {
    fail("執行できた取引が 0 件です。Net Alpha は評価できません。");
  }
}

main();
