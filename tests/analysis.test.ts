import assert from "node:assert/strict";
import { buildMarketContext } from "../src/analysis/market-context.js";
import { buildFinancialQuality } from "../src/analysis/financial-quality.js";
import type { DailyQuote, FinancialStatement } from "../src/fetcher/jquants.js";

function quote(day: number, close: number, volume = 100_000): DailyQuote {
  const date = `202601${String(day).padStart(2, "0")}`;
  return {
    Code: "9999",
    Date: date,
    Open: close,
    High: close,
    Low: close,
    Close: close,
    Volume: volume,
    AdjustmentFactor: 1,
    AdjustmentClose: close,
    AdjustmentVolume: volume,
  };
}

function statement(
  date: string,
  sales: number,
  profit: number,
  forecastSales: number,
  forecastProfit: number
): FinancialStatement {
  return {
    DisclosedDate: date,
    DisclosedTime: "15:00:00",
    LocalCode: "9999",
    NetSales: sales,
    OperatingProfit: profit,
    OrdinaryProfit: profit,
    Profit: profit,
    ForecastNetSales: forecastSales,
    ForecastOperatingProfit: forecastProfit,
    TypeOfDocument: "AnnualFinancialStatements",
  };
}

function testMarketContext() {
  const quotes = Array.from({ length: 70 }, (_, i) => quote(i + 1, 100 + i, 1_000_000));
  const topix = Array.from({ length: 70 }, (_, i) => quote(i + 1, 100 + i * 0.2, 1_000_000));
  const context = buildMarketContext("9999", quotes, topix);

  assert.equal(context.code, "9999");
  assert.ok(context.return20d != null);
  assert.ok(context.relativeToTopix20d != null);
  assert.ok(context.liquidityYen20d != null);
  assert.ok(context.volatility20d != null);
}

function testFinancialQuality() {
  const quality = buildFinancialQuality([
    statement("2025-01-01", 1000, 100, 1200, 120),
    statement("2026-01-01", 1200, 180, 1500, 220),
  ]);

  assert.ok(quality.revenueYoY != null && quality.revenueYoY > 0);
  assert.ok(quality.operatingProfitYoY != null && quality.operatingProfitYoY > 0);
  assert.ok(quality.operatingMargin != null && quality.operatingMargin > 0);
  assert.ok(quality.qualityScore > 0);
}

function main() {
  testMarketContext();
  testFinancialQuality();
  console.log("analysis.test.ts passed");
}

main();
