/**
 * 取り込み済みの価格ストアから、研究の入力（価格・benchmark・権利落ち）を組む。
 *
 * ## なぜ1箇所にまとめるか
 *
 * edge-study と backtest の両方が同じ材料を必要とする。それぞれに書くと、
 * 流動性の足切りや benchmark の作り方が片方だけ変わり、
 * 「イベントスタディでは出たのに backtest では出ない」の原因が
 * 分からなくなる。実際に一度、ほぼ同じ関数を2本書いた。
 *
 * ## ここで一緒にやること
 *
 * - 権利落ち台帳を読む。**無ければ止める。** 台帳なしで走らせると
 *   1:100 分割が -99% の暴落として候補に上がる（189営業日で -25%以下が
 *   470件、大半が分割だった）
 * - 流動性で母集団を絞る。非流動銘柄は板が薄く終値が当日の市場変動を
 *   反映しないので、翌日の追いつきを異常として拾い続ける
 *   （全4,321銘柄で候補1,775件、5億円/日以上の830銘柄なら432件）
 * - benchmark をユニバースから組む。ETF は説明変数の測定誤差になり、
 *   β を一様に希薄化させる（実測 平均0.59 対 1.00）
 */

import { existsSync, readFileSync } from "node:fs";
import type { HoldoutVaultManifest } from "./signals/holdout-partition.js";
import { paths } from "./io.js";
import { resolve } from "node:path";
import type { EarningsDisclosureInput } from "./signals/earnings-gap.js";
import {
  buildEarningsEventDates,
  type EarningsDisclosure,
  type EarningsEventDatesResult,
} from "./signals/earnings-event-dates.js";
import {
  codeOf,
  disclosedDateOf,
  disclosedTimeOf,
  docTypeOf,
  forecastOperatingProfitOf,
  listIngestedFinsDates,
  readFinsDateRecords,
  resolveFinsStoreRoot,
} from "./providers/jquants-fins-store.js";
import {
  JQUANTS_ADJUSTMENT_LEDGER_NAME,
  parseAdjustmentLedger,
  toCorporateActionDates,
} from "./providers/jquants-adjustment-events.js";
import {
  loadBacktestSeriesAsOf,
  resolveStoreRoot,
} from "./providers/jquants-daily-store.js";
import {
  DEFAULT_UNIVERSE_BENCHMARK_SETTINGS,
  buildUniverseBenchmark,
} from "./signals/universe-benchmark.js";
import type { PriceSeries } from "./backtest.js";

export interface StudyInputsQuery {
  from?: string;
  to?: string;
  /** 0 なら流動性で絞らない。 */
  minTurnoverJpy?: number;
  root?: string;
  asOf?: string;
}

export interface StudyInputs {
  /** 流動性で絞ったあとの銘柄。 */
  prices: PriceSeries[];
  /** 絞る前の銘柄数。絞りが効きすぎていないか見るために返す。 */
  universeSize: number;
  /** ユニバースから組んだ等加重指数。 */
  benchmark: PriceSeries;
  /** 構成銘柄が足りず指数を出せなかった日。 */
  benchmarkSkippedDates: string[];
  corporateActionDates: Map<string, Set<string>>;
  datesScanned: number;
  /**
   * 実際に板の立った営業日（昇順）。
   *
   * 決算開示の「反応日」を決めるのにカレンダーが要る。価格ストアの
   * ファイル名から作ると休場日や取り込み漏れが混ざるので、
   * **読み込んだ系列に実際に現れた日**から組む。
   */
  tradingDates: string[];
}

export class StudyInputsError extends Error {}

export function loadStudyInputsFromStore(query: StudyInputsQuery = {}): StudyInputs {
  const root = query.root ?? resolveStoreRoot();
  const ledgerPath = resolve(root, JQUANTS_ADJUSTMENT_LEDGER_NAME);
  if (!existsSync(ledgerPath)) {
    throw new StudyInputsError(
      `権利落ち台帳がありません: ${ledgerPath}\n`
      + "先に pnpm ingest:prices を実行してください。"
      + "台帳なしで走らせると株式分割を暴落として検出します",
    );
  }
  const corporateActionDates = toCorporateActionDates(
    parseAdjustmentLedger(readFileSync(ledgerPath, "utf-8")),
  );

  const minTurnoverJpy = query.minTurnoverJpy ?? 0;
  if (!Number.isFinite(minTurnoverJpy) || minTurnoverJpy < 0) {
    throw new StudyInputsError(`minTurnoverJpy must be a non-negative finite number: ${minTurnoverJpy}`);
  }

  const loaded = loadBacktestSeriesAsOf({
    asOf: query.asOf ?? new Date().toISOString(),
    root,
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
  });
  if (loaded.series.length === 0) {
    throw new StudyInputsError(
      "価格ストアに使える系列がありません。先に pnpm ingest:prices を実行してください",
    );
  }

  // benchmark は**流動性で絞る前**の母集団から組む。絞ったあとから組むと、
  // 絞り方を変えるたびに市場の定義まで変わってしまう。
  const universe = buildUniverseBenchmark(loaded.series, {
    ...DEFAULT_UNIVERSE_BENCHMARK_SETTINGS,
    // 権利落ちをまたぐリターンを指数に入れない。
    // 実測: 100:1 併合が入って指数が1日で +12.95% 動いた。
    corporateActionDates,
    ...(minTurnoverJpy > 0 ? { minAverageTurnoverJpy: minTurnoverJpy } : {}),
  });
  if (universe.series.bars.length === 0) {
    throw new StudyInputsError(
      "ユニバース指数を作れませんでした。構成銘柄が閾値に届いていません",
    );
  }

  const prices = minTurnoverJpy > 0
    ? loaded.series.filter((series) => {
        const window = series.bars.slice(-DEFAULT_UNIVERSE_BENCHMARK_SETTINGS.turnoverLookbackBars);
        if (window.length === 0) return false;
        const average = window.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / window.length;
        return average >= minTurnoverJpy;
      })
    : loaded.series;

  const tradingDateSet = new Set<string>();
  for (const series of loaded.series) {
    for (const bar of series.bars) tradingDateSet.add(bar.date);
  }

  return {
    prices,
    tradingDates: [...tradingDateSet].sort(),
    universeSize: loaded.series.length,
    benchmark: universe.series,
    benchmarkSkippedDates: universe.skippedDates,
    corporateActionDates,
    datesScanned: loaded.datesScanned,
  };
}

/**
 * 決算開示の保存庫から `knownEventDates` を組む。
 *
 * **保存庫が無ければ止める。** 空の Map を返すと、呼び出し側は
 * 「既知イベントが無い」と「情報が無い」を区別できない。
 * F1 は knownEventDates に載っている日を除外する仕組みなので、
 * 空のまま走らせると候補に決算反応が混ざったまま残り、
 * それを「業績で説明できないショック」と呼んでしまう。
 *
 * 呼び出し側が意図的に決算を無視したいときは、この関数を呼ばずに
 * 空の Map を渡す。**黙って空になる経路は作らない。**
 */
export function loadEarningsEventDatesFromStore(input: {
  /** 昇順の営業日。価格側と同じカレンダーを渡す。 */
  tradingDates: readonly string[];
  root?: string;
  /** 開示当日も除外するか。既定 true。 */
  includeDisclosureDay?: boolean;
}): EarningsEventDatesResult & { disclosureCount: number; datesScanned: number } {
  const root = input.root ?? resolveFinsStoreRoot();
  const dates = listIngestedFinsDates(root);
  if (dates.length === 0) {
    throw new StudyInputsError(
      `決算開示の保存庫がありません: ${root}\n`
      + "先に pnpm ingest:fins を実行してください。\n"
      + "空のまま走らせると、F1 の候補に決算反応が混ざったまま残ります。",
    );
  }

  const disclosures: EarningsDisclosure[] = [];
  for (const date of dates) {
    for (const record of readFinsDateRecords(date, root)) {
      disclosures.push({
        code: codeOf(record),
        disclosedDate: disclosedDateOf(record),
        disclosedTime: disclosedTimeOf(record),
      });
    }
  }

  return {
    ...buildEarningsEventDates({
      disclosures,
      tradingDates: input.tradingDates,
      ...(input.includeDisclosureDay === undefined
        ? {}
        : { includeDisclosureDay: input.includeDisclosureDay }),
    }),
    disclosureCount: disclosures.length,
    datesScanned: dates.length,
  };
}

/**
 * 決算開示の保存庫から earnings-gap の入力を組む。
 *
 * **保存庫が無ければ止める。** 空の配列を返すと「決算が1件も無かった」
 * ように見えて、候補0件の理由が分からなくなる。
 */
export function loadEarningsDisclosureInputs(input: {
  root?: string;
  /** この日より後の開示を使わない（確認期間・holdout の保全）。 */
  to?: string;
} = {}): { disclosures: EarningsDisclosureInput[]; datesScanned: number; withoutForecast: number } {
  const root = input.root ?? resolveFinsStoreRoot();
  const dates = listIngestedFinsDates(root).filter((date) => !input.to || date <= input.to);
  if (dates.length === 0) {
    throw new StudyInputsError(
      `決算開示の保存庫がありません: ${root}\n`
      + "先に pnpm ingest:fins を実行してください。",
    );
  }
  const disclosures: EarningsDisclosureInput[] = [];
  let withoutForecast = 0;
  for (const date of dates) {
    for (const record of readFinsDateRecords(date, root)) {
      const forecastOperatingProfit = forecastOperatingProfitOf(record);
      if (forecastOperatingProfit === null) withoutForecast += 1;
      disclosures.push({
        code: codeOf(record),
        disclosedDate: disclosedDateOf(record),
        disclosedTime: disclosedTimeOf(record),
        forecastOperatingProfit,
        typeOfDocument: docTypeOf(record),
      });
    }
  }
  return { disclosures, datesScanned: dates.length, withoutForecast };
}

/**
 * 正本の金庫から「研究に使ってよい最終日」を求める。
 *
 * 封印の開始日の前日。金庫が無ければ null。
 *
 * **CLI ごとに書くと、書き忘れた CLI だけが封印を覗く。**
 * 2026-09-11 に、bundle 側へ自前の manifest を書くことで封印が
 * 8ヶ月ぶん狭まった状態で探索した事故があった。入口を1つにする。
 */
export function researchCutoffFromVault(): { to: string; windowId: string } | null {
  const path = paths.holdoutManifest();
  if (!existsSync(path)) return null;
  const manifest = JSON.parse(readFileSync(path, "utf-8")) as HoldoutVaultManifest;
  let earliest: { from: string; id: string } | null = null;
  for (const window of manifest.windows) {
    if (!earliest || window.from < earliest.from) earliest = { from: window.from, id: window.id };
  }
  if (!earliest) return null;
  const day = new Date(`${earliest.from}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return { to: day.toISOString().slice(0, 10), windowId: earliest.id };
}

/**
 * `--to` を決める。指定が無ければ封印の前日まで。
 * 指定が封印の内側なら **止める**（黙って覗かない）。
 */
export function resolveResearchTo(explicitTo: string | null | undefined): {
  to: string | null;
  sealed: { to: string; windowId: string } | null;
  violation: string | null;
} {
  const sealed = researchCutoffFromVault();
  if (explicitTo && sealed && explicitTo > sealed.to) {
    return {
      to: null,
      sealed,
      violation:
        `--to=${explicitTo} は封印期間に入っています`
        + `（${sealed.windowId} は ${sealed.to} の翌日から）。`
        + "封印を開けるなら research:holdout:open を通し、access_log に記録を残してください",
    };
  }
  return { to: explicitTo ?? sealed?.to ?? null, sealed, violation: null };
}

/** 人向けの1〜3行の要約。CLI が同じ形で出せるようにここに置く。 */
export function formatStudyInputs(inputs: StudyInputs, minTurnoverJpy: number): string[] {
  const actionCount = [...inputs.corporateActionDates.values()]
    .reduce((sum, set) => sum + set.size, 0);
  return [
    `${inputs.prices.length}銘柄`
    + `${minTurnoverJpy > 0 ? `（全${inputs.universeSize}中・売買代金${(minTurnoverJpy / 1e8).toFixed(0)}億円/日以上）` : ""}`
    + ` / ${inputs.datesScanned}営業日`,
    `benchmark ユニバース等加重 ${inputs.benchmark.bars.length}本`
    + `${inputs.benchmarkSkippedDates.length > 0 ? ` / 構成不足 ${inputs.benchmarkSkippedDates.length}日` : ""}`,
    `権利落ち ${inputs.corporateActionDates.size}銘柄 / ${actionCount}件`,
  ];
}
