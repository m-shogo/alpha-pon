import {
  fetchDailyQuotes,
  isJQuantsConfigured,
  type DailyQuote,
} from "../../fetcher/jquants.js";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../iso-instant.js";
import type {
  MissingPriceReason,
  PitPriceRecordInput,
  PriceDataLicense,
  PriceProvider,
  PriceProviderBatch,
  PriceProviderCapabilities,
  PriceProviderQuery,
  PriceRecordStatus,
} from "../price-store.js";

export const JQUANTS_FREE_PROVIDER_ID = "jquants-free";
export const JQUANTS_FREE_SOURCE_VERSION = "jquants-free-unadjusted-v1";
export const JQUANTS_FREE_DELAY_DAYS = 84;
export const JQUANTS_FREE_HISTORY_WINDOW_YEARS = 2;

export const JQUANTS_FREE_ENTITLEMENT = {
  plan: "free" as const,
  delayWeeks: 12,
  delayDays: JQUANTS_FREE_DELAY_DAYS,
  historyWindowYears: JQUANTS_FREE_HISTORY_WINDOW_YEARS,
  stockOhlc: true,
  topix: false,
  indices: false,
  redistributionAllowed: false,
  verifiedAt: "2026-08-07",
  source: "JPX J-Quants pricing/FAQ",
} as const;

type QuoteFetcher = (code: string, from: string, to: string) => Promise<DailyQuote[]>;

export type JQuantsFirstExecutableAtResolver = (input: {
  code: string;
  tradingDate: string;
  dataAsOf: string;
  observedAt: string;
  retrievedAt: string;
}) => string;

export interface JQuantsFreeProviderOptions {
  fetchQuotes?: QuoteFetcher;
  now?: () => Date;
  resolveFirstExecutableAt: JQuantsFirstExecutableAtResolver;
  delayDays?: number;
  license?: PriceDataLicense;
  sourceVersion?: string;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function normalizeDate(value: string): string {
  const compact = /^\d{8}$/.test(value)
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value.replace(/-/g, "")
      : null;
  if (!compact) throw new Error(`invalid J-Quants trading date: ${value}`);
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!) {
    throw new Error(`invalid J-Quants trading date: ${value}`);
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function addCalendarDaysJst(date: string, days: number): string {
  if (!Number.isSafeInteger(days) || days < 0) throw new Error(`invalid J-Quants delayDays: ${days}`);
  const base = new Date(`${date}T12:00:00+09:00`);
  const shifted = new Date(base.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/**
 * TSE cash-market closing boundary. Trading was extended from 15:00 to 15:30 JST
 * on 2024-11-05. Free-plan rolling history currently spans both regimes.
 */
export function jquantsTradingDayCloseJst(tradingDate: string): string {
  const date = normalizeDate(tradingDate);
  const close = date >= "2024-11-05" ? "15:30:00" : "15:00:00";
  return `${date}T${close}+09:00`;
}

/**
 * J-Quants documents the Free plan as 12 weeks delayed but does not promise a
 * precise intraday publication instant on the entitlement page. Use end-of-day
 * JST as the conservative availability boundary rather than backdating it.
 */
export function jquantsFreeObservedAt(tradingDate: string, delayDays = JQUANTS_FREE_DELAY_DAYS): string {
  const date = normalizeDate(tradingDate);
  const delayedDate = addCalendarDaysJst(date, delayDays);
  return `${delayedDate}T23:59:59+09:00`;
}

function canonicalStoreCode(code: string): string {
  const result = code.trim().toUpperCase().replace(/\.T$/, "");
  if (!/^[0-9A-Z]{4,5}$/.test(result)) throw new Error(`invalid security code: ${code}`);
  return result;
}

function comparisonCode(code: string): string {
  const result = canonicalStoreCode(code);
  return result.length === 5 && result.endsWith("0") ? result.slice(0, -1) : result;
}

function assertQuoteMatchesCode(requestedCode: string, quoteCode: string): void {
  if (comparisonCode(requestedCode) !== comparisonCode(quoteCode)) {
    throw new Error(`J-Quants quote code mismatch: requested=${requestedCode} quote=${quoteCode}`);
  }
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function classifyQuote(quote: DailyQuote): {
  status: PriceRecordStatus;
  missingReason?: MissingPriceReason;
  ohlcv?: PitPriceRecordInput["ohlcv"];
} {
  const traded = [quote.Open, quote.High, quote.Low, quote.Close].every(finitePositive)
    && Number.isSafeInteger(quote.Volume)
    && quote.Volume >= 0
    && quote.High >= Math.max(quote.Open, quote.Close, quote.Low)
    && quote.Low <= Math.min(quote.Open, quote.Close, quote.High);

  if (!traded) {
    // V2 normalization currently converts null OHLC fields to zero. Until real
    // Free-plan missing/suspension cases are measured, do not invent a cause.
    return { status: "missing", missingReason: "unknown" };
  }

  return {
    status: "traded",
    ohlcv: {
      open: quote.Open,
      high: quote.High,
      low: quote.Low,
      close: quote.Close,
      volume: quote.Volume,
    },
  };
}

function assertTimestampAtOrAfter(
  value: string,
  boundary: string,
  field: string,
  boundaryField: string,
): void {
  if (compareExplicitIso8601Instants(value, boundary, field, boundaryField) < 0) {
    throw new Error(`${field} must be at or after ${boundaryField}`);
  }
}

export function mapJQuantsFreeQuote(input: {
  requestedCode: string;
  quote: DailyQuote;
  retrievedAt: string;
  firstExecutableAt: string;
  ingestionRunId: string;
  delayDays?: number;
  license?: PriceDataLicense;
  sourceVersion?: string;
}): PitPriceRecordInput {
  const code = canonicalStoreCode(input.requestedCode);
  assertQuoteMatchesCode(code, input.quote.Code);
  const tradingDate = normalizeDate(input.quote.Date);
  const delayDays = input.delayDays ?? JQUANTS_FREE_DELAY_DAYS;
  const observedAt = jquantsFreeObservedAt(tradingDate, delayDays);
  if (compareExplicitIso8601Instants(input.retrievedAt, observedAt, "retrievedAt", "observedAt") < 0) {
    throw new Error("retrievedAt must be at or after the Free-plan observedAt boundary");
  }
  assertTimestampAtOrAfter(input.firstExecutableAt, input.retrievedAt, "firstExecutableAt", "retrievedAt");
  const classified = classifyQuote(input.quote);

  return {
    schemaVersion: 1,
    seriesKind: "security",
    code,
    market: "TSE",
    tradingDate,
    dataAsOf: jquantsTradingDayCloseJst(tradingDate),
    observedAt,
    retrievedAt: input.retrievedAt,
    firstExecutableAt: input.firstExecutableAt,
    source: "jquants",
    sourceVersion: input.sourceVersion ?? JQUANTS_FREE_SOURCE_VERSION,
    providerPlan: "free",
    delayDays,
    isDelayed: delayDays > 0,
    ingestionRunId: input.ingestionRunId,
    currency: "JPY",
    status: classified.status,
    ...(classified.missingReason ? { missingReason: classified.missingReason } : {}),
    ...(classified.ohlcv ? { ohlcv: classified.ohlcv } : {}),
    // PIT v1 intentionally stores raw/unadjusted bars only. J-Quants adjusted
    // values can be retroactively rewritten by later corporate actions.
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: input.license ?? "local_only",
  };
}

export function jquantsFreeCapabilities(delayDays = JQUANTS_FREE_DELAY_DAYS): PriceProviderCapabilities {
  return {
    plan: "free",
    delayDays,
    supportsAdjusted: false,
    supportsUnadjusted: true,
    supportsCorporateActions: false,
    supportsBenchmarks: false,
    supportsSectorBenchmarks: false,
  };
}

export class JQuantsFreePriceProvider implements PriceProvider {
  readonly id = JQUANTS_FREE_PROVIDER_ID;
  readonly license: PriceDataLicense;
  readonly capabilities: PriceProviderCapabilities;

  private readonly fetchQuotes: QuoteFetcher;
  private readonly now: () => Date;
  private readonly resolveFirstExecutableAt: JQuantsFirstExecutableAtResolver;
  private readonly sourceVersion: string;

  constructor(options: JQuantsFreeProviderOptions) {
    this.fetchQuotes = options.fetchQuotes ?? fetchDailyQuotes;
    this.now = options.now ?? (() => new Date());
    this.resolveFirstExecutableAt = options.resolveFirstExecutableAt;
    this.license = options.license ?? "local_only";
    this.sourceVersion = options.sourceVersion ?? JQUANTS_FREE_SOURCE_VERSION;
    this.capabilities = jquantsFreeCapabilities(options.delayDays ?? JQUANTS_FREE_DELAY_DAYS);
  }

  async fetchDaily(query: PriceProviderQuery): Promise<PriceProviderBatch> {
    if (query.seriesKind !== "security") {
      throw new Error("J-Quants Free does not provide benchmark series through this adapter");
    }
    if (query.plan && query.plan !== "free") {
      throw new Error(`J-Quants Free provider cannot satisfy plan=${query.plan}`);
    }
    if (query.codes.length !== 1) {
      throw new Error("J-Quants Free fetchDaily accepts exactly one security code per call");
    }

    const queryAsOfMs = parseExplicitIso8601Instant(query.asOf, "query.asOf");
    const requestedCode = canonicalStoreCode(query.codes[0]!);
    const from = normalizeDate(query.from);
    const to = normalizeDate(query.to);
    if (from > to) {
      throw new Error(`invalid J-Quants query range: from=${query.from} to=${query.to}`);
    }

    const quotes = await this.fetchQuotes(requestedCode, from, to);
    const retrievedAt = this.now().toISOString();
    const seenDates = new Set<string>();
    const ingestionRunId = `jquants-free:${requestedCode}:${from}:${to}:${retrievedAt}`;
    const records: PitPriceRecordInput[] = [];

    for (const quote of quotes) {
      const tradingDate = normalizeDate(quote.Date);
      if (tradingDate < from || tradingDate > to) {
        throw new Error(`J-Quants returned out-of-range row: ${tradingDate}`);
      }
      if (seenDates.has(tradingDate)) throw new Error(`duplicate J-Quants row for ${tradingDate}`);
      seenDates.add(tradingDate);

      const dataAsOf = jquantsTradingDayCloseJst(tradingDate);
      const observedAt = jquantsFreeObservedAt(tradingDate, this.capabilities.delayDays);
      if (parseExplicitIso8601Instant(observedAt, "observedAt") > queryAsOfMs) {
        continue;
      }

      const firstExecutableAt = this.resolveFirstExecutableAt({
        code: requestedCode,
        tradingDate,
        dataAsOf,
        observedAt,
        retrievedAt,
      });
      records.push(mapJQuantsFreeQuote({
        requestedCode,
        quote,
        retrievedAt,
        firstExecutableAt,
        ingestionRunId,
        delayDays: this.capabilities.delayDays,
        license: this.license,
        sourceVersion: this.sourceVersion,
      }));
    }

    records.sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
    return {
      providerId: this.id,
      sourceVersion: this.sourceVersion,
      capabilities: this.capabilities,
      license: this.license,
      retrievedAt,
      records,
    };
  }
}

export function isJQuantsFreeConfigured(): boolean {
  return isJQuantsConfigured();
}
