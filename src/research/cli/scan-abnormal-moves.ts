/**
 * 取り込んだ実データに F1（異常変動からのイベント候補検出）を掛ける。
 *
 *   pnpm scan:moves -- --to 2025-06-30                    # 既定の閾値で1回
 *   pnpm scan:moves -- --to 2025-06-30 --sweep            # 閾値ごとの件数
 *
 * ## これは探索であって検証ではない
 *
 * 閾値を選ぶための道具。ここで見た結果に合わせて閾値を決めるのは正当だが、
 * **同じ期間で確認しても意味がない**。確認期間・holdout は `--to` で
 * 明示的に切り、既定では触らない。
 *
 * ## 出す数字の意味
 *
 * 候補件数だけ見ても閾値は選べない。「何件を人が捌けるか」と
 * 「弾いた理由の内訳」を併せて出す。特に `corporate_action_in_window` が
 * 効いていること（＝分割を暴落と読んでいないこと）を毎回確認する。
 */

import {
  detectAbnormalMoveEvents,
  type AbnormalMoveParams,
  type AbnormalMoveResult,
} from "../signals/abnormal-move-events.js";
import {
  DEFAULT_MARKET_MODEL_PARAMS,
  estimateMarketModel,
  type MarketModelParams,
} from "../signals/market-model.js";
import {
  DEFAULT_UNIVERSE_BENCHMARK_SETTINGS,
  buildUniverseBenchmark,
} from "../signals/universe-benchmark.js";
import { listIngestedDates } from "../providers/jquants-daily-store.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
  resolveResearchTo,
} from "../study-inputs-from-store.js";
import { assertIsoDate } from "../providers/jquants-daily-ingest.js";
import type { PriceSeries } from "../backtest.js";

/**
 * TOPIX 連動 ETF。`--benchmark etf` を指定したときだけ使う。
 *
 * 既定はユニバース由来の等加重指数。ETF の終値は指数そのものではなく
 * 需給・スプレッド・約定タイミングのぶれを含み、それが回帰の説明変数の
 * 測定誤差になって β を一様に 0 方向へ引く（実測: 平均 0.59 対 1.00）。
 */
const ETF_BENCHMARK_CODE = "13060";

const DEFAULT_THRESHOLDS_PCT = [-8, -10, -12, -15, -20];

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const raw = argValue(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number: ${raw}`);
  return value;
}

/**
 * β の横断分布が壊れていないか見る。
 *
 * 等加重で選んだ銘柄群の市場βの平均は、定義上 1 付近になる。
 * これが大きく外れているときは推定が壊れている。実測では
 * benchmark に ETF を使うと平均 0.59 まで落ちた（説明変数の測定誤差）。
 * その状態で市場モデルを使うと、市場が下げた日の候補が**増える**。
 *
 * 「β が推定できなかった件数」も必ず出す。推定不能が多いと候補が減るが、
 * それは「説明がついた」ではなく「測れなかった」なので、
 * 区別しないと改善したと誤読する（実際に一度誤読した）。
 */
function reportBetaSanity(
  securities: readonly PriceSeries[],
  benchmark: PriceSeries,
  params: MarketModelParams,
): void {
  const benchmarkCloseByDate = new Map(benchmark.bars.map((bar) => [bar.date, bar.close]));
  const betas: number[] = [];
  let unavailable = 0;
  for (const series of securities) {
    const index = series.bars.length - 1;
    if (index < 1) { unavailable += 1; continue; }
    const estimate = estimateMarketModel(series, benchmarkCloseByDate, index, params);
    if (estimate.ok) betas.push(estimate.fit.beta); else unavailable += 1;
  }

  if (betas.length === 0) {
    console.log("β 診断        推定できた銘柄が無い。履歴が推定窓に足りていない");
    console.log(`              推定不能 ${unavailable}銘柄 / 窓 ${params.estimationBars}本`);
    console.log("              この状態の候補減少は「説明がついた」ではなく「測れなかった」");
    console.log("");
    return;
  }

  const sorted = [...betas].sort((left, right) => left - right);
  const mean = betas.reduce((sum, value) => sum + value, 0) / betas.length;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  console.log(
    `β 診断        平均 ${mean.toFixed(2)} / 中央 ${median.toFixed(2)}`
    + ` / 推定できた ${betas.length}銘柄 / 推定不能 ${unavailable}銘柄`,
  );
  if (Math.abs(mean - 1) > 0.25) {
    console.log(
      `              ⚠ 平均βが 1 から離れている。推定が壊れている疑い。`
      + " benchmark の測定誤差か、非同期取引による希薄化",
    );
  }
  console.log("");
}

function summarise(result: AbnormalMoveResult): string {
  const reasons = Object.entries(result.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");
  return `候補 ${result.candidates.length} / 評価 ${result.evaluatedCount}\n    却下: ${reasons}`;
}

function main(): void {
  const ingested = listIngestedDates();
  if (ingested.length === 0) throw new Error("取り込み済みの価格がない。先に pnpm ingest:prices");

  const from = argValue("from") ? assertIsoDate(argValue("from")!, "--from") : ingested[0]!;

  // 既定で取り込み最終日まで走査すると、**封印期間の中を覗く。**
  // 正本の金庫から自動で打ち切る（backtest / scan:earnings-gaps と同じ関数）。
  const explicitTo = argValue("to") ? assertIsoDate(argValue("to")!, "--to") : null;
  const research = resolveResearchTo(explicitTo);
  if (research.violation) throw new Error(research.violation);
  const to = research.to ?? ingested.at(-1)!;
  if (from > to) throw new Error("--from must be on or before --to");
  const minTurnoverJpy = numberArg("min-turnover-jpy", 0);

  console.log(`期間            ${from} 〜 ${to}`);
  console.log(`取り込み済み    ${ingested[0]} 〜 ${ingested.at(-1)}（${ingested.length}営業日）`);
  if (to < ingested.at(-1)!) {
    console.log(
      `未使用の期間    ${to} より後は触らない`
      + `（${explicitTo ? "明示指定" : `封印 ${research.sealed?.windowId ?? "?"}`}）`,
    );
  }

  // 材料は edge-study / backtest と**同じ関数**から取る。ここだけ別に組むと
  // 走査対象がずれる。実際 13060 を除外していて、edge-study と
  // 銘柄数が1件食い違っていた（1081 対 1082）。
  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      minTurnoverJpy,
    });
  } catch (error) {
    if (error instanceof StudyInputsError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  const corporateActionDates = inputs.corporateActionDates;
  const securities = inputs.prices;

  // `--benchmark etf` は診断用。1306 ETF の終値は指数そのものではなく
  // 説明変数の測定誤差になり、β を一様に 0 方向へ引く
  // （実測 平均0.59 対 1.00）。比較して確かめたいときだけ使う。
  const useEtf = argValue("benchmark") === "etf";
  let benchmark: PriceSeries;
  if (useEtf) {
    const etf = securities.find((series) => series.code === ETF_BENCHMARK_CODE);
    if (!etf) {
      console.error(`benchmark ${ETF_BENCHMARK_CODE} が流動性の条件を満たしていない`);
      process.exitCode = 1;
      return;
    }
    benchmark = etf;
    console.log(`benchmark       ${ETF_BENCHMARK_CODE}（TOPIX連動ETF・${etf.bars.length}本）← 診断用`);
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) {
      if (!line.startsWith("benchmark")) console.log(line);
    }
  } else {
    benchmark = inputs.benchmark;
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) console.log(line);
  }
  console.log("");

  // 決算開示から「説明のつく日」を組む。
  //
  // 繋ぐまでは空の Map を渡していた。空は「既知イベントが無い」ではなく
  // 「情報が無い」を意味するので、候補のうち何件が単なる決算反応なのかを
  // 確かめられないまま「業績で説明できないショック」と呼んでいた。
  //
  // `--no-earnings-calendar` で明示的に外せる。**黙って空になる経路は作らない。**
  let knownEventDates = new Map<string, Set<string>>();
  if (hasFlag("no-earnings-calendar")) {
    console.log("注意: --no-earnings-calendar。決算反応も候補に混ざる（explained_by_known_event=0）");
  } else {
    const earnings = loadEarningsEventDatesFromStore({ tradingDates: inputs.tradingDates, to });
    knownEventDates = earnings.byCode;
    console.log(
      `決算カレンダー  ${earnings.datesScanned}営業日 / 開示 ${earnings.disclosureCount.toLocaleString()}件`
      + ` → ${earnings.byCode.size}銘柄 / 除外対象 ${earnings.markedDates.toLocaleString()}日`
      + `${earnings.unresolved > 0 ? ` / カレンダー外 ${earnings.unresolved}件` : ""}`,
    );
  }
  console.log("");

  const marketModel: MarketModelParams | null = hasFlag("no-market-model")
    ? null
    : DEFAULT_MARKET_MODEL_PARAMS;

  if (marketModel) reportBetaSanity(securities, benchmark, marketModel);

  const baseParams: Omit<AbnormalMoveParams, "abnormalReturnThresholdPct"> = {
    knownEventDates,
    corporateActionDates,
    ...(minTurnoverJpy > 0 ? { minAverageTurnoverJpy: minTurnoverJpy } : {}),
    ...(marketModel ? { marketModel } : {}),
  };

  const thresholds = hasFlag("sweep")
    ? DEFAULT_THRESHOLDS_PCT
    : [numberArg("threshold-pct", -10)];

  for (const abnormalReturnThresholdPct of thresholds) {
    const result = detectAbnormalMoveEvents(securities, benchmark, {
      ...baseParams,
      abnormalReturnThresholdPct,
    });
    console.log(`閾値 ${String(abnormalReturnThresholdPct).padStart(4)}%  ${summarise(result)}`);

    if (!hasFlag("sweep")) {
      const worst = [...result.candidates]
        .sort((left, right) => left.abnormalReturnPct - right.abnormalReturnPct)
        .slice(0, 20);
      console.log("");
      console.log("  下落の大きい候補（上位20件）:");
      for (const candidate of worst) {
        console.log(
          `    ${candidate.code} ${candidate.date}  `
          + `異常 ${candidate.abnormalReturnPct.toFixed(1)}%  `
          + `素 ${candidate.rawReturnPct.toFixed(1)}%  `
          + `売買代金 ${(candidate.averageTurnoverJpy / 1e8).toFixed(1)}億`,
        );
      }
    }
  }

  console.log("");
  console.log("これは探索。ここで閾値を決めたら、同じ期間で確認してはいけない。");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
