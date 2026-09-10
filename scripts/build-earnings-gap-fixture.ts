// 決算ギャップ配管の end-to-end 用 fixture を生成する。
//
//   node --import tsx/esm scripts/build-earnings-gap-fixture.ts
//
// このfixtureは**合成データ**であり、実在の銘柄・実際の相場ではない。
// 目的は「signal生成 → bundle組立 → backtest実行」の配管が通ることの確認だけ。
// 収益性の証拠として使ってはいけない。価格系列は決定論的な擬似乱数で作っており、
// Edgeが存在するように仕込んでいない。

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BacktestSpec } from "../src/research/backtest.js";
import { withPriceRecordHash, type PitPriceRecord } from "../src/research/price-store.js";
import {
  buildBacktestBundle,
  type BundleSourceSelector,
} from "../src/research/signals/backtest-bundle.js";
import {
  corporateActionDatesFromPriceRecords,
  generateEarningsGapSignals,
  type EarningsDisclosureInput,
} from "../src/research/signals/earnings-gap.js";

const OUT_PATH = resolve(process.cwd(), "research/fixtures/backtests/synthetic-earnings-gap.json");
const AS_OF = "2027-01-01T00:00:00+09:00";
const BENCHMARK_CODE = "9999";
const SELECTOR: BundleSourceSelector = { market: "SYNTH", source: "synthetic", providerPlan: "synthetic" };

/** 決定論的な線形合同法。外部依存を持たず、再実行で同じfixtureを再現する。 */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** 土日を飛ばした連続営業日。祝日は考慮しない（合成データのため）。 */
function businessDays(start: string, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function priceRecord(input: {
  code: string;
  tradingDate: string;
  seriesKind: "security" | "benchmark";
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): PitPriceRecord {
  const stamp = `${input.tradingDate}T15:30:00+09:00`;
  return withPriceRecordHash({
    schemaVersion: 1,
    seriesKind: input.seriesKind,
    code: input.code,
    market: "SYNTH",
    tradingDate: input.tradingDate,
    dataAsOf: stamp,
    observedAt: stamp,
    retrievedAt: stamp,
    firstExecutableAt: stamp,
    source: "synthetic",
    sourceVersion: "synthetic-earnings-gap-v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "synthetic-earnings-gap-fixture",
    currency: "JPY",
    status: "traded",
    ohlcv: {
      open: input.open,
      high: input.high,
      low: input.low,
      close: input.close,
      volume: input.volume,
    },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: "redistributable",
  });
}

const DATES = businessDays("2026-01-05", 70);
const CODES = Array.from({ length: 12 }, (_, index) => String(9001 + index));

/** 開示の翌営業日にだけ shockPct を効かせた価格系列を作る。それ以外は擬似乱数のドリフト。 */
function buildSeries(
  code: string,
  seed: number,
  shocks: Map<string, number>,
  seriesKind: "security" | "benchmark",
): PitPriceRecord[] {
  const random = lcg(seed);
  const records: PitPriceRecord[] = [];
  let close = 1000 + (seed % 500);

  for (const date of DATES) {
    const previousClose = close;
    const shockPct = shocks.get(date);
    const driftPct = (random() - 0.5) * 2.4;
    const movePct = shockPct ?? driftPct;
    close = Math.max(1, Math.round(previousClose * (1 + movePct / 100) * 100) / 100);
    const open = shockPct === undefined
      ? previousClose
      : Math.round(previousClose * (1 + (movePct * 0.7) / 100) * 100) / 100;
    records.push(
      priceRecord({
        code,
        tradingDate: date,
        seriesKind,
        open,
        high: Math.max(open, close, previousClose) + 3,
        low: Math.max(1, Math.min(open, close) - 3),
        close,
        volume: 800_000 + ((seed * 7 + date.charCodeAt(9)) % 400_000),
      }),
    );
  }
  return records;
}

// 各銘柄2回の開示。1回目は baseline 用（会社予想の比較対象を作るため signal にはならない）。
const disclosures: EarningsDisclosureInput[] = [];
const shocksByCode = new Map<string, Map<string, number>>();

CODES.forEach((code, index) => {
  const firstDisclosureDate = DATES[10 + index];
  const secondDisclosureDate = DATES[40 + index];
  const reactionDate = DATES[41 + index];

  // 12銘柄のうち: 6件は深いギャップ+据え置き / 3件は深いギャップ+減額 / 3件は浅いギャップ。
  const deep = index < 9;
  const forecastCut = index >= 6 && index < 9;
  const shockPct = deep ? -9 - index * 0.4 : -2;

  shocksByCode.set(code, new Map([[reactionDate, shockPct]]));

  disclosures.push({
    code,
    disclosedDate: firstDisclosureDate,
    disclosedTime: "15:00",
    forecastOperatingProfit: 1000,
    typeOfDocument: "FYFinancialStatements_Consolidated_JP",
  });
  disclosures.push({
    code,
    disclosedDate: secondDisclosureDate,
    disclosedTime: "15:00",
    forecastOperatingProfit: forecastCut ? 700 : 1000,
    typeOfDocument: "2QFinancialStatements_Consolidated_JP",
  });
});

const securityRecords = new Map<string, PitPriceRecord[]>();
CODES.forEach((code, index) => {
  securityRecords.set(code, buildSeries(code, 1000 + index * 37, shocksByCode.get(code)!, "security"));
});
const benchmarkRecords = buildSeries(BENCHMARK_CODE, 77, new Map(), "benchmark");

const priceSeriesForSignals = new Map(
  [...securityRecords].map(([code, records]) => [
    code,
    {
      code,
      bars: records
        .filter((one) => one.status === "traded" && one.ohlcv)
        .map((one) => ({ date: one.tradingDate, ...one.ohlcv! })),
    },
  ]),
);

const signalResult = generateEarningsGapSignals(disclosures, priceSeriesForSignals, {
  gapThresholdPct: -7,
  requireForecastNotCut: true,
  corporateActionDates: corporateActionDatesFromPriceRecords(
    [...securityRecords.values()].flat(),
  ),
});

const spec: BacktestSpec = {
  schemaVersion: 1,
  id: "synthetic-earnings-gap",
  edgeId: "earnings-gap-overreaction",
  side: "long",
  notionalJpy: 3_000_000,
  entry: { mode: "next_open" },
  exit: { mode: "stop_or_period", holdingPeriodDays: 20, stopLossBps: 800 },
  costs: {
    commissionBps: 2,
    spreadBps: 8,
    slippageBps: 5,
    marketImpactBpsPerPctAdv: 10,
    borrowCostAnnualBps: 0,
  },
  liquidity: { participationLimitPct: 5, minAdtvJpy: 100_000_000 },
  benchmark: BENCHMARK_CODE,
  notes: "合成データ。実在の銘柄・実際の相場ではない。配管確認専用で収益性の証拠にしない。",
};

const built = buildBacktestBundle({
  spec,
  signals: signalResult.signals,
  securityRecords,
  benchmarkRecords,
  asOf: AS_OF,
  selector: SELECTOR,
  trials: 1,
});

writeFileSync(OUT_PATH, `${JSON.stringify(built.bundle, null, 2)}\n`, "utf-8");

console.log(
  JSON.stringify(
    {
      out: OUT_PATH,
      disclosures: signalResult.disclosureCount,
      signals: signalResult.signals.length,
      rejected: signalResult.rejectedCounts,
      pricedCodes: built.bundle.prices.length,
      excluded: built.excluded,
    },
    null,
    2,
  ),
);
