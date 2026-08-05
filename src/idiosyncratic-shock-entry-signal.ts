// 「調査可能になった日」と「下落が一巡して初めて戦略条件を満たした日」を分離する。
// 各候補日の時点までに観測できた価格だけを使い、未来の安値を見てsignalを遡及させない。

import {
  DEFAULT_MIN_RELATIVE_SHOCK_DRAWDOWN_PCT,
  DEFAULT_MIN_SHOCK_DRAWDOWN_PCT,
  DEFAULT_SHOCK_WINDOW_DAYS,
  calculateShockDrawdownPct,
  inferPriceState,
  type PriceObservation,
  type ShockPriceState,
} from "./idiosyncratic-shock.js";
import { calculateSameDayRelativeShockDrawdownPct } from "./idiosyncratic-shock-relative.js";

export const DEFAULT_SIGNAL_SEARCH_DAYS = 90;

export type ShockEntrySignal = {
  signalDate: string;
  signalPrice: number;
  priceState: ShockPriceState;
  shockDrawdownPct: number;
  relativeShockDrawdownPct: number;
};

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function validRows(rows: PriceObservation[]): PriceObservation[] {
  return [...rows]
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function findFirstEligibleShockSignal(input: {
  stock: PriceObservation[];
  benchmark: PriceObservation[];
  reactionStartDate: string;
  decisionCheckpoint: string;
  minShockDrawdownPct?: number;
  minRelativeShockDrawdownPct?: number;
  shockWindowDays?: number;
  signalSearchDays?: number;
}): ShockEntrySignal | null {
  const stock = validRows(input.stock);
  const benchmark = validRows(input.benchmark);
  if (stock.length === 0 || benchmark.length === 0) return null;

  const minShock = input.minShockDrawdownPct ?? DEFAULT_MIN_SHOCK_DRAWDOWN_PCT;
  const minRelative = input.minRelativeShockDrawdownPct ?? DEFAULT_MIN_RELATIVE_SHOCK_DRAWDOWN_PCT;
  const shockWindowEnd = addDays(input.reactionStartDate, input.shockWindowDays ?? DEFAULT_SHOCK_WINDOW_DAYS);
  const searchEnd = addDays(input.reactionStartDate, input.signalSearchDays ?? DEFAULT_SIGNAL_SEARCH_DAYS);
  const candidateRows = stock.filter(row => row.date >= input.decisionCheckpoint && row.date >= input.reactionStartDate && row.date <= searchEnd);

  for (const candidate of candidateRows) {
    // その日の時点までしか見ない。20日window終了後は初期shock windowを固定する。
    const observedShockEnd = candidate.date < shockWindowEnd ? candidate.date : shockWindowEnd;
    const stockToDate = stock.filter(row => row.date <= candidate.date);
    const benchmarkToDate = benchmark.filter(row => row.date <= candidate.date);
    const shockDrawdownPct = calculateShockDrawdownPct(stockToDate, input.reactionStartDate, observedShockEnd);
    const relativeShockDrawdownPct = calculateSameDayRelativeShockDrawdownPct(
      stockToDate,
      benchmarkToDate,
      input.reactionStartDate,
      observedShockEnd,
    );
    if (shockDrawdownPct == null || relativeShockDrawdownPct == null) continue;
    if (shockDrawdownPct > minShock || relativeShockDrawdownPct > minRelative) continue;

    const priceState = inferPriceState(stockToDate);
    if (priceState !== "stabilized_after_drop") continue;

    return {
      signalDate: candidate.date,
      signalPrice: candidate.close,
      priceState,
      shockDrawdownPct,
      relativeShockDrawdownPct,
    };
  }

  return null;
}
