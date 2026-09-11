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
  loadEarningsDisclosureInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
  resolveResearchTo,
} from "../study-inputs-from-store.js";
import { detectReadAcrossEvents } from "../signals/read-across-events.js";
import { DEFAULT_MARKET_MODEL_PARAMS } from "../signals/market-model.js";
import { sectorPeerGraph } from "../signals/company-relations.js";
import {
  buildSectorPeers,
  loadMasterAsOf,
} from "../providers/jquants-master-store.js";
import {
  generateEarningsGapSignals,
  type EarningsGapParams,
} from "../signals/earnings-gap.js";
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
  detector?:
    | {
        kind: "abnormal_move";
        params: Omit<AbnormalMoveParams, "knownEventDates" | "corporateActionDates">
          & { knownEventDates?: Record<string, string[]> };
      }
    | {
        /**
         * 決算後に下げたが会社予想の営業利益が減額されていない銘柄。
         * 開示は保存庫（research/fins）から読む。bundle に書き写さない。
         */
        kind: "earnings_gap";
        params: Omit<EarningsGapParams, "corporateActionDates">;
      }
    | {
        /**
         * 同業が理由不明で大きく下げた日に、自分も下げた銘柄。
         * peer は銘柄マスタの33業種から組む。bundle に書き写さない。
         */
        kind: "read_across";
        params: {
          sourceAbnormalReturnThresholdPct: number;
          relatedAbnormalReturnThresholdPct: number;
          matchScaleCategory?: boolean;
        };
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
  flags: ReadonlySet<string>,
): { signals: BacktestSignal[]; prices: PriceSeries[]; benchmark: PriceSeries } {
  const kind = bundle.detector?.kind;
  if (kind !== "abnormal_move" && kind !== "earnings_gap" && kind !== "read_across") {
    fail(
      "--from-store には bundle.detector.kind = "
      + '"abnormal_move" / "earnings_gap" / "read_across" のいずれかが必要です',
    );
  }
  const minTurnoverJpy = numberOption(options, "min-turnover-jpy", 0);

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

  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(options.get("from") ? { from: options.get("from")! } : {}),
      ...(to ? { to } : {}),
      minTurnoverJpy,
    });
  } catch (error) {
    if (error instanceof StudyInputsError) fail(error.message);
    throw error;
  }

  if (bundle.detector!.kind === "read_across") {
    const master = loadMasterAsOf(to ?? inputs.tradingDates.at(-1)!);
    if (master.snapshotDate === null) {
      fail("銘柄マスタがありません。先に pnpm ingest:master を実行してください");
    }
    const peers = buildSectorPeers({
      attributes: master.attributes,
      ...(bundle.detector!.params.matchScaleCategory ? { matchScaleCategory: true } : {}),
    });
    const known = loadEarningsEventDatesFromStore({
      tradingDates: inputs.tradingDates, ...(to ? { to } : {}),
    }).byCode;
    const sources = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
      abnormalReturnThresholdPct: bundle.detector!.params.sourceAbnormalReturnThresholdPct,
      knownEventDates: known,
      corporateActionDates: inputs.corporateActionDates,
      marketModel: DEFAULT_MARKET_MODEL_PARAMS,
      minAverageTurnoverJpy: minTurnoverJpy,
    });
    const across = detectReadAcrossEvents(
      sources.candidates.map((one) => ({ code: one.code, date: one.date })),
      sectorPeerGraph(peers.peersByCode),
      new Map<string, PriceSeries>(inputs.prices.map((series) => [series.code, series])),
      inputs.benchmark,
      {
        sourceAbnormalReturnThresholdPct: bundle.detector!.params.sourceAbnormalReturnThresholdPct,
        relatedAbnormalReturnThresholdPct: bundle.detector!.params.relatedAbnormalReturnThresholdPct,
        knownEventDates: known,
        corporateActionDates: inputs.corporateActionDates,
        relationTypes: ["peer"],
        minAverageTurnoverJpy: minTurnoverJpy,
        // 発生元と同じ定義で測る。素の差だと β の高い銘柄が過剰に選ばれる。
        marketModel: DEFAULT_MARKET_MODEL_PARAMS,
      },
    );
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);
    console.log(
      `検出  : 発生元 ${sources.candidates.length} → 伝播 ${across.candidates.length}`
      + `（発生元 ${across.propagatedSourceCount}件から）`,
    );
    console.log("");
    // observedAt は伝播日の引け。entry.mode = next_open なら翌営業日の始値。
    return {
      signals: across.candidates.map((one) => ({
        id: one.candidateId, code: one.relatedCode, observedAt: one.observedAt,
      })),
      prices: inputs.prices,
      benchmark: inputs.benchmark,
    };
  }

  if (bundle.detector!.kind === "earnings_gap") {
    // 決算ギャップは開示そのものが起点なので knownEventDates を使わない
    // （「決算の日を除外する」のは業績以外の原因を探すときの話）。
    const disclosures = loadEarningsDisclosureInputs(to ? { to } : {});
    const priceByCode = new Map<string, PriceSeries>(
      inputs.prices.map((series) => [series.code, series]),
    );
    const result = generateEarningsGapSignals(disclosures.disclosures, priceByCode, {
      ...bundle.detector!.params,
      corporateActionDates: inputs.corporateActionDates,
    });
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);
    console.log(
      `決算開示: ${disclosures.datesScanned}営業日 / ${disclosures.disclosures.length.toLocaleString()}件`,
    );
    const gapRejects = Object.entries(result.rejectedCounts)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reason}=${count.toLocaleString()}`)
      .join(" ");
    console.log(`検出  : 開示 ${result.disclosureCount.toLocaleString()} → シグナル ${result.signals.length}`);
    if (gapRejects) console.log(`却下  : ${gapRejects}`);
    console.log("");
    return { signals: result.signals, prices: inputs.prices, benchmark: inputs.benchmark };
  }

  // 決算開示から「説明のつく日」を組む。
  //
  // 権利落ちと同じ理由で bundle ではなく保存庫を見る。bundle に書き写すと、
  // 取り込みで開示が伸びても古いまま使われる。
  // edge-study と同じ材料を同じ作り方で使わないと、
  // 「イベントスタディでは出たのに backtest では出ない」の原因が分からなくなる。
  let knownEventDates = new Map<string, Set<string>>(
    Object.entries(bundle.detector!.params.knownEventDates ?? {})
      .map(([code, dates]) => [code, new Set(dates)]),
  );
  if (!flags.has("no-earnings-calendar")) {
    try {
      const earnings = loadEarningsEventDatesFromStore({ tradingDates: inputs.tradingDates, ...(to ? { to } : {}) });
      knownEventDates = earnings.byCode;
      console.log(
        `決算カレンダー: ${earnings.datesScanned}営業日 / 開示 ${earnings.disclosureCount.toLocaleString()}件`
        + ` → ${earnings.byCode.size}銘柄 / 除外対象 ${earnings.markedDates.toLocaleString()}日`,
      );
    } catch (error) {
      if (error instanceof StudyInputsError) fail(error.message);
      throw error;
    }
  }

  const detected = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
    ...bundle.detector!.params,
    knownEventDates,
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

  const fromStore = flags.has("from-store") ? loadFromStore(bundle, options, flags) : null;
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
