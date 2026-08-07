import type { PitPriceRecord } from "../price-store.js";

export interface JQuantsFreeRecordOutput {
  seriesKind: PitPriceRecord["seriesKind"];
  code: string;
  market: string;
  tradingDate: string;
  dataAsOf: string;
  observedAt: string;
  retrievedAt: string;
  firstExecutableAt: string;
  source: string;
  sourceVersion: string;
  providerPlan: PitPriceRecord["providerPlan"];
  delayDays: number;
  isDelayed: boolean;
  status: PitPriceRecord["status"];
  missingReason?: PitPriceRecord["missingReason"];
  adjusted: boolean;
  license: PitPriceRecord["license"];
  contentHash: string;
  valuesIncluded: boolean;
  ohlcv?: PitPriceRecord["ohlcv"];
}

/**
 * Console/report boundary for licensed J-Quants rows.
 * Raw OHLCV is omitted unless the local caller explicitly opts in.
 */
export function jquantsFreeRecordOutput(
  record: PitPriceRecord,
  includeValues = false,
): JQuantsFreeRecordOutput {
  return {
    seriesKind: record.seriesKind,
    code: record.code,
    market: record.market,
    tradingDate: record.tradingDate,
    dataAsOf: record.dataAsOf,
    observedAt: record.observedAt,
    retrievedAt: record.retrievedAt,
    firstExecutableAt: record.firstExecutableAt,
    source: record.source,
    sourceVersion: record.sourceVersion,
    providerPlan: record.providerPlan,
    delayDays: record.delayDays,
    isDelayed: record.isDelayed,
    status: record.status,
    ...(record.missingReason ? { missingReason: record.missingReason } : {}),
    adjusted: record.adjusted,
    license: record.license,
    contentHash: record.contentHash,
    valuesIncluded: includeValues,
    ...(includeValues && record.ohlcv ? { ohlcv: record.ohlcv } : {}),
  };
}
