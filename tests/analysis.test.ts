import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDaysJst, daysSinceJst } from "../src/date.js";
import { listingEventDaysBetween, parseListingEventDate } from "../src/listing-event-date.js";
import { staleHypothesisAgeDays } from "../src/stale-hypothesis-date.js";
import { periodicReviewStart } from "../src/periodic-review-date.js";
import { listingPerformanceReviewDate } from "../src/listing-performance-date.js";
import { analogyReviewDueDate, isValidAnalogyReviewDueDate } from "../src/analogy-review-date.js";
import { isValidWorldThemeReviewDueDate } from "../src/world-theme-review-date.js";
import { buildMarketContext } from "../src/analysis/market-context.js";
import { buildFinancialQuality } from "../src/analysis/financial-quality.js";
import { classifyWorldEvent, type ClassifiedWorldEvent } from "../src/analysis/world-event-map.js";
import { buildWorldEventReflections } from "../src/analysis/world-event-reflection.js";
import { buildWorldEventClusters, reflectionCandidateEventsFromClusters } from "../src/analysis/world-event-cluster.js";
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

function testJstDateArithmeticRejectsInvalidGregorianDates() {
  assert.equal(daysSinceJst("2026-02-30"), null);
  assert.equal(daysSinceJst("2026-02-29"), null);
  assert.throws(() => addDaysJst("2026-02-30", 0), /real YYYY-MM-DD/);
  assert.equal(addDaysJst("2024-02-29", 1), "2024-03-01");
}

function testListingEventDateRejectsInvalidGregorianDates() {
  assert.equal(parseListingEventDate("2026-02-30"), null);
  assert.equal(parseListingEventDate("2026-02-29"), null);
  assert.equal(listingEventDaysBetween("2026-02-28", "2026-02-30"), null);
  assert.equal(listingEventDaysBetween("2024-02-29", "2024-03-01"), 1);
}

function testStaleHypothesisReviewDateRejectsInvalidGregorianDates() {
  assert.equal(staleHypothesisAgeDays("2026-02-30"), null);
  assert.equal(staleHypothesisAgeDays("2026-02-29"), null);
  assert.equal(staleHypothesisAgeDays(undefined), null);
  assert.notEqual(staleHypothesisAgeDays("2024-02-29"), null);
}

function testPeriodicReviewUsesJstCalendarWindows() {
  assert.equal(periodicReviewStart("2026-08-12", "weekly"), "2026-08-05");
  assert.equal(periodicReviewStart("2026-08-12", "monthly"), "2026-07-13");
  assert.equal(periodicReviewStart("2024-03-01", "weekly"), "2024-02-23");
  assert.throws(() => periodicReviewStart("2026-02-30", "weekly"), /real YYYY-MM-DD/);
}

function testListingPerformanceReviewDatesUseJstCalendarDays() {
  assert.equal(listingPerformanceReviewDate("2026-08-12", 30), "2026-09-11");
  assert.equal(listingPerformanceReviewDate("2026-08-12", 90), "2026-11-10");
  assert.equal(listingPerformanceReviewDate("2024-02-29", 30), "2024-03-30");
  assert.equal(listingPerformanceReviewDate("2026-02-30", 30), null);
  assert.equal(listingPerformanceReviewDate(undefined, 30), null);
}

function testAnalogyReviewDueDatesUseJstCalendarDays() {
  assert.equal(analogyReviewDueDate("2026-08-12", "1d"), "2026-08-13");
  assert.equal(analogyReviewDueDate("2026-08-12", "1w"), "2026-08-19");
  assert.equal(analogyReviewDueDate("2026-08-12", "1m"), "2026-09-11");
  assert.equal(analogyReviewDueDate("2024-02-29", "1d"), "2024-03-01");
  assert.throws(() => analogyReviewDueDate("2026-02-30", "1d"), /real YYYY-MM-DD/);
  assert.equal(isValidAnalogyReviewDueDate("2026-08-15"), true);
  assert.equal(isValidAnalogyReviewDueDate("2024-02-29"), true);
  assert.equal(isValidAnalogyReviewDueDate("2026-02-31"), false);
  assert.equal(isValidAnalogyReviewDueDate("0000-01-01"), false);
  assert.equal(isValidAnalogyReviewDueDate("2026-08-15T00:00:00+09:00"), false);
  assert.equal(isValidAnalogyReviewDueDate(undefined), false);
}

function testWorldThemeReviewDueDatesRejectInvalidGregorianDates() {
  assert.equal(isValidWorldThemeReviewDueDate("2026-08-15"), true);
  assert.equal(isValidWorldThemeReviewDueDate("2024-02-29"), true);
  assert.equal(isValidWorldThemeReviewDueDate("2026-02-31"), false);
  assert.equal(isValidWorldThemeReviewDueDate("0000-01-01"), false);
  assert.equal(isValidWorldThemeReviewDueDate("2026-08-15T00:00:00+09:00"), false);
  assert.equal(isValidWorldThemeReviewDueDate(undefined), false);
}

function testAnalogyPredictionReviewUsesStoredDueDateAndTimeframe() {
  const source = readFileSync(new URL("../src/review-predictions.ts", import.meta.url), "utf-8");
  assert.match(source, /prediction\.reviewDueAt \|\| addDays\(baseDate, timeframeDays\(prediction\.timeframe\)\)/);
  assert.match(source, /prediction\.expectedTimeframe \?\? prediction\.timeframe/);
  assert.doesNotMatch(source, /prediction\.expectedTimeframe \?\? "1w"/);
}

function testWorldEventReflectionReliabilityGate() {
  const official = classifyWorldEvent({
    title: "Official statement: AI datacenter power grid investment announced",
    url: "https://www.gov.example/statement",
    source: "Government",
    publishedAt: "2026-01-01T00:00:00Z",
    snippet: "confirmed official statement about AI datacenter power grid investment",
  });

  const unverifiedSocial = classifyWorldEvent({
    title: "Rumor: AI datacenter power grid emergency allegedly spreading",
    url: "https://x.com/example/status/1",
    source: "X",
    publishedAt: "2026-01-01T00:00:00Z",
    snippet: "unconfirmed claims about AI datacenter power grid emergency",
  });

  const reflections = buildWorldEventReflections([official, unverifiedSocial], "2026-01-02", 10);

  assert.equal(reflections.length, 1);
  assert.equal(reflections[0]?.sourceReliability, "official");
  assert.equal(reflections[0]?.misinformationRisk, "low");
}

function assertNoUnsafeReflection(events: ClassifiedWorldEvent[]) {
  const reflections = buildWorldEventReflections(events, "2026-01-02", 10);
  assert.equal(reflections.length, 0);
}

function testWorldEventReflectionRejectsUnknownSources() {
  const unknownSource = classifyWorldEvent({
    title: "AI datacenter power grid emergency might affect semiconductor supply",
    url: "https://unknown.example/news",
    source: "Unknown Blog",
    publishedAt: "2026-01-01T00:00:00Z",
    snippet: "might affect semiconductor supply",
  });

  assertNoUnsafeReflection([unknownSource]);
}

function testWorldEventClustersSuppressSocialOnlyRumors() {
  const rumor = classifyWorldEvent({
    title: "Rumor: AI datacenter power grid emergency allegedly spreading",
    url: "https://x.com/example/status/1",
    source: "X",
    publishedAt: "2026-01-01T00:00:00Z",
    snippet: "unconfirmed claims about AI datacenter power grid emergency semiconductor supply",
  });

  const clusters = buildWorldEventClusters([rumor]);
  const candidates = reflectionCandidateEventsFromClusters(clusters);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.confirmationLevel, "unverified");
  assert.equal(clusters[0]?.misinformationRisk, "high");
  assert.equal(candidates.length, 0);
}

function testWorldEventClustersAllowTier1ConfirmedCluster() {
  const reuters = classifyWorldEvent({
    title: "Reuters: AI datacenter power grid investment announced for semiconductor supply",
    url: "https://reuters.example/ai-grid-investment",
    source: "Reuters",
    publishedAt: "2026-01-01T00:00:00Z",
    snippet: "confirmed announced AI datacenter power grid investment for semiconductor supply",
  });
  const bloomberg = classifyWorldEvent({
    title: "Bloomberg: AI datacenter power grid investment announced for chip supply",
    url: "https://bloomberg.example/ai-grid-investment",
    source: "Bloomberg",
    publishedAt: "2026-01-01T01:00:00Z",
    snippet: "confirmed announced AI datacenter power grid investment for semiconductor supply",
  });

  const clusters = buildWorldEventClusters([reuters, bloomberg]);
  const candidates = reflectionCandidateEventsFromClusters(clusters);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.confirmationLevel, "confirmed");
  assert.notEqual(clusters[0]?.misinformationRisk, "high");
  assert.equal(candidates.length, 1);
}

function main() {
  testMarketContext();
  testFinancialQuality();
  testJstDateArithmeticRejectsInvalidGregorianDates();
  testListingEventDateRejectsInvalidGregorianDates();
  testStaleHypothesisReviewDateRejectsInvalidGregorianDates();
  testPeriodicReviewUsesJstCalendarWindows();
  testListingPerformanceReviewDatesUseJstCalendarDays();
  testAnalogyReviewDueDatesUseJstCalendarDays();
  testWorldThemeReviewDueDatesRejectInvalidGregorianDates();
  testAnalogyPredictionReviewUsesStoredDueDateAndTimeframe();
  testWorldEventReflectionReliabilityGate();
  testWorldEventReflectionRejectsUnknownSources();
  testWorldEventClustersSuppressSocialOnlyRumors();
  testWorldEventClustersAllowTier1ConfirmedCluster();
  console.log("analysis.test.ts passed");
}

main();