/**
 * 取り込み済みの価格ストアから、研究の入力（価格・benchmark・権利落ち）を組む。
 *
 * ## なぜ1箇所にまとめるか
 *
 * edge-study と backtest の両方が同じ材料を必要とする。それぞれに書くと、
 * 流動性の足切りや benchmark の作り方が片方だけ変わり、
 * 「イベントスタディでは出たのに backtest では出ない」の原因が
 * 分からなくなる。実際に一度、ほぼ同じ関数を2本書いた。
 *
 * ## ここで一緒にやること
 *
 * - 権利落ち台帳を読む。**無ければ止める。** 台帳なしで走らせると
 *   1:100 分割が -99% の暴落として候補に上がる（189営業日で -25%以下が
 *   470件、大半が分割だった）
 * - 流動性で母集団を絞る。非流動銘柄は板が薄く終値が当日の市場変動を
 *   反映しないので、翌日の追いつきを異常として拾い続ける
 *   （全4,321銘柄で候補1,775件、5億円/日以上の830銘柄なら432件）
 * - benchmark をユニバースから組む。ETF は説明変数の測定誤差になり、
 *   β を一様に希薄化させる（実測 平均0.59 対 1.00）
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JQUANTS_ADJUSTMENT_LEDGER_NAME,
  parseAdjustmentLedger,
  toCorporateActionDates,
} from "./providers/jquants-adjustment-events.js";
import {
  loadBacktestSeriesAsOf,
  resolveStoreRoot,
} from "./providers/jquants-daily-store.js";
import {
  DEFAULT_UNIVERSE_BENCHMARK_PARAMS,
  buildUniverseBenchmark,
} from "./signals/universe-benchmark.js";
import type { PriceSeries } from "./backtest.js";

export interface StudyInputsQuery {
  from?: string;
  to?: string;
  /** 0 なら流動性で絞らない。 */
  minTurnoverJpy?: number;
  root?: string;
  asOf?: string;
}

export interface StudyInputs {
  /** 流動性で絞ったあとの銘柄。 */
  prices: PriceSeries[];
  /** 絞る前の銘柄数。絞りが効きすぎていないか見るために返す。 */
  universeSize: number;
  /** ユニバースから組んだ等加重指数。 */
  benchmark: PriceSeries;
  /** 構成銘柄が足りず指数を出せなかった日。 */
  benchmarkSkippedDates: string[];
  corporateActionDates: Map<string, Set<string>>;
  datesScanned: number;
}

export class StudyInputsError extends Error {}

export function loadStudyInputsFromStore(query: StudyInputsQuery = {}): StudyInputs {
  const root = query.root ?? resolveStoreRoot();
  const ledgerPath = resolve(root, JQUANTS_ADJUSTMENT_LEDGER_NAME);
  if (!existsSync(ledgerPath)) {
    throw new StudyInputsError(
      `権利落ち台帳がありません: ${ledgerPath}\n`
      + "先に pnpm ingest:prices を実行してください。"
      + "台帳なしで走らせると株式分割を暴落として検出します",
    );
  }
  const corporateActionDates = toCorporateActionDates(
    parseAdjustmentLedger(readFileSync(ledgerPath, "utf-8")),
  );

  const minTurnoverJpy = query.minTurnoverJpy ?? 0;
  if (!Number.isFinite(minTurnoverJpy) || minTurnoverJpy < 0) {
    throw new StudyInputsError(`minTurnoverJpy must be a non-negative finite number: ${minTurnoverJpy}`);
  }

  const loaded = loadBacktestSeriesAsOf({
    asOf: query.asOf ?? new Date().toISOString(),
    root,
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
  });
  if (loaded.series.length === 0) {
    throw new StudyInputsError(
      "価格ストアに使える系列がありません。先に pnpm ingest:prices を実行してください",
    );
  }

  // benchmark は**流動性で絞る前**の母集団から組む。絞ったあとから組むと、
  // 絞り方を変えるたびに市場の定義まで変わってしまう。
  const universe = buildUniverseBenchmark(loaded.series, {
    ...DEFAULT_UNIVERSE_BENCHMARK_PARAMS,
    ...(minTurnoverJpy > 0 ? { minAverageTurnoverJpy: minTurnoverJpy } : {}),
  });
  if (universe.series.bars.length === 0) {
    throw new StudyInputsError(
      "ユニバース指数を作れませんでした。構成銘柄が閾値に届いていません",
    );
  }

  const prices = minTurnoverJpy > 0
    ? loaded.series.filter((series) => {
        const window = series.bars.slice(-DEFAULT_UNIVERSE_BENCHMARK_PARAMS.turnoverLookbackBars);
        if (window.length === 0) return false;
        const average = window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / window.length;
        return average >= minTurnoverJpy;
      })
    : loaded.series;

  return {
    prices,
    universeSize: loaded.series.length,
    benchmark: universe.series,
    benchmarkSkippedDates: universe.skippedDates,
    corporateActionDates,
    datesScanned: loaded.datesScanned,
  };
}

/** 人向けの1〜3行の要約。CLI が同じ形で出せるようにここに置く。 */
export function formatStudyInputs(inputs: StudyInputs, minTurnoverJpy: number): string[] {
  const actionCount = [...inputs.corporateActionDates.values()]
    .reduce((sum, set) => sum + set.size, 0);
  return [
    `${inputs.prices.length}銘柄`
    + `${minTurnoverJpy > 0 ? `（全${inputs.universeSize}中・売買代金${(minTurnoverJpy / 1e8).toFixed(0)}億円/日以上）` : ""}`
    + ` / ${inputs.datesScanned}営業日`,
    `benchmark ユニバース等加重 ${inputs.benchmark.bars.length}本`
    + `${inputs.benchmarkSkippedDates.length > 0 ? ` / 構成不足 ${inputs.benchmarkSkippedDates.length}日` : ""}`,
    `権利落ち ${inputs.corporateActionDates.size}銘柄 / ${actionCount}件`,
  ];
}
