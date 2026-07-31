import { addDaysJst, toCompactDate } from "./date.js";
import { DEFAULT_SHOCK_WINDOW_DAYS, type HistoricalShockCase, type PriceObservation } from "./idiosyncratic-shock.js";
import type { HistoricalStrategyEligibilityStatus } from "./idiosyncratic-shock-case-context.js";
import { DEFAULT_SIGNAL_SEARCH_DAYS, findFirstEligibleShockSignal } from "./idiosyncratic-shock-entry-signal.js";
import { inferShockMarket, shockBenchmarkLabel, type ShockMarket } from "./idiosyncratic-shock-market.js";

export type ShockOutcomeQuote = {
  Date: string;
  AdjustmentClose: number;
};

export type HistoricalReactionAnchorStatus = "verified" | "unverified";

export type ShockHistoricalOutcomeRecord = {
  caseId: string;
  company: string;
  code: string;
  market: ShockMarket;
  benchmark: string;
  eventDate: string;
  reactionStartDate: string;
  reactionAnchorStatus: HistoricalReactionAnchorStatus;
  reactionAnchorTradingDayObserved: boolean;
  checkpoint: string;
  score: number;
  label: string;
  strategyEligibilityAtCheckpoint: HistoricalStrategyEligibilityStatus;
  thresholdCalibrationEligibilityAtCheckpoint?: HistoricalStrategyEligibilityStatus;
  baseDate: string | null;
  basePrice: number | null;
  preEventDate: string | null;
  preEventPrice: number | null;
  shockLowDate: string | null;
  shockLowPrice: number | null;
  shockDrawdownPct: number | null;
  return1w: number | null;
  return1m: number | null;
  return3m: number | null;
  return1y: number | null;
  benchmarkRelative1w: number | null;
  benchmarkRelative1m: number | null;
  benchmarkRelative3m: number | null;
  benchmarkRelative1y: number | null;
  firstEligibleSignalDate: string | null;
  firstEligibleSignalPrice: number | null;
  signalShockDrawdownPct: number | null;
  signalRelativeShockDrawdownPct: number | null;
  signalReturn1w: number | null;
  signalReturn1m: number | null;
  signalReturn3m: number | null;
  signalReturn1y: number | null;
  signalBenchmarkRelative1w: number | null;
  signalBenchmarkRelative1m: number | null;
  signalBenchmarkRelative3m: number | null;
  signalBenchmarkRelative1y: number | null;
  calibrationFirstEligibleSignalDate?: string | null;
  calibrationFirstEligibleSignalPrice?: number | null;
  calibrationSignalShockDrawdownPct?: number | null;
  calibrationSignalRelativeShockDrawdownPct?: number | null;
  calibrationSignalReturn1w?: number | null;
  calibrationSignalReturn1m?: number | null;
  calibrationSignalReturn3m?: number | null;
  calibrationSignalReturn1y?: number | null;
  calibrationSignalBenchmarkRelative1w?: number | null;
  calibrationSignalBenchmarkRelative1m?: number | null;
  calibrationSignalBenchmarkRelative3m?: number | null;
  calibrationSignalBenchmarkRelative1y?: number | null;
  topixRelative1w: number | null;
  topixRelative1m: number | null;
  topixRelative3m: number | null;
  topixRelative1y: number | null;
  generatedAt: string;
};

export type ShockCalibrationBucket = {
  bucket: string;
  /** shadow eligibility PASS + replay-ready anchor。returnの分母ではなくsignal発生率の分母。 */
  eligibleCases: number;
  /** 実際にshadow First Eligible Signalが出た件数。 */
  cases: number;
  signalRate: number | null;
  n1m: number;
  avgReturn1m: number | null;
  medianReturn1m: number | null;
  positiveRate1m: number | null;
  avgBenchmarkRelative1m: number | null;
  avgTopixRelative1m: number | null;
  n3m: number;
  avgReturn3m: number | null;
  medianReturn3m: number | null;
  positiveRate3m: number | null;
  avgBenchmarkRelative3m: number | null;
  avgTopixRelative3m: number | null;
  n1y: number;
  avgReturn1y: number | null;
  positiveRate1y: number | null;
  avgBenchmarkRelative1y: number | null;
  avgTopixRelative1y: number | null;
};

function normalizedDate(value: string): string {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value.slice(0, 10);
}

function sortedQuotes(quotes: ShockOutcomeQuote[]): Array<ShockOutcomeQuote & { normalizedDate: string }> {
  return quotes
    .filter(row => Number.isFinite(row.AdjustmentClose) && row.AdjustmentClose > 0)
    .map(row => ({ ...row, normalizedDate: normalizedDate(row.Date) }))
    .sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));
}

function observations(quotes: ReturnType<typeof sortedQuotes>): PriceObservation[] {
  return quotes.map(row => ({ date: row.normalizedDate, close: row.AdjustmentClose }));
}

function onOrAfter(quotes: ReturnType<typeof sortedQuotes>, target: string) {
  return quotes.find(row => row.normalizedDate >= target) ?? null;
}

function onOrBefore(quotes: ReturnType<typeof sortedQuotes>, target: string) {
  return [...quotes].reverse().find(row => row.normalizedDate <= target) ?? null;
}

function hasQuoteOnDate(quotes: ReturnType<typeof sortedQuotes>, target: string): boolean {
  return quotes.some(row => row.normalizedDate === target);
}

function pct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0) return null;
  return ((to - from) / from) * 100;
}

function round(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(4));
}

function priceReturnFrom(quotes: ReturnType<typeof sortedQuotes>, baseDate: string, days: number): number | null {
  const base = onOrAfter(quotes, baseDate);
  const target = onOrAfter(quotes, addDaysJst(baseDate, days));
  return round(pct(base?.AdjustmentClose ?? null, target?.AdjustmentClose ?? null));
}

function relativeReturn(
  stockQuotes: ReturnType<typeof sortedQuotes>,
  benchmarkQuotes: ReturnType<typeof sortedQuotes>,
  baseDate: string,
  days: number,
): number | null {
  const stock = priceReturnFrom(stockQuotes, baseDate, days);
  const benchmark = priceReturnFrom(benchmarkQuotes, baseDate, days);
  return stock == null || benchmark == null ? null : round(stock - benchmark);
}

type SignalOutcome = {
  date: string | null;
  price: number | null;
  shockDrawdownPct: number | null;
  relativeShockDrawdownPct: number | null;
  return1w: number | null;
  return1m: number | null;
  return3m: number | null;
  return1y: number | null;
  benchmarkRelative1w: number | null;
  benchmarkRelative1m: number | null;
  benchmarkRelative3m: number | null;
  benchmarkRelative1y: number | null;
};

function buildSignalOutcome(input: {
  eligible: boolean;
  stockQuotes: ReturnType<typeof sortedQuotes>;
  benchmarkQuotes: ReturnType<typeof sortedQuotes>;
  reactionStartDate: string;
  checkpoint: string;
}): SignalOutcome {
  const signal = input.eligible
    ? findFirstEligibleShockSignal({
      stock: observations(input.stockQuotes),
      benchmark: observations(input.benchmarkQuotes),
      reactionStartDate: input.reactionStartDate,
      decisionCheckpoint: input.checkpoint,
    })
    : null;
  const date = signal?.signalDate ?? null;
  return {
    date,
    price: signal?.signalPrice ?? null,
    shockDrawdownPct: signal?.shockDrawdownPct ?? null,
    relativeShockDrawdownPct: signal?.relativeShockDrawdownPct ?? null,
    return1w: date ? priceReturnFrom(input.stockQuotes, date, 7) : null,
    return1m: date ? priceReturnFrom(input.stockQuotes, date, 30) : null,
    return3m: date ? priceReturnFrom(input.stockQuotes, date, 90) : null,
    return1y: date ? priceReturnFrom(input.stockQuotes, date, 365) : null,
    benchmarkRelative1w: date ? relativeReturn(input.stockQuotes, input.benchmarkQuotes, date, 7) : null,
    benchmarkRelative1m: date ? relativeReturn(input.stockQuotes, input.benchmarkQuotes, date, 30) : null,
    benchmarkRelative3m: date ? relativeReturn(input.stockQuotes, input.benchmarkQuotes, date, 90) : null,
    benchmarkRelative1y: date ? relativeReturn(input.stockQuotes, input.benchmarkQuotes, date, 365) : null,
  };
}

export function buildShockHistoricalOutcome(
  item: HistoricalShockCase,
  stockQuotesInput: ShockOutcomeQuote[],
  benchmarkQuotesInput: ShockOutcomeQuote[],
  generatedAt: string,
  options: {
    market?: ShockMarket;
    benchmarkLabel?: string;
    reactionStartDate?: string | null;
    reactionAnchorStatus?: HistoricalReactionAnchorStatus | null;
    strategyEligibilityAtCheckpoint?: HistoricalStrategyEligibilityStatus | null;
    thresholdCalibrationEligibilityAtCheckpoint?: HistoricalStrategyEligibilityStatus | null;
  } = {},
): ShockHistoricalOutcomeRecord | null {
  if (!item.ticker) return null;

  const market = options.market ?? inferShockMarket({ country: item.country, ticker: item.ticker });
  const benchmark = options.benchmarkLabel ?? shockBenchmarkLabel(market);
  const stockQuotes = sortedQuotes(stockQuotesInput);
  const benchmarkQuotes = sortedQuotes(benchmarkQuotesInput);
  const reactionStartDate = options.reactionStartDate ?? item.eventDate;
  const evidenceReactionAnchorStatus = options.reactionAnchorStatus ?? "unverified";
  const reactionAnchorTradingDayObserved = hasQuoteOnDate(stockQuotes, reactionStartDate)
    && hasQuoteOnDate(benchmarkQuotes, reactionStartDate);
  const reactionAnchorStatus: HistoricalReactionAnchorStatus = evidenceReactionAnchorStatus === "verified" && reactionAnchorTradingDayObserved
    ? "verified"
    : "unverified";
  const strategyEligibilityAtCheckpoint = options.strategyEligibilityAtCheckpoint ?? "unknown";
  const thresholdCalibrationEligibilityAtCheckpoint = options.thresholdCalibrationEligibilityAtCheckpoint ?? "unknown";
  const checkpoint = item.decisionCheckpoint;
  const base = onOrAfter(stockQuotes, checkpoint);
  if (!base) return null;

  const preEventTarget = addDaysJst(reactionStartDate, -1);
  const preEvent = onOrBefore(stockQuotes, preEventTarget);
  const shockWindowEnd = addDaysJst(reactionStartDate, DEFAULT_SHOCK_WINDOW_DAYS);
  const shockWindow = stockQuotes.filter(row => row.normalizedDate >= reactionStartDate && row.normalizedDate <= shockWindowEnd);
  const shockLow = shockWindow.length ? shockWindow.reduce((min, row) => row.AdjustmentClose < min.AdjustmentClose ? row : min) : null;

  const benchmarkRelative1w = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 7);
  const benchmarkRelative1m = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 30);
  const benchmarkRelative3m = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 90);
  const benchmarkRelative1y = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 365);
  const anchorReady = reactionAnchorStatus === "verified";

  const productionSignal = buildSignalOutcome({
    eligible: anchorReady && strategyEligibilityAtCheckpoint === "confirmed_pass",
    stockQuotes,
    benchmarkQuotes,
    reactionStartDate,
    checkpoint,
  });
  const calibrationSignal = buildSignalOutcome({
    eligible: anchorReady && thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass",
    stockQuotes,
    benchmarkQuotes,
    reactionStartDate,
    checkpoint,
  });
  const isJp = market === "JP";

  return {
    caseId: item.id,
    company: item.company,
    code: item.ticker,
    market,
    benchmark,
    eventDate: item.eventDate,
    reactionStartDate,
    reactionAnchorStatus,
    reactionAnchorTradingDayObserved,
    checkpoint,
    score: item.score,
    label: item.label,
    strategyEligibilityAtCheckpoint,
    thresholdCalibrationEligibilityAtCheckpoint,
    baseDate: base.normalizedDate,
    basePrice: base.AdjustmentClose,
    preEventDate: preEvent?.normalizedDate ?? null,
    preEventPrice: preEvent?.AdjustmentClose ?? null,
    shockLowDate: shockLow?.normalizedDate ?? null,
    shockLowPrice: shockLow?.AdjustmentClose ?? null,
    shockDrawdownPct: round(pct(preEvent?.AdjustmentClose ?? null, shockLow?.AdjustmentClose ?? null)),
    return1w: priceReturnFrom(stockQuotes, checkpoint, 7),
    return1m: priceReturnFrom(stockQuotes, checkpoint, 30),
    return3m: priceReturnFrom(stockQuotes, checkpoint, 90),
    return1y: priceReturnFrom(stockQuotes, checkpoint, 365),
    benchmarkRelative1w,
    benchmarkRelative1m,
    benchmarkRelative3m,
    benchmarkRelative1y,
    firstEligibleSignalDate: productionSignal.date,
    firstEligibleSignalPrice: productionSignal.price,
    signalShockDrawdownPct: productionSignal.shockDrawdownPct,
    signalRelativeShockDrawdownPct: productionSignal.relativeShockDrawdownPct,
    signalReturn1w: productionSignal.return1w,
    signalReturn1m: productionSignal.return1m,
    signalReturn3m: productionSignal.return3m,
    signalReturn1y: productionSignal.return1y,
    signalBenchmarkRelative1w: productionSignal.benchmarkRelative1w,
    signalBenchmarkRelative1m: productionSignal.benchmarkRelative1m,
    signalBenchmarkRelative3m: productionSignal.benchmarkRelative3m,
    signalBenchmarkRelative1y: productionSignal.benchmarkRelative1y,
    calibrationFirstEligibleSignalDate: calibrationSignal.date,
    calibrationFirstEligibleSignalPrice: calibrationSignal.price,
    calibrationSignalShockDrawdownPct: calibrationSignal.shockDrawdownPct,
    calibrationSignalRelativeShockDrawdownPct: calibrationSignal.relativeShockDrawdownPct,
    calibrationSignalReturn1w: calibrationSignal.return1w,
    calibrationSignalReturn1m: calibrationSignal.return1m,
    calibrationSignalReturn3m: calibrationSignal.return3m,
    calibrationSignalReturn1y: calibrationSignal.return1y,
    calibrationSignalBenchmarkRelative1w: calibrationSignal.benchmarkRelative1w,
    calibrationSignalBenchmarkRelative1m: calibrationSignal.benchmarkRelative1m,
    calibrationSignalBenchmarkRelative3m: calibrationSignal.benchmarkRelative3m,
    calibrationSignalBenchmarkRelative1y: calibrationSignal.benchmarkRelative1y,
    topixRelative1w: isJp ? benchmarkRelative1w : null,
    topixRelative1m: isJp ? benchmarkRelative1m : null,
    topixRelative3m: isJp ? benchmarkRelative3m : null,
    topixRelative1y: isJp ? benchmarkRelative1y : null,
    generatedAt,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return round(value);
}

function positiveRate(values: number[]): number | null {
  if (values.length === 0) return null;
  return round((values.filter(value => value > 0).length / values.length) * 100);
}

function calibrationValues(records: ShockHistoricalOutcomeRecord[], key: keyof ShockHistoricalOutcomeRecord): number[] {
  return records
    .filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified" && Boolean(row.calibrationFirstEligibleSignalDate))
    .map(row => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function calibrationBucket(bucket: string, records: ShockHistoricalOutcomeRecord[]): ShockCalibrationBucket {
  const eligible = records.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified");
  const signaled = eligible.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  const r1m = calibrationValues(signaled, "calibrationSignalReturn1m");
  const rel1m = calibrationValues(signaled, "calibrationSignalBenchmarkRelative1m");
  const r3m = calibrationValues(signaled, "calibrationSignalReturn3m");
  const rel3m = calibrationValues(signaled, "calibrationSignalBenchmarkRelative3m");
  const r1y = calibrationValues(signaled, "calibrationSignalReturn1y");
  const rel1y = calibrationValues(signaled, "calibrationSignalBenchmarkRelative1y");
  const avgBenchmarkRelative1m = average(rel1m);
  const avgBenchmarkRelative3m = average(rel3m);
  const avgBenchmarkRelative1y = average(rel1y);
  const signalRate = eligible.length === 0 ? null : round((signaled.length / eligible.length) * 100);
  return {
    bucket,
    eligibleCases: eligible.length,
    cases: signaled.length,
    signalRate,
    n1m: r1m.length,
    avgReturn1m: average(r1m),
    medianReturn1m: median(r1m),
    positiveRate1m: positiveRate(r1m),
    avgBenchmarkRelative1m,
    avgTopixRelative1m: avgBenchmarkRelative1m,
    n3m: r3m.length,
    avgReturn3m: average(r3m),
    medianReturn3m: median(r3m),
    positiveRate3m: positiveRate(r3m),
    avgBenchmarkRelative3m,
    avgTopixRelative3m: avgBenchmarkRelative3m,
    n1y: r1y.length,
    avgReturn1y: average(r1y),
    positiveRate1y: positiveRate(r1y),
    avgBenchmarkRelative1y,
    avgTopixRelative1y: avgBenchmarkRelative1y,
  };
}

export function calibrateShockThresholds(records: ShockHistoricalOutcomeRecord[]): ShockCalibrationBucket[] {
  const buckets: Array<[string, (row: ShockHistoricalOutcomeRecord) => boolean]> = [
    ["all", () => true],
    ["score_16_20", row => row.score >= 16],
    ["score_12_15", row => row.score >= 12 && row.score < 16],
    ["score_ge_12", row => row.score >= 12],
    ["score_8_11", row => row.score >= 8 && row.score < 12],
    ["score_0_7", row => row.score < 8],
    ["score_lt_12", row => row.score < 12],
  ];
  return buckets.map(([name, predicate]) => calibrationBucket(name, records.filter(predicate)));
}

export function outcomeFetchRangeIso(item: HistoricalShockCase, generatedAt: string): { from: string; to: string } {
  const from = addDaysJst(item.eventDate, -10);
  const desiredTo = addDaysJst(item.decisionCheckpoint, DEFAULT_SIGNAL_SEARCH_DAYS + 380);
  const to = desiredTo < generatedAt ? desiredTo : generatedAt;
  return { from, to };
}

export function outcomeFetchRange(item: HistoricalShockCase, generatedAt: string): { from: string; to: string } {
  const range = outcomeFetchRangeIso(item, generatedAt);
  return { from: toCompactDate(range.from), to: toCompactDate(range.to) };
}
