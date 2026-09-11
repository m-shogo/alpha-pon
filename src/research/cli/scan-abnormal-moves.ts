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

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import {
  JQUANTS_ADJUSTMENT_LEDGER_NAME,
  parseAdjustmentLedger,
  toCorporateActionDates,
} from "../providers/jquants-adjustment-events.js";
import {
  listIngestedDates,
  loadBacktestSeriesAsOf,
  resolveStoreRoot,
} from "../providers/jquants-daily-store.js";
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

function loadCorporateActionDates(root: string): Map<string, Set<string>> {
  const path = resolve(root, JQUANTS_ADJUSTMENT_LEDGER_NAME);
  if (!existsSync(path)) {
    // 台帳が無いまま走らせると、分割が全部「暴落」として候補に上がる。
    // 黙って空の Map を渡さない。
    throw new Error(
      `権利落ち台帳がない: ${path}\n`
      + "先に pnpm ingest:prices を実行すること。"
      + "台帳なしで走らせると株式分割を暴落として検出する",
    );
  }
  return toCorporateActionDates(parseAdjustmentLedger(readFileSync(path, "utf-8")));
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
  const root = resolveStoreRoot();
  const ingested = listIngestedDates(root);
  if (ingested.length === 0) throw new Error("取り込み済みの価格がない。先に pnpm ingest:prices");

  const from = argValue("from") ? assertIsoDate(argValue("from")!, "--from") : ingested[0]!;
  const to = argValue("to") ? assertIsoDate(argValue("to")!, "--to") : ingested.at(-1)!;
  if (from > to) throw new Error("--from must be on or before --to");
  const minTurnoverJpy = numberArg("min-turnover-jpy", 0);

  console.log(`期間            ${from} 〜 ${to}`);
  console.log(`取り込み済み    ${ingested[0]} 〜 ${ingested.at(-1)}（${ingested.length}営業日）`);
  if (to < ingested.at(-1)!) {
    console.log(`未使用の期間    ${to} より後は触らない（確認期間・holdout の保全）`);
  }

  const corporateActionDates = loadCorporateActionDates(root);
  const actionCount = [...corporateActionDates.values()].reduce((sum, set) => sum + set.size, 0);
  console.log(`権利落ち台帳    ${corporateActionDates.size}銘柄 / ${actionCount}件`);

  const asOf = new Date().toISOString();
  const loaded = loadBacktestSeriesAsOf({ asOf, from, to, root });
  const allSecurities: PriceSeries[] = loaded.series.filter(
    (series) => series.code !== ETF_BENCHMARK_CODE,
  );

  const useEtf = argValue("benchmark") === "etf";
  let benchmark: PriceSeries;
  if (useEtf) {
    const etf = loaded.series.find((series) => series.code === ETF_BENCHMARK_CODE);
    if (!etf) throw new Error(`benchmark ${ETF_BENCHMARK_CODE} が価格ストアにない`);
    benchmark = etf;
    console.log(`benchmark       ${ETF_BENCHMARK_CODE}（TOPIX連動ETF・${etf.bars.length}本）`);
  } else {
    const universe = buildUniverseBenchmark(allSecurities, {
      ...DEFAULT_UNIVERSE_BENCHMARK_SETTINGS,
      corporateActionDates,
      ...(minTurnoverJpy > 0 ? { minAverageTurnoverJpy: minTurnoverJpy } : {}),
    });
    benchmark = universe.series;
    const constituents = universe.days.map((day) => day.constituents).sort((a, b) => a - b);
    console.log(
      `benchmark       ユニバース等加重（${universe.days.length}本 / 構成中央 `
      + `${constituents[Math.floor(constituents.length / 2)] ?? 0}銘柄`
      + `${universe.skippedDates.length > 0 ? ` / 構成不足 ${universe.skippedDates.length}日` : ""}）`,
    );
  }

  // 走査対象も流動性で絞る。非流動銘柄は板が薄く終値が当日の市場変動を
  // 反映しないので、翌日の追いつきを「異常」として拾い続ける。
  // 実測: 全4,321銘柄では候補1,775件、5億円/日以上の830銘柄では432件。
  const securities = minTurnoverJpy > 0
    ? allSecurities.filter((series) => {
        const window = series.bars.slice(-DEFAULT_UNIVERSE_BENCHMARK_SETTINGS.turnoverLookbackBars);
        if (window.length === 0) return false;
        const average = window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / window.length;
        return average >= minTurnoverJpy;
      })
    : allSecurities;
  console.log(`銘柄            ${securities.length}${minTurnoverJpy > 0 ? `（全${allSecurities.length}中・売買代金${(minTurnoverJpy / 1e8).toFixed(0)}億円/日以上）` : ""}`);
  console.log("");

  // knownEventDates は「情報が無い」ことを明示して空で渡す。決算日カレンダーを
  // 繋ぐまで、決算反応も F1 の候補に混ざる。混ざっている事実を隠さない。
  console.log("注意: 決算日カレンダー未接続。決算反応も候補に混ざる（explained_by_known_event=0）");
  console.log("");

  const marketModel: MarketModelParams | null = hasFlag("no-market-model")
    ? null
    : DEFAULT_MARKET_MODEL_PARAMS;

  if (marketModel) reportBetaSanity(securities, benchmark, marketModel);

  const baseParams: Omit<AbnormalMoveParams, "abnormalReturnThresholdPct"> = {
    knownEventDates: new Map(),
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
