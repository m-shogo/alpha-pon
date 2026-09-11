/**
 * ユニバース自身から組む市場ベンチマーク。
 *
 * ## なぜ ETF ではだめか（実測 2026-09-11）
 *
 * benchmark に 1306（TOPIX連動ETF）を使い、流動銘柄810本の β を推定すると:
 *
 * ```
 *   benchmark = 1306 ETF              β中央 0.54  平均 0.59
 *   benchmark = 同じ810本の等加重指数   β中央 0.92  平均 1.00
 * ```
 *
 * 等加重の銘柄群に対する市場βの平均は、定義上 1 でなければならない。
 * 0.59 は推定が壊れている証拠。原因は **説明変数側の測定誤差**
 * （errors-in-variables）で、ETF の終値は指数そのものではなく、
 * 需給・スプレッド・約定タイミングのぶれを含む。回帰の説明変数に誤差が
 * 乗ると β は 0 方向へ引っ張られ、しかも**全銘柄が一様に**引っ張られる。
 *
 * その結果、市場が -10.8% 下げた日に β̂=0.54 で説明しようとすると
 * 半分しか説明できず、残りが「異常」として大量に出る。実測では
 * 市場モデルを入れたほうが候補が増えた（72件 → 215件）。
 *
 * 手元にはユニバース全体の価格がある。ETF を代理に使う理由がない。
 *
 * ## 権利落ち日を必ず外す
 *
 * 最初の実装は権利落ち台帳を見ていなかった。実測 2024-12-16、
 * `13570`（日経ダブルインバース）が100:1の株式併合をして
 * 117円 → 11,755円（**+9,947%**）になり、それが等加重平均に入って
 * **指数がその日だけ +12.95% 動いた。**
 *
 * 1銘柄の併合が市場の動きになる。その日の全銘柄の異常収益が壊れ、
 * その日を含む推定窓のβもすべて壊れる。
 *
 * 台帳は**必須**にしている。省略できるようにすると、渡し忘れたときに
 * 黙って壊れた指数ができる。
 *
 * ## PIT
 *
 * 構成銘柄は「その日までに分かっている実績」で決める。全期間の売買代金で
 * 選ぶと、あとで流動的になった銘柄を最初から知っていたことになる。
 * 売買代金は**前営業日まで**で測る。当日の出来高は事件そのもので跳ねるので、
 * それで構成銘柄が入れ替わると指数が事件に引きずられる。
 *
 * ## 始値の水準も持つ
 *
 * 最初の実装は終値ベースの水準しか作らず、bar の `open` にも同じ値を入れていた。
 * だが `event-study.ts` は **benchmark の始値 → 終値**で市場リターンを測る。
 * `open === close` だと、建玉日の**日中の市場変動が銘柄側にだけ入り、
 * benchmark 側では引かれない**。1日ぶんの日中変動（±0.5〜1%）が
 * そのまま異常収益に紛れ込む。
 *
 * 構成銘柄の始値があるので、同じ構成銘柄で
 * 「前日終値 → 当日始値」（オーバーナイト）の平均も出し、
 * 始値の水準として持つ。これで銘柄側と区間がそろう。
 *
 * 日中の高値・安値は持たない（構成銘柄の高値が同時刻に付くとは限らず、
 * 合成しても意味が無い）。`high`/`low` は始値と終値の外側に置くだけ。
 */

import type { PriceBar, PriceSeries } from "../backtest.js";
import { calendarDaysBetween } from "./trading-calendar.js";

export const UNIVERSE_BENCHMARK_CODE = "UNIVERSE-EW";

export interface UniverseBenchmarkParams {
  /**
   * code -> 権利落ち日。**必須。**
   *
   * 省略可能にすると渡し忘れたときに黙って壊れた指数ができる。
   * 「権利落ちが無い」ことを表すなら空の Map を明示的に渡す。
   */
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
  /** 構成銘柄の最低平均売買代金（円/日）。過去時点の実績で判定する。 */
  minAverageTurnoverJpy: number;
  /** 売買代金の参照本数。 */
  turnoverLookbackBars: number;
  /** 構成銘柄がこの数に満たない日は指数を出さない。 */
  minConstituents: number;
  /** 連続しないリターン（売買停止明け）を除く暦日差の上限。 */
  maxPriorGapDays: number;
}

/** 台帳を除いた既定値。呼び出し側が `corporateActionDates` を足して使う。 */
export const DEFAULT_UNIVERSE_BENCHMARK_SETTINGS = {
  minAverageTurnoverJpy: 500_000_000,
  turnoverLookbackBars: 20,
  minConstituents: 100,
  maxPriorGapDays: 10,
} as const;

export interface UniverseBenchmarkDay {
  date: string;
  /** 等加重の日次リターン（前日終値 → 当日終値、%）。 */
  returnPct: number;
  /** 等加重のオーバーナイトリターン（前日終値 → 当日始値、%）。 */
  overnightReturnPct: number;
  constituents: number;
  /** 当日終値の水準。 */
  level: number;
  /** 当日始値の水準。 */
  openLevel: number;
}

export interface UniverseBenchmarkResult {
  /** 既存の benchmark 引数へそのまま渡せる形。 */
  series: PriceSeries;
  days: UniverseBenchmarkDay[];
  /** 構成銘柄が足りず指数を出さなかった日。黙って飛ばさない。 */
  skippedDates: string[];
  /** 権利落ちをまたぐとして構成から外したリターンの本数。 */
  excludedForCorporateAction: number;
}

export function assertUniverseBenchmarkParams(params: UniverseBenchmarkParams): void {
  if (!(params.corporateActionDates instanceof Map)) {
    throw new Error("corporateActionDates は必須（権利落ちが無いなら空の Map を渡すこと）");
  }
  if (!Number.isFinite(params.minAverageTurnoverJpy) || params.minAverageTurnoverJpy < 0) {
    throw new Error(`minAverageTurnoverJpy must be a non-negative finite number`);
  }
  for (const [label, value] of [
    ["turnoverLookbackBars", params.turnoverLookbackBars],
    ["minConstituents", params.minConstituents],
    ["maxPriorGapDays", params.maxPriorGapDays],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${label} must be a positive safe integer: ${value}`);
    }
  }
}

/**
 * 等加重の市場指数を組む。
 *
 * `series` は昇順の bars を持つこと。各営業日について、
 *
 *   - 当日と前営業日の bar があり
 *   - 前営業日からの暦日差が上限以内（停止明けを混ぜない）
 *   - 前営業日終値が正
 *   - **前営業日までの**平均売買代金が下限以上
 *
 * を満たす銘柄の日次リターンを等加重で平均する。
 */
export function buildUniverseBenchmark(
  securities: readonly PriceSeries[],
  params: UniverseBenchmarkParams,
): UniverseBenchmarkResult {
  assertUniverseBenchmarkParams(params);

  // 日付 → その日にリターンを出せる銘柄の (終値リターン, オーバーナイトリターン)。
  // **同じ構成銘柄**で両方を取る。母集団がずれると区間もずれる。
  const contributions = new Map<string, Array<{ closePct: number; overnightPct: number }>>();
  const allDates = new Set<string>();

  let excludedForCorporateAction = 0;

  for (const series of securities) {
    const actionDates = params.corporateActionDates.get(series.code);
    let turnoverSum = 0;
    const turnoverWindow: number[] = [];

    for (const [index, bar] of series.bars.entries()) {
      allDates.add(bar.date);
      const prior = series.bars[index - 1];

      // 判定に使うのは「前営業日まで」の売買代金。当日の出来高は事件で跳ねる。
      const priorTurnoverCount = turnoverWindow.length;
      const priorTurnoverAvg = priorTurnoverCount > 0 ? turnoverSum / priorTurnoverCount : 0;

      if (
        prior !== undefined
        && prior.close > 0
        && priorTurnoverCount >= params.turnoverLookbackBars
        && priorTurnoverAvg >= params.minAverageTurnoverJpy
        && calendarDaysBetween(prior.date, bar.date) <= params.maxPriorGapDays
      ) {
        // 権利落ち日のリターンは株数基準が変わるので市場の動きではない。
        // 実測: 100:1 併合の +9,947% が入って指数が1日で +12.95% 動いた。
        // 翌日は新基準どうしなので外さない。
        const spansCorporateAction = actionDates !== undefined && actionDates.has(bar.date);
        if (spansCorporateAction) excludedForCorporateAction += 1;

        // 始値が取れない行は構成から外す。0 で代用すると
        // オーバーナイトが -100% として平均に入る。
        if (!spansCorporateAction && bar.open > 0) {
          const entry = {
            closePct: ((bar.close - prior.close) / prior.close) * 100,
            overnightPct: ((bar.open - prior.close) / prior.close) * 100,
          };
          const bucket = contributions.get(bar.date);
          if (bucket) bucket.push(entry);
          else contributions.set(bar.date, [entry]);
        }
      }

      // 当日ぶんを窓へ入れる（次の営業日の判定に使う）。
      turnoverWindow.push(bar.close * bar.volume);
      turnoverSum += bar.close * bar.volume;
      if (turnoverWindow.length > params.turnoverLookbackBars) {
        turnoverSum -= turnoverWindow.shift()!;
      }
    }
  }

  const dates = [...allDates].sort();
  const days: UniverseBenchmarkDay[] = [];
  const bars: PriceBar[] = [];
  const skippedDates: string[] = [];
  let level = 100;
  let started = false;

  for (const date of dates) {
    const returns = contributions.get(date);
    if (!returns || returns.length < params.minConstituents) {
      // 構成銘柄が足りない日は指数を出さない。少数銘柄の平均を
      // 「市場」として使うと、その数銘柄の事件が市場の動きになる。
      // ただし履歴の頭（最初のリターンが立つまで）は欠測ではないので数えない。
      if (started) skippedDates.push(date);
      continue;
    }
    const returnPct = returns.reduce((sum, one) => sum + one.closePct, 0) / returns.length;
    const overnightReturnPct =
      returns.reduce((sum, one) => sum + one.overnightPct, 0) / returns.length;
    // 始値も終値も**同じ前日終値水準**から積む。
    const previousLevel = level;
    const openLevel = previousLevel * (1 + overnightReturnPct / 100);
    level = previousLevel * (1 + returnPct / 100);
    started = true;
    days.push({ date, returnPct, overnightReturnPct, constituents: returns.length, level, openLevel });
    bars.push({
      date,
      open: openLevel,
      // 高値・安値は合成しない。始値と終値の外側に置くだけ。
      high: Math.max(openLevel, level),
      low: Math.min(openLevel, level),
      close: level,
      volume: 0,
    });
  }

  return {
    series: { code: UNIVERSE_BENCHMARK_CODE, bars },
    days,
    skippedDates,
    excludedForCorporateAction,
  };
}
