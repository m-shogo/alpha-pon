// Research OS — Backtest 実行 CLI。
//
//   pnpm research:backtest --bundle=... --intent="閾値 -7% の初回検証"
//   pnpm research:backtest --bundle=... --out=research/reports/xxx.generated.json
//   pnpm research:backtest --bundle=... --no-trial-ledger   （fixture / CI 用）
//
//   実データで走らせる（価格とシグナルを bundle に埋めず、取り込み済み
//   ストアから読み、bundle の detector で候補を作る）:
//   pnpm research:backtest --bundle=... --from-store --from=... --to=... \
//     --min-turnover-jpy=500000000 --intent="..."
//
// bundle は { spec, signals, prices, benchmark? } を1ファイルにまとめたもの。
// 価格を外部から取りに行かないため、実行は決定論的で CI でも安全に回せる。
//
// 試行回数は既定で research/trials.jsonl から自動算出する。
// 自己申告の bundle.trials は --no-trial-ledger のときだけ使う。
// 閾値を変えて再実行すれば試行回数が増え、要求 t 値が自動的に上がる。

import { existsSync, readFileSync } from "fs";
import { resolve } from "node:path";
import { isCanonicalReadOnlyJsonFile } from "../../read-only-json-file.js";
import { buildUniquePriceSeriesMap } from "../backtest-bundle-input.js";
import { runBacktest, type BacktestSignal, type BacktestSpec, type PriceSeries } from "../backtest.js";
import { loadSchema, writeGeneratedJson } from "../io.js";
import { afterTaxMeanBps, falseDiscoveryGuard, JP_CAPITAL_GAINS_TAX_RATE } from "../net-alpha.js";
import { formatErrors, validate } from "../schema.js";
import {
  computeDatasetFingerprint,
  DEFAULT_TRIALS_LEDGER_PATH,
  recordTrialOutcome,
  registerTrial,
} from "../trials-ledger.js";
import {
  detectAbnormalMoveEvents,
  type AbnormalMoveParams,
} from "../signals/abnormal-move-events.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadStudyInputsFromStore,
} from "../study-inputs-from-store.js";
import { fail, parseArgs } from "./common.js";

interface Bundle {
  spec: BacktestSpec;
  /** `--from-store` を使うときは省略し、`detector` から生成する。 */
  signals?: BacktestSignal[];
  /** `--from-store` を使うときは省略する。 */
  prices?: PriceSeries[];
  benchmark?: PriceSeries;
  /**
   * `--from-store` のとき、シグナルをここから作る。
   *
   * シグナルを別ファイルに書き出して受け渡す形にすると、検出パラメータを
   * 変えたときに古いシグナルで backtest を回せてしまう。同じ bundle に
   * 置いて同じ実行で作る。
   */
  detector?: {
    kind: "abnormal_move";
    params: Omit<AbnormalMoveParams, "knownEventDates" | "corporateActionDates">
      & { knownEventDates?: Record<string, string[]> };
  };
  /** これまでに試した仮説の数。False Discovery Guard の閾値に使う。 */
  trials?: number;
}


function numberOption(options: Map<string, string>, name: string, fallback: number): number {
  const raw = options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`--${name} は数値で指定してください: ${raw}`);
  return value;
}

/**
 * 取り込み済みの価格ストアからシグナルと価格を作る。
 *
 * 材料（流動性の足切り・ユニバース benchmark・権利落ち台帳）は
 * `study-inputs-from-store.ts` に集約している。edge-study と同じものを
 * 同じ作り方で使わないと、「イベントスタディでは出たのに backtest では
 * 出ない」の原因が分からなくなる。
 */
function loadFromStore(
  bundle: Bundle,
  options: Map<string, string>,
): { signals: BacktestSignal[]; prices: PriceSeries[]; benchmark: PriceSeries } {
  if (bundle.detector?.kind !== "abnormal_move") {
    fail("--from-store には bundle.detector.kind = \"abnormal_move\" が必要です");
  }
  const minTurnoverJpy = numberOption(options, "min-turnover-jpy", 0);
  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(options.get("from") ? { from: options.get("from")! } : {}),
      ...(options.get("to") ? { to: options.get("to")! } : {}),
      minTurnoverJpy,
    });
  } catch (error) {
    if (error instanceof StudyInputsError) fail(error.message);
    throw error;
  }

  const detected = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
    ...bundle.detector.params,
    knownEventDates: new Map(
      Object.entries(bundle.detector.params.knownEventDates ?? {})
        .map(([code, dates]) => [code, new Set(dates)]),
    ),
    corporateActionDates: inputs.corporateActionDates,
  });

  const rejectSummary = Object.entries(detected.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");

  for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);
  console.log(`検出  : 評価 ${detected.evaluatedCount} → シグナル ${detected.candidates.length}`);
  if (rejectSummary) console.log(`却下  : ${rejectSummary}`);
  const unavailable = detected.rejectedCounts.market_model_unavailable;
  if (unavailable > detected.evaluatedCount * 0.5) {
    console.log(
      `⚠ 評価の ${(unavailable / detected.evaluatedCount * 100).toFixed(0)}% で市場モデルを推定できていません。`
      + "シグナルの少なさを結論にしないでください",
    );
  }
  console.log("");

  // observedAt は反応日の引け。entry.mode = next_open なら翌営業日の始値で建つ。
  const signals: BacktestSignal[] = detected.candidates.map((candidate) => ({
    id: candidate.candidateId,
    code: candidate.code,
    observedAt: candidate.observedAt,
  }));

  return { signals, prices: inputs.prices, benchmark: inputs.benchmark };
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

  const fromStore = flags.has("from-store") ? loadFromStore(bundle, options) : null;
  const signalList = fromStore ? fromStore.signals : bundle.signals;
  const priceList = fromStore ? fromStore.prices : bundle.prices;
  const benchmarkSeries = fromStore ? fromStore.benchmark : bundle.benchmark;
  if (!signalList || !priceList) {
    fail("signals / prices がありません。bundle に入れるか --from-store を指定してください");
  }
  if (signalList!.length === 0) {
    fail("シグナルが0件です。backtest を実行できません");
  }

  const prices = buildUniquePriceSeriesMap(priceList!);
  const report = runBacktest(bundle.spec, signalList!, prices, benchmarkSeries);
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
          // 走らせた実際の母集団で指紋を取る。bundle 側を見ると
          // --from-store のとき「シグナルが無い」ことになって指紋が縮退する。
          signalIds: signalList!.map((signal) => signal.id),
          priceCodes: priceList!.map((series) => series.code),
          benchmarkCode: benchmarkSeries?.code,
          asOf: signalList!.map((signal) => signal.observedAt).sort().at(-1) ?? "",
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
  console.log(
    `  税引後 平均: ${bps(afterTaxMeanBps(report.net.meanNetAlphaBps))}`
    + ` (譲渡益課税 ${(JP_CAPITAL_GAINS_TAX_RATE * 100).toFixed(3)}% を平均が正の場合のみ控除した近似)`,
  );
  console.log(`  勝率: ${(report.net.hitRate * 100).toFixed(1)}%`);
  // クラスタ平均を必ず併記する。これを出さないと
  // 「1件平均はプラスなのに t が負」が矛盾に見える（実測で起きた）。
  console.log(
    `  クラスタ平均: ${report.net.clusteredMeanNetAlphaBps === null ? "n/a" : bps(report.net.clusteredMeanNetAlphaBps)}`
    + `（イベント日を等加重。下の t が検定しているのはこの値）`,
  );
  console.log(
    `  t = ${report.net.clusteredTStat?.toFixed(2) ?? "n/a"} (クラスタ補正後 / ${report.net.clusterCount ?? 0}イベント日)`
    + ` ← 判定に使う値`,
  );
  console.log(
    `  t = ${report.net.tStat?.toFixed(2) ?? "n/a"} (未補正 / ${report.net.count}件)`
    + ` ← 同日の相関を無視した参考値。判定には使わない`,
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
      new Date(),
      // 測定のコードを直して測り直したときだけ、理由つきで置き換える。
      // 省略すると「同じ試行で違う結果」は落ちる（非決定性の検出）。
      { ...(options.get("supersede") ? { supersedesReason: options.get("supersede")! } : {}) },
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
