import type { PriceSeries } from "./backtest.js";

export function buildUniquePriceSeriesMap(seriesList: readonly PriceSeries[]): Map<string, PriceSeries> {
  const prices = new Map<string, PriceSeries>();
  for (const series of seriesList) {
    if (prices.has(series.code)) {
      throw new Error(`backtest price series code ${series.code} must be unique`);
    }
    prices.set(series.code, series);
  }
  return prices;
}
