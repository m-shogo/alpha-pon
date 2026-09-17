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
import { isCanonicalReadOnlyJsonFile } from "../../read-only-json-file.js";
import { buildUniquePriceSeriesMap } from "../backtest-bundle-input.js";
import {
  applyLendableFilter,
  buildFromStore,
  StoreRunError,
  type BacktestStoreBundle,
  type StoreRunResult,
} from "../backtest-store-run.js";
import { runBacktest, type BacktestSpec } from "../backtest.js";
import { loadSchema, writeGeneratedJson } from "../io.js";
import { afterTaxMeanBps, falseDiscoveryGuard, JP_CAPITAL_GAINS_TAX_RATE } from "../net-alpha.js";
import { formatErrors, validate } from "../schema.js";
import {
  computeDatasetFingerprint,
  DEFAULT_TRIALS_LEDGER_PATH,
  recordTrialOutcome,
  registerTrial,
} from "../trials-ledger.js";
import { resolveResearchTo } from "../study-inputs-from-store.js";
import { fail, parseArgs } from "./common.js";

type Bundle = BacktestStoreBundle;

function numberOption(options: Map<string, string>, name: string, fallback: number): number {
  const raw = options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`--${name} は数値で指定してください: ${raw}`);
  return value;
}

/**
 * 研究期間（封印の前日まで）の入力を保存庫から作る。作り方は backtest-store-run.ts。
 */
function loadFromStore(
  bundle: Bundle,
  options: Map<string, string>,
  flags: ReadonlySet<string>,
): StoreRunResult {
  // 封印は CLI ごとに書かない。書き忘れた CLI だけが覗くことになる。
  const research = resolveResearchTo(options.get("to") ?? null);
  if (research.violation) fail(research.violation);
  const to = research.to;
  if (to !== null) {
    console.log(
      options.get("to")
        ? `期間  : 〜 ${to}（明示指定）`
        : `期間  : 〜 ${to}（封印 ${research.sealed!.windowId} の前日まで）`,
    );
  }
  try {
    return buildFromStore(bundle, {
      ...(options.get("from") ? { from: options.get("from")! } : {}),
      to,
      minTurnoverJpy: numberOption(options, "min-turnover-jpy", 0),
      useEarningsCalendar: !flags.has("no-earnings-calendar"),
    });
  } catch (error) {
    if (error instanceof StoreRunError) fail(error.message);
    throw error;
  }
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

  const fromStore = flags.has("from-store") ? loadFromStore(bundle, options, flags) : null;
  let signalList = fromStore ? fromStore.signals : bundle.signals;
  if (bundle.filters?.lendableOnly) {
    if (!fromStore || !signalList) {
      fail("filters.lendableOnly は --from-store でのみ使えます（貸借区分は銘柄マスタから引きます）");
    }
    // 検出と同じ封印の前日までのマスタだけを見る。
    const research = resolveResearchTo(options.get("to") ?? null);
    try {
      signalList = applyLendableFilter(signalList!, research.to);
    } catch (error) {
      if (error instanceof StoreRunError) fail(error.message);
      throw error;
    }
  }
  const priceList = fromStore ? fromStore.prices : bundle.prices;
  const benchmarkSeries = fromStore ? fromStore.benchmark : bundle.benchmark;
  if (!signalList || !priceList) {
    fail("signals / prices がありません。bundle に入れるか --from-store を指定してください");
  }
  if (signalList!.length === 0) {
    fail("シグナルが0件です。backtest を実行できません");
  }

  const prices = buildUniquePriceSeriesMap(priceList!);
  // 保存庫の価格は無調整。保有中の分割・併合は損益に段差として入るので、
  // 権利落ち台帳を渡して該当する取引を落とす。bundle の価格には台帳が無い。
  const report = runBacktest(
    bundle.spec,
    signalList!,
    prices,
    benchmarkSeries,
    fromStore ? { corporateActionDates: fromStore.corporateActionDates } : {},
  );
  const useLedger = !flags.has("no-trial-ledger");
  // 台帳を使わないのに bundle が試行数を宣言していないなら止める。
  // **既定で 1（最も緩い閾値）を仮定してはいけない。**
  // 偽発見を防ぐ仕組みが、黙って最も通りやすい値を置くのは逆。
  // 実際に generic-reversal の bundle には trials が無く、--no-trial-ledger の
  // 下見で「試行1・閾値1.96」として PASS と表示された（台帳では試行4・閾値2.79 で FAIL）。
  if (!useLedger && bundle.trials === undefined) {
    fail(
      "--no-trial-ledger を使うなら bundle.trials を明示してください"
      + "（何回目の試行かで False Discovery Guard の閾値が変わります）",
    );
  }
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
  if (!report.corporateActionsChecked) {
    console.log("  ※ 保有中の株式分割・併合は確かめていません（権利落ち台帳が無い入力）");
  }
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
    const recorded = recordTrialOutcome(
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
    // **理由を渡したのに置き換えが起きなかったら黙らない。**
    // trialId は dataset の指紋を含むので、シグナル集合が変われば別 ID になる。
    // 「直して測り直した」つもりが、台帳では別の試行として数えられている。
    if (options.get("supersede") && !recorded.superseded) {
      console.log(
        "  ※ --supersede を渡しましたが置き換えは起きていません。"
        + "シグナル集合か価格が変わったため別の試行として記録されました"
        + `（試行 ${trials} 件目）。閾値はその分上がります。`,
      );
    }
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
