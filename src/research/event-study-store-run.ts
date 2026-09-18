// Research OS — 適時開示の見出しを母集団にしたイベントスタディを、保存庫から1回走らせる。
//
// research:holdout:open（事前登録した1回きりの測定）から呼ぶ。
// 期間と封印の扱いは呼び出し側が決める。
//
// 流動性の扱い:
//   価格の集合は全銘柄（期間中の流動性で絞らない）。流動性は**反応日の時点**で
//   判定する（反応日を含む直近20本の平均売買代金）。
//   ベンチマークの構成銘柄は研究と同じ 5億円/日（既定値）。

import { archiveRoot, listArchivedDates, readArchivedDisclosures } from "../disclosure-archive.js";
import type { PriceSeries } from "./backtest.js";
import { averageTurnoverJpy } from "./signals/abnormal-return.js";
import {
  assertDisclosureKeywordPopulation,
  buildDisclosureKeywordEvents,
  type DisclosureKeywordEvent,
  type DisclosureKeywordPopulation,
  type DisclosureKeywordRejectReason,
} from "./signals/disclosure-keyword-events.js";
import {
  runEventStudy,
  type EventStudyHorizonSummary,
  type EventStudyResult,
  type EventStudySubject,
} from "./signals/event-study.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
} from "./study-inputs-from-store.js";

/** 流動性の判定に使う本数（検出器・指数と同じ）。 */
const TURNOVER_LOOKBACK_BARS = 20;

export class EventStudyRunError extends Error {}

export interface DisclosureEventStudyBundle {
  kind: "disclosure_event_study";
  schemaVersion: 1;
  edgeId: string;
  specId: string;
  notes?: string;
  population: DisclosureKeywordPopulation & { source: "tdnet_archive" };
  minAverageTurnoverJpy: number;
  excludeKnownEarnings: boolean;
  horizons: number[];
  primaryHorizon: number;
  twoSided: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** bundle の形を確かめる。足りない・余計な指定は止める（黙って既定値を置かない）。 */
export function assertDisclosureEventStudyBundle(value: unknown): asserts value is DisclosureEventStudyBundle {
  if (!isRecord(value)) throw new EventStudyRunError("bundle がオブジェクトではありません");
  const allowed = new Set([
    "kind", "schemaVersion", "edgeId", "specId", "notes", "population",
    "minAverageTurnoverJpy", "excludeKnownEarnings", "horizons", "primaryHorizon", "twoSided",
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new EventStudyRunError(`bundle に知らない項目があります: ${unknown.join(", ")}`);
  if (value.kind !== "disclosure_event_study") throw new EventStudyRunError("kind は disclosure_event_study");
  if (value.schemaVersion !== 1) throw new EventStudyRunError("schemaVersion は 1");
  for (const key of ["edgeId", "specId"] as const) {
    if (typeof value[key] !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value[key] as string)) {
      throw new EventStudyRunError(`${key} は小文字の kebab-case で指定してください`);
    }
  }
  const population = value.population;
  if (!isRecord(population) || population.source !== "tdnet_archive") {
    throw new EventStudyRunError("population.source は tdnet_archive");
  }
  for (const key of ["keywords", "followUpMarkers"] as const) {
    if (!Array.isArray(population[key]) || !(population[key] as unknown[]).every((one) => typeof one === "string")) {
      throw new EventStudyRunError(`population.${key} は文字列の配列`);
    }
  }
  const turnover = value.minAverageTurnoverJpy;
  if (typeof turnover !== "number" || !Number.isFinite(turnover) || turnover < 0) {
    throw new EventStudyRunError("minAverageTurnoverJpy は 0 以上の数");
  }
  if (typeof value.excludeKnownEarnings !== "boolean") {
    throw new EventStudyRunError("excludeKnownEarnings は true / false");
  }
  const horizons = value.horizons;
  if (!Array.isArray(horizons) || horizons.length === 0
    || !horizons.every((one) => Number.isSafeInteger(one) && (one as number) >= 1)) {
    throw new EventStudyRunError("horizons は 1 以上の整数の配列");
  }
  if (!horizons.includes(value.primaryHorizon)) {
    throw new EventStudyRunError("primaryHorizon は horizons のどれか");
  }
  if (value.twoSided !== true) throw new EventStudyRunError("twoSided は true（片側の判定は未対応）");
  try {
    assertDisclosureKeywordPopulation(population as unknown as DisclosureKeywordPopulation);
  } catch (error) {
    throw new EventStudyRunError(`population: ${(error as Error).message}`);
  }
}

export interface DisclosureEventStudyRun {
  events: DisclosureKeywordEvent[];
  populationRejected: Record<DisclosureKeywordRejectReason, number>;
  /** 母集団のあと、価格・流動性・決算日で落とした件数。 */
  measurementRejected: {
    no_price_series: number;
    no_reaction_bar: number;
    below_min_turnover: number;
    known_earnings: number;
  };
  study: EventStudyResult;
  primary: EventStudyHorizonSummary;
  /**
   * 同じ期間・同じ流動性の条件で無作為に選んだ日の主要 horizon（零点。判定には使わない）。
   * 日付で間引く（銘柄ごとに間引くと日ごとの件数が偏り、クラスタ平均が壊れる）。
   */
  placebo: { subjectCount: number; clusterCount: number | null; clusteredMeanBps: number | null };
}

/** 零点の標本は期間中の営業日から、この間隔で日付ごとに取る。 */
const PLACEBO_EVERY_NTH_TRADING_DATE = 5;

export function runDisclosureEventStudy(
  bundle: DisclosureEventStudyBundle,
  range: { to: string; archiveRoot?: string },
  log: (line: string) => void = console.log,
): DisclosureEventStudyRun {
  let inputs;
  try {
    // 全銘柄を読む（0 = 期間中の流動性で絞らない）。ベンチマークは既定の 5億円/日。
    // 封印を開ける経路（事前登録・1回きり・記録つき）なので明示して読む。
    inputs = loadStudyInputsFromStore({ to: range.to, minTurnoverJpy: 0, allowSealed: true });
  } catch (error) {
    if (error instanceof StudyInputsError) throw new EventStudyRunError(error.message);
    throw error;
  }
  for (const line of formatStudyInputs(inputs, 0)) log(line);

  const root = range.archiveRoot ?? archiveRoot();
  const rows = listArchivedDates(root)
    .filter((date) => date >= bundle.population.eventFrom && date <= bundle.population.eventTo && date <= range.to)
    .flatMap((date) => readArchivedDisclosures(date, root));
  if (rows.length === 0) throw new EventStudyRunError(`開示の保存がありません: ${root}`);
  const built = buildDisclosureKeywordEvents(rows, bundle.population, inputs.tradingDates);
  log(
    `母集団: 開示 ${built.rowCount.toLocaleString()} → イベント ${built.events.length}`
    + `（${Object.entries(built.rejectedCounts)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(" ")}）`,
  );

  const known = bundle.excludeKnownEarnings
    ? loadEarningsEventDatesFromStore({ tradingDates: inputs.tradingDates, to: range.to, allowSealed: true }).byCode
    : new Map<string, Set<string>>();
  const securities = new Map<string, PriceSeries>(inputs.prices.map((series) => [series.code, series]));
  const measurementRejected = { no_price_series: 0, no_reaction_bar: 0, below_min_turnover: 0, known_earnings: 0 };
  const subjects: EventStudySubject[] = [];
  for (const event of built.events) {
    const series = securities.get(event.code);
    if (!series) { measurementRejected.no_price_series += 1; continue; }
    const index = series.bars.findIndex((bar) => bar.date === event.reactionDate);
    if (index < 0) { measurementRejected.no_reaction_bar += 1; continue; }
    if (averageTurnoverJpy(series, index, TURNOVER_LOOKBACK_BARS) < bundle.minAverageTurnoverJpy) {
      measurementRejected.below_min_turnover += 1;
      continue;
    }
    if (known.get(event.code)?.has(event.reactionDate)) { measurementRejected.known_earnings += 1; continue; }
    subjects.push({
      id: event.id,
      code: event.code,
      eventDate: event.reactionDate,
      group: "treatment",
      pairId: event.id,
    });
  }
  log(
    `測定  : ${subjects.length}件（価格なし ${measurementRejected.no_price_series} / 反応日に足なし ${measurementRejected.no_reaction_bar}`
    + ` / 売買代金不足 ${measurementRejected.below_min_turnover} / 決算日 ${measurementRejected.known_earnings}）`,
  );

  const study = runEventStudy(subjects, securities, inputs.benchmark, {
    horizons: bundle.horizons,
    corporateActionDates: inputs.corporateActionDates,
  });
  const primary = study.summaryByHorizon.find((row) => row.horizonBars === bundle.primaryHorizon);
  if (!primary) throw new EventStudyRunError(`主要 horizon D+${bundle.primaryHorizon} の集計がありません`);

  const placeboDates = new Set(
    inputs.tradingDates
      .filter((date) => date >= bundle.population.eventFrom && date <= bundle.population.eventTo)
      .filter((_, index) => index % PLACEBO_EVERY_NTH_TRADING_DATE === 0),
  );
  const placeboSubjects: EventStudySubject[] = [];
  for (const series of inputs.prices) {
    series.bars.forEach((bar, index) => {
      if (!placeboDates.has(bar.date)) return;
      if (averageTurnoverJpy(series, index, TURNOVER_LOOKBACK_BARS) < bundle.minAverageTurnoverJpy) return;
      const id = `placebo-${series.code}-${bar.date}`;
      placeboSubjects.push({ id, code: series.code, eventDate: bar.date, group: "treatment", pairId: id });
    });
  }
  const placeboStudy = runEventStudy(placeboSubjects, securities, inputs.benchmark, {
    horizons: [bundle.primaryHorizon],
    corporateActionDates: inputs.corporateActionDates,
  });
  const placeboPrimary = placeboStudy.summaryByHorizon[0]!.treatment;
  const placebo = {
    subjectCount: placeboSubjects.length,
    clusterCount: placeboPrimary.clusterCount,
    clusteredMeanBps: placeboPrimary.clusteredMeanNetAlphaBps,
  };
  log(
    `零点  : 無作為 ${placebo.subjectCount}件 / D+${bundle.primaryHorizon} クラスタ平均 `
    + `${placebo.clusteredMeanBps === null ? "n/a" : `${placebo.clusteredMeanBps.toFixed(1)}bps`}（判定には使わない）`,
  );

  return {
    placebo,
    events: built.events,
    populationRejected: built.rejectedCounts,
    measurementRejected,
    study,
    primary,
  };
}
