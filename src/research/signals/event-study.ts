// Research OS — イベントスタディ v1。
//
// 目的:
//   イベント後の価格経路（D+1 / D+5 / D+20 / D+60 / D+120）を
//   benchmark 調整して測り、**対照群と比較する**。
//
// runBacktest との役割の違い:
//   runBacktest は「そのルールで売買した場合の損益」を答える。
//   手数料・スリッページ・流動性・単元株を引いた **tradeable な P&L**。
//   本モジュールは「そのイベントの後、価格はどう動いたか」を答える。
//   **現象の測定**であってコストは引かない。
//   既存 Edge の promotionGate が要求する recoveryMetrics
//   （D+5/D+20/D+60/D+120 benchmark-adjusted return、reclaimByD20/D60/D120、
//     maxAdverseExcursion、maxFavorableExcursion）はこちら側の指標。
//
//   **ここで出る数字を実現損益と読み替えないこと。**
//   コスト控除後に生き残るかは runBacktest 側で別途測る。
//
// 設計方針:
//   - 外部 IO を行わない。決定論的。
//   - treatment と control を同じ手続きで測る。基準が違うものを比べない。
//   - エントリーはイベント日の翌営業日の寄付（PIT）。
//     イベント日の終値を条件に使う以上、その日には約定できない。
//   - 同日イベントはクラスタとして扱い、t 統計量を過大にしない。
//   - 測れなかった観測を silent drop しない。理由付きで返す。

import type { PriceSeries } from "../backtest.js";
import { aggregate, type AggregateStats } from "../net-alpha.js";
import { assertAscendingBars } from "./trading-calendar.js";

export const EVENT_STUDY_SKIP_REASONS = [
  "no_price_series",
  "event_bar_missing",
  "no_entry_bar",
  "non_positive_entry_price",
  "benchmark_entry_bar_missing",
  "non_positive_benchmark_entry_price",
] as const;

export type EventStudySkipReason = (typeof EVENT_STUDY_SKIP_REASONS)[number];

export const EVENT_STUDY_HORIZON_SKIP_REASONS = [
  "horizon_bar_missing",
  "benchmark_horizon_bar_missing",
  "non_positive_price",
] as const;

export type EventStudyHorizonSkipReason = (typeof EVENT_STUDY_HORIZON_SKIP_REASONS)[number];

export type EventStudyGroup = "treatment" | "control";

export interface EventStudySubject {
  id: string;
  code: string;
  /** イベントが価格に出た営業日。エントリーはこの翌営業日以降。 */
  eventDate: string;
  group: EventStudyGroup;
  /** treatment と control を対応づけるキー。対照は元 treatment の id を使う。 */
  pairId: string;
}

export interface EventStudyParams {
  /** 測定する営業日数。例: [1, 5, 20, 60, 120] */
  horizons: readonly number[];
  /**
   * イベント日から何営業日後にエントリーするか。既定 1。
   * イベント日の終値を条件に使う以上、当日には約定できない。
   */
  entryOffsetBars?: number;
}

export interface EventStudyHorizonPoint {
  horizonBars: number;
  exitDate: string;
  exitPrice: number;
  rawReturnBps: number;
  benchmarkReturnBps: number;
  /** benchmark 調整後。**コストは引いていない。** */
  abnormalReturnBps: number;
  /** エントリー以降 horizon までの最大逆行（ロング視点で最も不利な水準）。 */
  maxAdverseExcursionBps: number;
  /** 同じく最大順行。 */
  maxFavorableExcursionBps: number;
  /**
   * イベント前終値を回復したか。**終値ベース**で判定する。
   * 日中の高値が一瞬触れただけを回復と数えると、
   * 値幅の大きい銘柄ほど機械的に回復率が上がってしまう。
   */
  reclaimedPreEventClose: boolean;
}

export interface EventStudyObservation {
  subjectId: string;
  code: string;
  group: EventStudyGroup;
  pairId: string;
  eventDate: string;
  preEventClose: number;
  entryDate: string;
  entryPrice: number;
  horizons: EventStudyHorizonPoint[];
  /** 測れなかった horizon の理由。 */
  skippedHorizons: Array<{ horizonBars: number; reason: EventStudyHorizonSkipReason }>;
}

export interface EventStudyHorizonSummary {
  horizonBars: number;
  treatment: AggregateStats;
  control: AggregateStats;
  /** treatment 平均 − control 平均。対照より良かった分。 */
  differenceBps: number | null;
  treatmentReclaimRate: number | null;
  controlReclaimRate: number | null;
}

export interface EventStudyResult {
  observations: EventStudyObservation[];
  summaryByHorizon: EventStudyHorizonSummary[];
  skipped: Array<{ subjectId: string; reason: EventStudySkipReason }>;
  skippedCounts: Record<EventStudySkipReason, number>;
  subjectCount: number;
}

const DEFAULT_ENTRY_OFFSET_BARS = 1;

function emptySkippedCounts(): Record<EventStudySkipReason, number> {
  const counts = {} as Record<EventStudySkipReason, number>;
  for (const reason of EVENT_STUDY_SKIP_REASONS) counts[reason] = 0;
  return counts;
}

function assertParams(params: EventStudyParams): void {
  if (params.horizons.length === 0) throw new Error("horizons must not be empty");
  const seen = new Set<number>();
  for (const horizon of params.horizons) {
    if (!Number.isSafeInteger(horizon) || horizon < 1) {
      throw new Error(`horizon must be a positive safe integer: ${horizon}`);
    }
    if (seen.has(horizon)) throw new Error(`duplicate horizon: ${horizon}`);
    seen.add(horizon);
  }
  const offset = params.entryOffsetBars ?? DEFAULT_ENTRY_OFFSET_BARS;
  if (!Number.isSafeInteger(offset) || offset < 1) {
    throw new Error(
      `entryOffsetBars must be a positive safe integer (イベント日当日には約定できない): ${offset}`,
    );
  }
}

function returnBps(from: number, to: number): number {
  return ((to - from) / from) * 10_000;
}

/**
 * イベント後の価格経路を benchmark 調整して測る。
 *
 * 戻り値の abnormalReturnBps はコスト控除前。tradeable な期待値ではない。
 */
export function runEventStudy(
  subjects: readonly EventStudySubject[],
  securities: ReadonlyMap<string, PriceSeries>,
  benchmark: PriceSeries,
  params: EventStudyParams,
): EventStudyResult {
  assertParams(params);
  assertAscendingBars(benchmark);
  for (const series of securities.values()) assertAscendingBars(series);

  const entryOffsetBars = params.entryOffsetBars ?? DEFAULT_ENTRY_OFFSET_BARS;
  const horizons = [...params.horizons].sort((left, right) => left - right);
  const benchmarkIndexByDate = new Map(benchmark.bars.map((bar, index) => [bar.date, index]));

  const observations: EventStudyObservation[] = [];
  const skipped: EventStudyResult["skipped"] = [];
  const skippedCounts = emptySkippedCounts();

  const skip = (subjectId: string, reason: EventStudySkipReason): void => {
    skipped.push({ subjectId, reason });
    skippedCounts[reason] += 1;
  };

  const ordered = [...subjects].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  for (const subject of ordered) {
    const series = securities.get(subject.code);
    if (!series) { skip(subject.id, "no_price_series"); continue; }

    const eventIndex = series.bars.findIndex((bar) => bar.date === subject.eventDate);
    if (eventIndex < 0) { skip(subject.id, "event_bar_missing"); continue; }

    const entryIndex = eventIndex + entryOffsetBars;
    if (entryIndex >= series.bars.length) { skip(subject.id, "no_entry_bar"); continue; }
    const entryBar = series.bars[entryIndex];
    if (!(entryBar.open > 0)) { skip(subject.id, "non_positive_entry_price"); continue; }

    const benchmarkEntryIndex = benchmarkIndexByDate.get(entryBar.date);
    if (benchmarkEntryIndex === undefined) { skip(subject.id, "benchmark_entry_bar_missing"); continue; }
    const benchmarkEntryPrice = benchmark.bars[benchmarkEntryIndex].open;
    if (!(benchmarkEntryPrice > 0)) { skip(subject.id, "non_positive_benchmark_entry_price"); continue; }

    const preEventClose = series.bars[eventIndex].close;
    const entryPrice = entryBar.open;
    const points: EventStudyHorizonPoint[] = [];
    const skippedHorizons: EventStudyObservation["skippedHorizons"] = [];

    for (const horizonBars of horizons) {
      const exitIndex = entryIndex + horizonBars;
      if (exitIndex >= series.bars.length) {
        skippedHorizons.push({ horizonBars, reason: "horizon_bar_missing" });
        continue;
      }
      const exitBar = series.bars[exitIndex];
      const benchmarkExitIndex = benchmarkIndexByDate.get(exitBar.date);
      if (benchmarkExitIndex === undefined) {
        skippedHorizons.push({ horizonBars, reason: "benchmark_horizon_bar_missing" });
        continue;
      }
      const benchmarkExitPrice = benchmark.bars[benchmarkExitIndex].close;
      if (!(exitBar.close > 0) || !(benchmarkExitPrice > 0)) {
        skippedHorizons.push({ horizonBars, reason: "non_positive_price" });
        continue;
      }

      const window = series.bars.slice(entryIndex, exitIndex + 1);
      // MAE / MFE は「どこまで振れたか」なので日中の安値・高値を使う。
      const lowest = Math.min(...window.map((bar) => bar.low));
      const highest = Math.max(...window.map((bar) => bar.high));
      // 回復判定は終値ベース。一瞬のヒゲを回復と数えない。
      const highestClose = Math.max(...window.map((bar) => bar.close));

      points.push({
        horizonBars,
        exitDate: exitBar.date,
        exitPrice: exitBar.close,
        rawReturnBps: returnBps(entryPrice, exitBar.close),
        benchmarkReturnBps: returnBps(benchmarkEntryPrice, benchmarkExitPrice),
        abnormalReturnBps:
          returnBps(entryPrice, exitBar.close) - returnBps(benchmarkEntryPrice, benchmarkExitPrice),
        maxAdverseExcursionBps: returnBps(entryPrice, lowest),
        maxFavorableExcursionBps: returnBps(entryPrice, highest),
        reclaimedPreEventClose: highestClose >= preEventClose,
      });
    }

    observations.push({
      subjectId: subject.id,
      code: subject.code,
      group: subject.group,
      pairId: subject.pairId,
      eventDate: subject.eventDate,
      preEventClose,
      entryDate: entryBar.date,
      entryPrice,
      horizons: points,
      skippedHorizons,
    });
  }

  const summaryByHorizon: EventStudyHorizonSummary[] = horizons.map((horizonBars) => {
    const collect = (group: EventStudyGroup) => {
      const values: number[] = [];
      const clusterKeys: string[] = [];
      let reclaimed = 0;
      let counted = 0;
      for (const observation of observations) {
        if (observation.group !== group) continue;
        const point = observation.horizons.find((one) => one.horizonBars === horizonBars);
        if (!point) continue;
        values.push(point.abnormalReturnBps);
        // 同日イベントは同じ出来事への反応。独立な観測として数えない。
        clusterKeys.push(observation.eventDate);
        counted += 1;
        if (point.reclaimedPreEventClose) reclaimed += 1;
      }
      return {
        stats: aggregate(values, clusterKeys),
        reclaimRate: counted === 0 ? null : reclaimed / counted,
      };
    };
    const treatment = collect("treatment");
    const control = collect("control");
    return {
      horizonBars,
      treatment: treatment.stats,
      control: control.stats,
      differenceBps:
        treatment.stats.count === 0 || control.stats.count === 0
          ? null
          : treatment.stats.meanNetAlphaBps - control.stats.meanNetAlphaBps,
      treatmentReclaimRate: treatment.reclaimRate,
      controlReclaimRate: control.reclaimRate,
    };
  });

  return {
    observations,
    summaryByHorizon,
    skipped,
    skippedCounts,
    subjectCount: subjects.length,
  };
}
