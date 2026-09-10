// Research OS — Backtest Bundle Builder v1。
//
// 目的:
//   PIT Price Store の record と Signal から、既存 `cli/backtest.ts` がそのまま食える
//   `{ spec, signals, prices, benchmark, trials }` を組み立てる。
//
// 設計方針:
//   - 外部 IO を行わない。record は注入する（deterministic / テスト可能）。
//   - asOf を必ず受け取り、`toBacktestPriceSeries` の executable 境界で切る。
//     取得前・実行可能時刻前・後日訂正された価格を Backtest へ入れない。
//   - 価格が無い code は silent drop しない。理由付きで返して呼び出し側に見せる。
//   - spec.benchmark を宣言したのに benchmark 系列が無い場合は fail closed。

import type { BacktestSignal, BacktestSpec, PriceSeries } from "../backtest.js";
import { buildUniquePriceSeriesMap } from "../backtest-bundle-input.js";
import {
  toBacktestPriceSeries,
  type PitPriceRecord,
  type PriceProviderPlan,
} from "../price-store.js";

export const BUNDLE_EXCLUSION_REASONS = [
  "no_price_records",
  "no_executable_bars",
] as const;

export type BundleExclusionReason = (typeof BUNDLE_EXCLUSION_REASONS)[number];

export interface BundleExclusion {
  code: string;
  reason: BundleExclusionReason;
  signalIds: string[];
}

/** どの provider/plan の価格を使うかを明示する。混在は price-store 側で例外になる。 */
export interface BundleSourceSelector {
  market: string;
  source: string;
  providerPlan: PriceProviderPlan;
}

export interface BacktestBundle {
  spec: BacktestSpec;
  signals: BacktestSignal[];
  prices: PriceSeries[];
  benchmark?: PriceSeries;
  trials?: number;
}

export interface BuildBacktestBundleInput {
  spec: BacktestSpec;
  signals: readonly BacktestSignal[];
  /** code -> その code の全 PIT record */
  securityRecords: ReadonlyMap<string, PitPriceRecord[]>;
  /** spec.benchmark を宣言した場合に必須 */
  benchmarkRecords?: readonly PitPriceRecord[];
  /** この時刻までに実行可能だった価格だけを使う */
  asOf: string;
  selector: BundleSourceSelector;
  trials?: number;
}

export interface BuildBacktestBundleResult {
  bundle: BacktestBundle;
  excluded: BundleExclusion[];
  /** bundle に載った signal のうち、価格系列が揃ったものの件数 */
  includedSignalCount: number;
}

function signalIdsByCode(signals: readonly BacktestSignal[]): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  for (const signal of signals) {
    const ids = byCode.get(signal.code);
    if (ids) ids.push(signal.id);
    else byCode.set(signal.code, [signal.id]);
  }
  return byCode;
}

/**
 * Signal が参照する code の価格だけを bundle に載せる。
 *
 * 価格が用意できなかった code の signal も `bundle.signals` には残す。
 * Backtest 側が `no_price_series` として skip に計上し、母集団が見えなくなるのを防ぐため。
 */
export function buildBacktestBundle(input: BuildBacktestBundleInput): BuildBacktestBundleResult {
  const { spec, securityRecords, benchmarkRecords, asOf, selector } = input;
  const signals = [...input.signals].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  const seenSignalIds = new Set<string>();
  for (const signal of signals) {
    if (seenSignalIds.has(signal.id)) {
      throw new Error(`backtest signal id must be unique: ${signal.id}`);
    }
    seenSignalIds.add(signal.id);
  }

  const byCode = signalIdsByCode(signals);
  const prices: PriceSeries[] = [];
  const excluded: BundleExclusion[] = [];
  let includedSignalCount = 0;

  for (const code of [...byCode.keys()].sort()) {
    const signalIds = byCode.get(code)!;
    const records = securityRecords.get(code);
    if (!records || records.length === 0) {
      excluded.push({ code, reason: "no_price_records", signalIds });
      continue;
    }

    const series = toBacktestPriceSeries(records, asOf, {
      seriesKind: "security",
      code,
      market: selector.market,
      source: selector.source,
      providerPlan: selector.providerPlan,
    });

    if (series.bars.length === 0) {
      excluded.push({ code, reason: "no_executable_bars", signalIds });
      continue;
    }

    prices.push(series);
    includedSignalCount += signalIds.length;
  }

  // 重複 code を早期に弾く。cli/backtest.ts と同じ不変条件をここで先に満たす。
  buildUniquePriceSeriesMap(prices);

  let benchmark: PriceSeries | undefined;
  if (spec.benchmark) {
    if (!benchmarkRecords || benchmarkRecords.length === 0) {
      throw new Error(
        `spec.benchmark=${spec.benchmark} was declared but no benchmark price records were provided`,
      );
    }
    benchmark = toBacktestPriceSeries(benchmarkRecords as PitPriceRecord[], asOf, {
      seriesKind: "benchmark",
      code: spec.benchmark,
      market: selector.market,
      source: selector.source,
      providerPlan: selector.providerPlan,
    });
    if (benchmark.bars.length === 0) {
      throw new Error(
        `benchmark ${spec.benchmark} has no executable bars as of ${asOf}; refusing to report unadjusted returns`,
      );
    }
  } else if (benchmarkRecords && benchmarkRecords.length > 0) {
    throw new Error("benchmark records were provided but spec.benchmark is not set");
  }

  return {
    bundle: {
      spec,
      signals,
      prices,
      ...(benchmark ? { benchmark } : {}),
      ...(input.trials === undefined ? {} : { trials: input.trials }),
    },
    excluded,
    includedSignalCount,
  };
}
