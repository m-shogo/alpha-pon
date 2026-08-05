import type { PriceObservation } from "./idiosyncratic-shock.js";

function pct(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

function rows(observations: PriceObservation[]): PriceObservation[] {
  return [...observations]
    .filter(row => Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Event shockの市場超過下落を、対象株がevent window内で最安値を付けた「同じ取引日」で測る。
 * benchmark自身の別日の最安値を差し引くと地合いを過剰補正するため使用しない。
 * 対象株の安値日にbenchmark観測が無い場合はfail-closedでnull。
 */
export function calculateSameDayRelativeShockDrawdownPct(
  stockObservations: PriceObservation[],
  benchmarkObservations: PriceObservation[],
  eventDate: string,
  windowEndDate?: string,
): number | null {
  const stockRows = rows(stockObservations);
  const benchmarkRows = rows(benchmarkObservations);
  const stockPre = [...stockRows].reverse().find(row => row.date < eventDate);
  const benchmarkPre = [...benchmarkRows].reverse().find(row => row.date < eventDate);
  const stockWindow = stockRows.filter(row => row.date >= eventDate && (!windowEndDate || row.date <= windowEndDate));
  if (!stockPre || !benchmarkPre || stockWindow.length === 0) return null;

  const stockLow = stockWindow.reduce((min, row) => row.close < min.close ? row : min);
  const benchmarkSameDay = benchmarkRows.find(row => row.date === stockLow.date);
  if (!benchmarkSameDay) return null;

  const stockDrawdown = pct(stockPre.close, stockLow.close);
  const benchmarkDrawdown = pct(benchmarkPre.close, benchmarkSameDay.close);
  return Number((stockDrawdown - benchmarkDrawdown).toFixed(4));
}
