// Research OS — Backtest Framework（共通インターフェース）。
//
// 設計方針:
//   - 価格は「注入」する。この関数は外部 IO を一切行わない（deterministic / テスト可能）。
//   - 執行できない取引を「執行できた」ことにしない。Liquidity と PIT で明示的に落とす。
//   - Gross と Net を必ず分けて返す。Net だけ・Gross だけの報告は禁止。

import { canEnterSameClose, jstDateOf } from "./pit.js";
import { aggregate, computeCosts, computeNetAlpha, type AggregateStats, type CostModel } from "./net-alpha.js";

export interface PriceBar {
  date: string; // YYYY-MM-DD（JST の営業日）
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceSeries {
  code: string;
  /** date 昇順。欠損日は含めない（非営業日は行が無い）。 */
  bars: PriceBar[];
}

export interface BacktestSpec {
  schemaVersion: 1;
  id: string;
  edgeId: string;
  side: "long" | "short";
  notionalJpy?: number;
  entry: { mode: "next_open" | "same_close" | "vwap_next_day"; lagDays?: number };
  exit: { mode: "holding_period" | "event_resolution" | "stop_or_period"; holdingPeriodDays?: number; stopLossBps?: number };
  costs: CostModel;
  liquidity: { participationLimitPct: number; minAdtvJpy?: number };
  benchmark?: string;
  notes?: string;
}

/** バックテストの入力シグナル。observedAt は「その情報が公になった時刻」。 */
export interface BacktestSignal {
  id: string;
  code: string;
  observedAt: string;
  /** event_resolution モードで使う決着日 */
  resolutionDate?: string;
}

export type SkipReason =
  | "no_price_series"
  | "no_entry_bar"
  | "no_exit_bar"
  | "pit_violation_same_close"
  | "liquidity_participation_exceeded"
  | "liquidity_adtv_too_low"
  | "missing_resolution_date";

export interface TradeResult {
  signalId: string;
  code: string;
  executable: boolean;
  skipReason?: SkipReason;
  entryDate?: string;
  entryPrice?: number;
  exitDate?: string;
  exitPrice?: number;
  holdingDays?: number;
  grossReturnBps?: number;
  benchmarkReturnBps?: number;
  grossAlphaBps?: number;
  totalCostBps?: number;
  netAlphaBps?: number;
  participationPct?: number;
  stopped?: boolean;
}

export interface BacktestReport {
  schemaVersion: 1;
  specId: string;
  edgeId: string;
  side: BacktestSpec["side"];
  signalCount: number;
  executedCount: number;
  skipped: Array<{ signalId: string; reason: SkipReason }>;
  trades: TradeResult[];
  gross: AggregateStats;
  net: AggregateStats;
}

const ADTV_LOOKBACK_BARS = 20;

function indexOfFirstBarOnOrAfter(bars: PriceBar[], date: string): number {
  return bars.findIndex((bar) => bar.date >= date);
}

function indexOfFirstBarAfter(bars: PriceBar[], date: string): number {
  return bars.findIndex((bar) => bar.date > date);
}

function returnBps(entry: number, exit: number, side: "long" | "short"): number {
  const raw = (exit - entry) / entry;
  return (side === "long" ? raw : -raw) * 10_000;
}

function averageTurnoverJpy(bars: PriceBar[], endIndex: number): number {
  const start = Math.max(0, endIndex - ADTV_LOOKBACK_BARS + 1);
  const window = bars.slice(start, endIndex + 1);
  if (window.length === 0) return 0;
  return window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / window.length;
}

function resolveEntry(
  spec: BacktestSpec,
  signal: BacktestSignal,
  bars: PriceBar[],
): { index: number; price: number } | SkipReason {
  const observedDate = jstDateOf(signal.observedAt);
  const lagDays = spec.entry.lagDays ?? 0;

  if (spec.entry.mode === "same_close") {
    if (!canEnterSameClose(signal.observedAt)) return "pit_violation_same_close";
    const index = bars.findIndex((bar) => bar.date === observedDate);
    if (index < 0) return "no_entry_bar";
    return { index, price: bars[index].close };
  }

  let index = indexOfFirstBarAfter(bars, observedDate);
  if (index < 0) return "no_entry_bar";
  index += lagDays;
  if (index >= bars.length) return "no_entry_bar";

  const bar = bars[index];
  // vwap_next_day は日中 VWAP の代理として (高値+安値+終値)/3 を使う（近似であることを明示）
  const price = spec.entry.mode === "vwap_next_day" ? (bar.high + bar.low + bar.close) / 3 : bar.open;
  return { index, price };
}

function resolveExit(
  spec: BacktestSpec,
  signal: BacktestSignal,
  bars: PriceBar[],
  entryIndex: number,
  entryPrice: number,
): { index: number; price: number; stopped: boolean } | SkipReason {
  const stopLossBps = spec.exit.stopLossBps;
  const holdingPeriodDays = spec.exit.holdingPeriodDays ?? 0;

  let periodExitIndex: number;
  if (spec.exit.mode === "event_resolution") {
    if (!signal.resolutionDate) return "missing_resolution_date";
    const found = indexOfFirstBarOnOrAfter(bars, signal.resolutionDate);
    if (found < 0) return "no_exit_bar";
    periodExitIndex = found;
  } else {
    if (holdingPeriodDays <= 0) return "no_exit_bar";
    periodExitIndex = entryIndex + holdingPeriodDays;
    if (periodExitIndex >= bars.length) return "no_exit_bar";
  }

  if (spec.exit.mode === "stop_or_period" && stopLossBps && stopLossBps > 0) {
    for (let i = entryIndex + 1; i <= periodExitIndex; i += 1) {
      // ロングは安値、ショートは高値で逆行幅を判定する（保守的）
      const adverse = spec.side === "long" ? bars[i].low : bars[i].high;
      if (returnBps(entryPrice, adverse, spec.side) <= -stopLossBps) {
        const stopPrice = entryPrice * (spec.side === "long" ? 1 - stopLossBps / 10_000 : 1 + stopLossBps / 10_000);
        return { index: i, price: stopPrice, stopped: true };
      }
    }
  }

  return { index: periodExitIndex, price: bars[periodExitIndex].close, stopped: false };
}

function benchmarkReturnBpsFor(
  benchmark: PriceSeries | undefined,
  entryDate: string,
  exitDate: string,
): number | undefined {
  if (!benchmark) return undefined;
  const entryIndex = indexOfFirstBarOnOrAfter(benchmark.bars, entryDate);
  const exitIndex = indexOfFirstBarOnOrAfter(benchmark.bars, exitDate);
  if (entryIndex < 0 || exitIndex < 0) return undefined;
  // ベンチマークは常にロング換算。ショートの超過は「銘柄の逆行 − 指数の逆行」で測る。
  const raw = (benchmark.bars[exitIndex].close - benchmark.bars[entryIndex].close) / benchmark.bars[entryIndex].close;
  return raw * 10_000;
}

/**
 * Backtest 本体。
 * price は code -> PriceSeries。benchmark は任意（あれば超過リターンで評価）。
 */
export function runBacktest(
  spec: BacktestSpec,
  signals: BacktestSignal[],
  prices: Map<string, PriceSeries>,
  benchmark?: PriceSeries,
): BacktestReport {
  const trades: TradeResult[] = [];
  const skipped: BacktestReport["skipped"] = [];

  const ordered = [...signals].sort((a, b) =>
    a.observedAt === b.observedAt ? (a.id < b.id ? -1 : 1) : a.observedAt < b.observedAt ? -1 : 1,
  );

  for (const signal of ordered) {
    const series = prices.get(signal.code);
    const skip = (reason: SkipReason) => {
      skipped.push({ signalId: signal.id, reason });
      trades.push({ signalId: signal.id, code: signal.code, executable: false, skipReason: reason });
    };

    if (!series || series.bars.length === 0) {
      skip("no_price_series");
      continue;
    }

    const entry = resolveEntry(spec, signal, series.bars);
    if (typeof entry === "string") {
      skip(entry);
      continue;
    }

    const turnover = averageTurnoverJpy(series.bars, entry.index);
    if (spec.liquidity.minAdtvJpy !== undefined && turnover < spec.liquidity.minAdtvJpy) {
      skip("liquidity_adtv_too_low");
      continue;
    }
    const notional = spec.notionalJpy ?? 0;
    const participationPct = turnover > 0 ? (notional / turnover) * 100 : Number.POSITIVE_INFINITY;
    if (notional > 0 && participationPct > spec.liquidity.participationLimitPct) {
      skip("liquidity_participation_exceeded");
      continue;
    }

    const exit = resolveExit(spec, signal, series.bars, entry.index, entry.price);
    if (typeof exit === "string") {
      skip(exit);
      continue;
    }

    const entryDate = series.bars[entry.index].date;
    const exitDate = series.bars[exit.index].date;
    const holdingDays = Math.round(
      (Date.parse(`${exitDate}T00:00:00+09:00`) - Date.parse(`${entryDate}T00:00:00+09:00`)) / 86_400_000,
    );

    const grossReturnBps = returnBps(entry.price, exit.price, spec.side);
    const rawBenchmarkBps = benchmarkReturnBpsFor(benchmark, entryDate, exitDate);
    const benchmarkReturnBps =
      rawBenchmarkBps === undefined ? undefined : spec.side === "long" ? rawBenchmarkBps : -rawBenchmarkBps;

    const costs = computeCosts(spec.costs, {
      side: spec.side,
      holdingDays,
      participationPct: Number.isFinite(participationPct) ? participationPct : 0,
    });
    const netAlpha = computeNetAlpha({ grossReturnBps, benchmarkReturnBps, costs });

    trades.push({
      signalId: signal.id,
      code: signal.code,
      executable: true,
      entryDate,
      entryPrice: entry.price,
      exitDate,
      exitPrice: exit.price,
      holdingDays,
      grossReturnBps,
      benchmarkReturnBps: netAlpha.benchmarkReturnBps,
      grossAlphaBps: netAlpha.grossAlphaBps,
      totalCostBps: netAlpha.totalCostBps,
      netAlphaBps: netAlpha.netAlphaBps,
      participationPct: Number.isFinite(participationPct) ? participationPct : undefined,
      stopped: exit.stopped,
    });
  }

  const executed = trades.filter((trade) => trade.executable);
  return {
    schemaVersion: 1,
    specId: spec.id,
    edgeId: spec.edgeId,
    side: spec.side,
    signalCount: signals.length,
    executedCount: executed.length,
    skipped,
    trades,
    gross: aggregate(executed.map((trade) => trade.grossAlphaBps ?? 0)),
    net: aggregate(executed.map((trade) => trade.netAlphaBps ?? 0)),
  };
}
