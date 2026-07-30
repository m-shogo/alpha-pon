import { addDaysJst, toCompactDate } from "./date.js";
import { DEFAULT_SHOCK_WINDOW_DAYS, type HistoricalShockCase } from "./idiosyncratic-shock.js";
import { inferShockMarket, shockBenchmarkLabel, type ShockMarket } from "./idiosyncratic-shock-market.js";

export type ShockOutcomeQuote = {
  Date: string;
  AdjustmentClose: number;
};

export type ShockHistoricalOutcomeRecord = {
  caseId: string;
  company: string;
  code: string;
  market: ShockMarket;
  benchmark: string;
  eventDate: string;
  checkpoint: string;
  score: number;
  label: string;
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
  /** @deprecated JP互換。海外ではnull。新規コードはbenchmarkRelative*を使う。 */
  topixRelative1w: number | null;
  /** @deprecated JP互換。海外ではnull。新規コードはbenchmarkRelative*を使う。 */
  topixRelative1m: number | null;
  /** @deprecated JP互換。海外ではnull。新規コードはbenchmarkRelative*を使う。 */
  topixRelative3m: number | null;
  /** @deprecated JP互換。海外ではnull。新規コードはbenchmarkRelative*を使う。 */
  topixRelative1y: number | null;
  generatedAt: string;
};

export type ShockCalibrationBucket = {
  bucket: string;
  cases: number;
  n1m: number;
  avgReturn1m: number | null;
  medianReturn1m: number | null;
  positiveRate1m: number | null;
  avgBenchmarkRelative1m: number | null;
  /** @deprecated compatibility alias */
  avgTopixRelative1m: number | null;
  n3m: number;
  avgReturn3m: number | null;
  medianReturn3m: number | null;
  positiveRate3m: number | null;
  avgBenchmarkRelative3m: number | null;
  /** @deprecated compatibility alias */
  avgTopixRelative3m: number | null;
  n1y: number;
  avgReturn1y: number | null;
  positiveRate1y: number | null;
  avgBenchmarkRelative1y: number | null;
  /** @deprecated compatibility alias */
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

function onOrAfter(quotes: ReturnType<typeof sortedQuotes>, target: string) {
  return quotes.find(row => row.normalizedDate >= target) ?? null;
}

function onOrBefore(quotes: ReturnType<typeof sortedQuotes>, target: string) {
  return [...quotes].reverse().find(row => row.normalizedDate <= target) ?? null;
}

function pct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0) return null;
  return ((to - from) / from) * 100;
}

function round(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(4));
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function priceReturnFrom(
  quotes: ReturnType<typeof sortedQuotes>,
  baseDate: string,
  days: number,
): number | null {
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

export function buildShockHistoricalOutcome(
  item: HistoricalShockCase,
  stockQuotesInput: ShockOutcomeQuote[],
  benchmarkQuotesInput: ShockOutcomeQuote[],
  generatedAt: string,
  options: { market?: ShockMarket; benchmarkLabel?: string } = {},
): ShockHistoricalOutcomeRecord | null {
  if (!item.ticker) return null;

  const market = options.market ?? inferShockMarket({ country: item.country, ticker: item.ticker });
  const benchmark = options.benchmarkLabel ?? shockBenchmarkLabel(market);
  const stockQuotes = sortedQuotes(stockQuotesInput);
  const benchmarkQuotes = sortedQuotes(benchmarkQuotesInput);
  const checkpoint = item.decisionCheckpoint;
  const base = onOrAfter(stockQuotes, checkpoint);
  if (!base) return null;

  const preEventTarget = addDaysJst(item.eventDate, -1);
  const preEvent = onOrBefore(stockQuotes, preEventTarget);
  const shockWindowEnd = minDate(item.decisionCheckpoint, addDaysJst(item.eventDate, DEFAULT_SHOCK_WINDOW_DAYS));
  const shockWindow = stockQuotes.filter(row => row.normalizedDate >= item.eventDate && row.normalizedDate <= shockWindowEnd);
  const shockLow = shockWindow.length
    ? shockWindow.reduce((min, row) => row.AdjustmentClose < min.AdjustmentClose ? row : min)
    : null;

  const benchmarkRelative1w = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 7);
  const benchmarkRelative1m = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 30);
  const benchmarkRelative3m = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 90);
  const benchmarkRelative1y = relativeReturn(stockQuotes, benchmarkQuotes, checkpoint, 365);
  const isJp = market === "JP";

  return {
    caseId: item.id,
    company: item.company,
    code: item.ticker,
    market,
    benchmark,
    eventDate: item.eventDate,
    checkpoint,
    score: item.score,
    label: item.label,
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

function values(records: ShockHistoricalOutcomeRecord[], key: keyof ShockHistoricalOutcomeRecord): number[] {
  return records
    .map(row => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function calibrationBucket(bucket: string, records: ShockHistoricalOutcomeRecord[]): ShockCalibrationBucket {
  const r1m = values(records, "return1m");
  const rel1m = values(records, "benchmarkRelative1m");
  const r3m = values(records, "return3m");
  const rel3m = values(records, "benchmarkRelative3m");
  const r1y = values(records, "return1y");
  const rel1y = values(records, "benchmarkRelative1y");
  const avgBenchmarkRelative1m = average(rel1m);
  const avgBenchmarkRelative3m = average(rel3m);
  const avgBenchmarkRelative1y = average(rel1y);
  return {
    bucket,
    cases: records.length,
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
  const desiredTo = addDaysJst(item.decisionCheckpoint, 380);
  const to = desiredTo < generatedAt ? desiredTo : generatedAt;
  return { from, to };
}

export function outcomeFetchRange(item: HistoricalShockCase, generatedAt: string): { from: string; to: string } {
  const range = outcomeFetchRangeIso(item, generatedAt);
  return { from: toCompactDate(range.from), to: toCompactDate(range.to) };
}
