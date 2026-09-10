import {
  fetchDailyQuotes,
  fetchDailyQuotesByDate,
  isJQuantsConfigured,
  type DailyQuote,
} from "../../fetcher/jquants.js";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../iso-instant.js";
import {
  withAdjustmentHash,
  type JQuantsAdjustmentEvent,
} from "./jquants-adjustment-events.js";
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
type DateQuoteFetcher = (date: string) => Promise<DailyQuote[] | null>;

export type JQuantsFirstExecutableAtResolver = (input: {
  code: string;
  tradingDate: string;
  dataAsOf: string;
  observedAt: string;
  retrievedAt: string;
}) => string;

export interface JQuantsFreeProviderOptions {
  fetchQuotes?: QuoteFetcher;
  fetchQuotesByDate?: DateQuoteFetcher;
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
  return `${delayedDate}T23:59:59.999999999+09:00`;
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
    // Measured 2026-09-11 against the live API: every non-traded row came back
    // with O/H/L/C/Vo all null, at a steady 3.4-4.1% of the ~4,400 codes per
    // day. `normalizeV2Quote` folds those nulls to zero, so an all-zero bar is
    // how "the exchange published no bar for this listed security" reaches us.
    //
    // `no_execution` states what is certain (nothing traded) without inventing
    // a cause. A halt also produces no execution, so this does not deny one;
    // the API cannot distinguish them here, and `exchange_suspension` would be
    // a claim we cannot support.
    //
    // Before this was measured the code returned `missing`/`unknown`, a pairing
    // `validatePriceRecordHardening` rejects outright.
    const allZero = quote.Open === 0 && quote.High === 0 && quote.Low === 0 && quote.Close === 0;
    if (allZero && quote.Volume === 0) {
      return { status: "no_trade", missingReason: "no_execution" };
    }
    // Prices present but internally inconsistent (High below Low, negative
    // volume, ...). The provider answered with something unusable.
    return { status: "missing", missingReason: "provider_gap" };
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

/**
 * Outcome of one whole-market trading-day fetch.
 *
 * `outcome` deliberately separates the three states a caller must not conflate:
 * - `entitled_rows`   the plan covers the date and the market produced bars
 * - `entitled_empty`  the plan covers the date and the API returned no bars
 *                     (market closed, or an upstream gap — this adapter cannot
 *                     tell those apart and does not guess)
 * - `not_entitled`    the date is outside the plan window; nothing was asked
 */
export type JQuantsUniverseOutcome = "entitled_rows" | "entitled_empty" | "not_entitled";

export interface JQuantsUniverseBatch extends PriceProviderBatch {
  tradingDate: string;
  outcome: JQuantsUniverseOutcome;
  /** Codes the API returned for the date, canonicalized and sorted. */
  universe: string[];
  /** Rows dropped because their observedAt is later than `asOf`. */
  withheldForAsOf: number;
  /**
   * Ex-date adjustments observed on this trading date (`AdjFactor != 1`).
   *
   * Kept out of the price records on purpose: an unadjusted row must carry
   * `adjustmentFactor: 1`, and embedding `corporateActions` breaks the
   * unadjusted-only measurement path. See `jquants-adjustment-events.ts`.
   */
  adjustments: JQuantsAdjustmentEvent[];
}

export class JQuantsFreePriceProvider implements PriceProvider {
  readonly id = JQUANTS_FREE_PROVIDER_ID;
  readonly license: PriceDataLicense;
  readonly capabilities: PriceProviderCapabilities;

  private readonly fetchQuotes: QuoteFetcher;
  private readonly fetchQuotesByDate: DateQuoteFetcher;
  private readonly now: () => Date;
  private readonly resolveFirstExecutableAt: JQuantsFirstExecutableAtResolver;
  private readonly sourceVersion: string;

  constructor(options: JQuantsFreeProviderOptions) {
    this.fetchQuotes = options.fetchQuotes ?? fetchDailyQuotes;
    this.fetchQuotesByDate = options.fetchQuotesByDate ?? ((date) => fetchDailyQuotesByDate(date));
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

    parseExplicitIso8601Instant(query.asOf, "query.asOf");
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
      if (compareExplicitIso8601Instants(observedAt, query.asOf, "observedAt", "query.asOf") > 0) {
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

  /**
   * Fetch every security that traded on one date with a single API request.
   *
   * This is the ingestion path for building history: the J-Quants burst quota
   * makes per-code fetching (~4,400 requests per day of history) impossible,
   * while per-date fetching needs one.
   */
  async fetchDailyUniverse(input: { tradingDate: string; asOf: string }): Promise<JQuantsUniverseBatch> {
    parseExplicitIso8601Instant(input.asOf, "asOf");
    const tradingDate = normalizeDate(input.tradingDate);
    const retrievedAt = this.now().toISOString();
    const ingestionRunId = `jquants-free-universe:${tradingDate}:${retrievedAt}`;

    const base = {
      providerId: this.id,
      sourceVersion: this.sourceVersion,
      capabilities: this.capabilities,
      license: this.license,
      retrievedAt,
      tradingDate,
    };

    const quotes = await this.fetchQuotesByDate(tradingDate);
    if (quotes === null) {
      return {
        ...base,
        records: [],
        outcome: "not_entitled",
        universe: [],
        withheldForAsOf: 0,
        adjustments: [],
      };
    }

    const observedAt = jquantsFreeObservedAt(tradingDate, this.capabilities.delayDays);
    if (compareExplicitIso8601Instants(observedAt, input.asOf, "observedAt", "asOf") > 0) {
      // The whole day is still inside the disclosure delay as of `asOf`.
      return {
        ...base,
        records: [],
        outcome: quotes.length > 0 ? "entitled_rows" : "entitled_empty",
        universe: [],
        withheldForAsOf: quotes.length,
        adjustments: [],
      };
    }

    const dataAsOf = jquantsTradingDayCloseJst(tradingDate);
    const firstExecutableAt = this.resolveFirstExecutableAt({
      code: "*",
      tradingDate,
      dataAsOf,
      observedAt,
      retrievedAt,
    });

    const seenCodes = new Set<string>();
    const records: PitPriceRecordInput[] = [];
    const adjustments: JQuantsAdjustmentEvent[] = [];
    for (const quote of quotes) {
      if (normalizeDate(quote.Date) !== tradingDate) {
        throw new Error(`J-Quants returned a row for ${quote.Date} while fetching ${tradingDate}`);
      }
      const code = canonicalStoreCode(quote.Code);
      if (seenCodes.has(code)) throw new Error(`duplicate J-Quants row for ${code} on ${tradingDate}`);
      seenCodes.add(code);

      // 権利落ちの観測。`normalizeV2Quote` は欠損を 1 に畳むため、
      // 「調整の情報が無い」は「調整が無い」として読まれる。
      // 実測（2026-09-11、4,371行）では全行に値が入っていた。
      const factor = quote.AdjustmentFactor;
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new Error(`invalid AdjustmentFactor for ${code} on ${tradingDate}: ${factor}`);
      }
      if (factor !== 1) {
        adjustments.push(withAdjustmentHash({
          schemaVersion: 1,
          code,
          effectiveDate: tradingDate,
          factor,
          source: "jquants",
          sourceVersion: this.sourceVersion,
          observedAt,
          retrievedAt,
        }));
      }

      records.push(mapJQuantsFreeQuote({
        requestedCode: code,
        quote,
        retrievedAt,
        firstExecutableAt,
        ingestionRunId,
        delayDays: this.capabilities.delayDays,
        license: this.license,
        sourceVersion: this.sourceVersion,
      }));
    }

    records.sort((left, right) => left.code.localeCompare(right.code));
    adjustments.sort((left, right) => left.code.localeCompare(right.code));
    return {
      ...base,
      records,
      outcome: records.length > 0 ? "entitled_rows" : "entitled_empty",
      universe: records.map((record) => record.code),
      withheldForAsOf: 0,
      adjustments,
    };
  }
}

export function isJQuantsFreeConfigured(): boolean {
  return isJQuantsConfigured();
}
