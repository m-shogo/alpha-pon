// Research OS — 取り込み済みの保存庫から backtest の入力を作る。
//
// research:backtest（研究期間）と research:holdout:open（確認期間）が
// **同じ作り方**で入力を作るためにここへ置く。期間と封印の扱いは呼び出し側が決める
// （研究では resolveResearchTo で封印の前日まで、確認では開封の手続きを通した期間）。

import type { BacktestSignal, BacktestSpec, PriceSeries } from "./backtest.js";
import {
  detectAbnormalMoveEvents,
  type AbnormalMoveParams,
} from "./signals/abnormal-move-events.js";
import {
  StudyInputsError,
  formatStudyInputs,
  loadEarningsDisclosureInputs,
  loadEarningsEventDatesFromStore,
  loadStudyInputsFromStore,
} from "./study-inputs-from-store.js";
import { detectReadAcrossEvents } from "./signals/read-across-events.js";
import { DEFAULT_MARKET_MODEL_PARAMS } from "./signals/market-model.js";
import { sectorPeerGraph } from "./signals/company-relations.js";
import {
  MARGIN_TYPE_LENDABLE,
  buildSectorPeers,
  loadMarginTypeTimeline,
  loadMasterAsOf,
} from "./providers/jquants-master-store.js";
import { filterLendableSignals } from "./signals/lendable-filter.js";
import {
  generateEarningsGapSignals,
  type EarningsGapParams,
} from "./signals/earnings-gap.js";
import { detectForecastRevisionEvents } from "./signals/forecast-revision-events.js";

/** 入力を作れなかった（保存庫が無い・bundle の指定が足りない）。CLI は理由を出して止める。 */
export class StoreRunError extends Error {}

export interface BacktestStoreBundle {
  spec: BacktestSpec;
  /** `--from-store` を使うときは省略し、`detector` から生成する。 */
  signals?: BacktestSignal[];
  /** `--from-store` を使うときは省略する。 */
  prices?: PriceSeries[];
  benchmark?: PriceSeries;
  /**
   * `--from-store` のとき、シグナルをここから作る。
   *
   * シグナルを別ファイルに書き出して受け渡す形にすると、検出パラメータを
   * 変えたときに古いシグナルで backtest を回せてしまう。同じ bundle に
   * 置いて同じ実行で作る。
   */
  detector?:
    | {
        kind: "abnormal_move";
        params: Omit<AbnormalMoveParams, "knownEventDates" | "corporateActionDates">
          & { knownEventDates?: Record<string, string[]> };
      }
    | {
        /**
         * 決算後に下げたが会社予想の営業利益が減額されていない銘柄。
         * 開示は保存庫（research/fins）から読む。bundle に書き写さない。
         */
        kind: "earnings_gap";
        params: Omit<EarningsGapParams, "corporateActionDates">;
      }
    | {
        /**
         * 業績予想の上方修正（同じ会計年度の直前の予想から minRevisionRatio 倍以上）。
         * 事前登録: docs/research/preregistrations/2026-09-17-forecast-revision-up.md
         */
        kind: "forecast_revision";
        params: { minRevisionRatio: number };
      }
    | {
        /**
         * 同業が理由不明で大きく下げた日に、自分も下げた銘柄。
         * peer は銘柄マスタの33業種から組む。bundle に書き写さない。
         */
        kind: "read_across";
        params: {
          sourceAbnormalReturnThresholdPct: number;
          relatedAbnormalReturnThresholdPct: number;
          matchScaleCategory?: boolean;
        };
      };
  /** これまでに試した仮説の数。False Discovery Guard の閾値に使う。 */
  trials?: number;
  /**
   * 検出したあとに絞る条件（`--from-store` のみ）。
   * lendableOnly: シグナル日以前で最新の貸借区分が「貸借」の銘柄だけ（売りの研究用）。
   */
  filters?: { lendableOnly?: boolean };
}

export interface StoreRunRange {
  /** 価格を読み始める日。省略すると保存庫の最初から。 */
  from?: string;
  /** 価格・開示・マスタを読む最終日。**封印の扱いは呼び出し側が決める。** */
  to: string | null;
  /** 流動性の下限（円/日）。判定は各時点で行う。 */
  minTurnoverJpy: number;
  /** 決算日を「説明のつく日」として除外するか。 */
  useEarningsCalendar: boolean;
}

export interface StoreRunResult {
  signals: BacktestSignal[];
  prices: PriceSeries[];
  benchmark: PriceSeries;
  corporateActionDates: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * 取り込み済みの価格ストアからシグナルと価格を作る。
 *
 * 材料（流動性の足切り・ユニバース benchmark・権利落ち台帳）は
 * `study-inputs-from-store.ts` に集約している。edge-study と同じものを
 * 同じ作り方で使わないと、「イベントスタディでは出たのに backtest では
 * 出ない」の原因が分からなくなる。
 */
export function buildFromStore(
  bundle: BacktestStoreBundle,
  range: StoreRunRange,
  log: (line: string) => void = console.log,
): StoreRunResult {
  const kind = bundle.detector?.kind;
  if (
    kind !== "abnormal_move" && kind !== "earnings_gap"
    && kind !== "read_across" && kind !== "forecast_revision"
  ) {
    throw new StoreRunError(
      "--from-store には bundle.detector.kind = "
      + '"abnormal_move" / "earnings_gap" / "read_across" / "forecast_revision" のいずれかが必要です',
    );
  }
  const minTurnoverJpy = range.minTurnoverJpy;
  const to = range.to;

  let inputs;
  try {
    inputs = loadStudyInputsFromStore({
      ...(range.from ? { from: range.from } : {}),
      ...(to ? { to } : {}),
      minTurnoverJpy,
    });
  } catch (error) {
    if (error instanceof StudyInputsError) throw new StoreRunError(error.message);
    throw error;
  }

  if (bundle.detector!.kind === "read_across") {
    const master = loadMasterAsOf(to ?? inputs.tradingDates.at(-1)!);
    if (master.snapshotDate === null) {
      throw new StoreRunError("銘柄マスタがありません。先に pnpm ingest:master を実行してください");
    }
    const peers = buildSectorPeers({
      attributes: master.attributes,
      ...(bundle.detector!.params.matchScaleCategory ? { matchScaleCategory: true } : {}),
    });
    const known = loadEarningsEventDatesFromStore({
      tradingDates: inputs.tradingDates, ...(to ? { to } : {}),
    }).byCode;
    const sources = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
      abnormalReturnThresholdPct: bundle.detector!.params.sourceAbnormalReturnThresholdPct,
      knownEventDates: known,
      corporateActionDates: inputs.corporateActionDates,
      marketModel: DEFAULT_MARKET_MODEL_PARAMS,
      minAverageTurnoverJpy: minTurnoverJpy,
    });
    const across = detectReadAcrossEvents(
      sources.candidates.map((one) => ({ code: one.code, date: one.date })),
      sectorPeerGraph(peers.peersByCode),
      new Map<string, PriceSeries>(inputs.prices.map((series) => [series.code, series])),
      inputs.benchmark,
      {
        sourceAbnormalReturnThresholdPct: bundle.detector!.params.sourceAbnormalReturnThresholdPct,
        relatedAbnormalReturnThresholdPct: bundle.detector!.params.relatedAbnormalReturnThresholdPct,
        knownEventDates: known,
        corporateActionDates: inputs.corporateActionDates,
        relationTypes: ["peer"],
        minAverageTurnoverJpy: minTurnoverJpy,
        // 発生元と同じ定義で測る。素の差だと β の高い銘柄が過剰に選ばれる。
        marketModel: DEFAULT_MARKET_MODEL_PARAMS,
      },
    );
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) log(line);
    log(
      `検出  : 発生元 ${sources.candidates.length} → 伝播 ${across.candidates.length}`
      + `（発生元 ${across.propagatedSourceCount}件から）`,
    );
    log("");
    // observedAt は伝播日の引け。entry.mode = next_open なら翌営業日の始値。
    return {
      signals: across.candidates.map((one) => ({
        id: one.candidateId, code: one.relatedCode, observedAt: one.observedAt,
      })),
      prices: inputs.prices,
      benchmark: inputs.benchmark,
      corporateActionDates: inputs.corporateActionDates,
    };
  }

  if (bundle.detector!.kind === "forecast_revision") {
    // 基準の予想は決算短信から引くので、開示は種類を問わず全部渡す。
    const disclosures = loadEarningsDisclosureInputs(to ? { to } : {});
    const priceByCode = new Map<string, PriceSeries>(
      inputs.prices.map((series) => [series.code, series]),
    );
    const result = detectForecastRevisionEvents(disclosures.disclosures, priceByCode, {
      minRevisionRatio: bundle.detector!.params.minRevisionRatio,
      corporateActionDates: inputs.corporateActionDates,
    });
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) log(line);
    log(
      `決算開示: ${disclosures.datesScanned}営業日 / ${disclosures.disclosures.length.toLocaleString()}件`,
    );
    const revisionRejects = Object.entries(result.rejectedCounts)
      .filter(([reason, count]) => count > 0 && reason !== "not_forecast_revision")
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reason}=${count.toLocaleString()}`)
      .join(" ");
    const revisionCount = result.disclosureCount - result.rejectedCounts.not_forecast_revision;
    log(
      `検出  : 業績予想の修正 ${revisionCount.toLocaleString()}件 → シグナル ${result.signals.length}`
      + `（×${bundle.detector!.params.minRevisionRatio} 以上）`,
    );
    if (revisionRejects) log(`却下  : ${revisionRejects}`);
    log("");
    return {
      signals: result.signals,
      prices: inputs.prices,
      benchmark: inputs.benchmark,
      corporateActionDates: inputs.corporateActionDates,
    };
  }

  if (bundle.detector!.kind === "earnings_gap") {
    // 決算ギャップは開示そのものが起点なので knownEventDates を使わない
    // （「決算の日を除外する」のは業績以外の原因を探すときの話）。
    const disclosures = loadEarningsDisclosureInputs(to ? { to } : {});
    const priceByCode = new Map<string, PriceSeries>(
      inputs.prices.map((series) => [series.code, series]),
    );
    const result = generateEarningsGapSignals(disclosures.disclosures, priceByCode, {
      ...bundle.detector!.params,
      corporateActionDates: inputs.corporateActionDates,
    });
    for (const line of formatStudyInputs(inputs, minTurnoverJpy)) log(line);
    log(
      `決算開示: ${disclosures.datesScanned}営業日 / ${disclosures.disclosures.length.toLocaleString()}件`,
    );
    const gapRejects = Object.entries(result.rejectedCounts)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reason}=${count.toLocaleString()}`)
      .join(" ");
    log(`検出  : 開示 ${result.disclosureCount.toLocaleString()} → シグナル ${result.signals.length}`);
    if (gapRejects) log(`却下  : ${gapRejects}`);
    log("");
    return {
      signals: result.signals,
      prices: inputs.prices,
      benchmark: inputs.benchmark,
      corporateActionDates: inputs.corporateActionDates,
    };
  }

  // 決算開示から「説明のつく日」を組む。
  //
  // 権利落ちと同じ理由で bundle ではなく保存庫を見る。bundle に書き写すと、
  // 取り込みで開示が伸びても古いまま使われる。
  // edge-study と同じ材料を同じ作り方で使わないと、
  // 「イベントスタディでは出たのに backtest では出ない」の原因が分からなくなる。
  let knownEventDates = new Map<string, Set<string>>(
    Object.entries(bundle.detector!.params.knownEventDates ?? {})
      .map(([code, dates]) => [code, new Set(dates)]),
  );
  if (range.useEarningsCalendar) {
    try {
      const earnings = loadEarningsEventDatesFromStore({ tradingDates: inputs.tradingDates, ...(to ? { to } : {}) });
      knownEventDates = earnings.byCode;
      log(
        `決算カレンダー: ${earnings.datesScanned}営業日 / 開示 ${earnings.disclosureCount.toLocaleString()}件`
        + ` → ${earnings.byCode.size}銘柄 / 除外対象 ${earnings.markedDates.toLocaleString()}日`,
      );
    } catch (error) {
      if (error instanceof StudyInputsError) throw new StoreRunError(error.message);
      throw error;
    }
  }

  const detected = detectAbnormalMoveEvents(inputs.prices, inputs.benchmark, {
    ...bundle.detector!.params,
    knownEventDates,
    corporateActionDates: inputs.corporateActionDates,
  });

  const rejectSummary = Object.entries(detected.rejectedCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}=${count}`)
    .join(" ");

  for (const line of formatStudyInputs(inputs, minTurnoverJpy)) log(line);
  log(`検出  : 評価 ${detected.evaluatedCount} → シグナル ${detected.candidates.length}`);
  if (rejectSummary) log(`却下  : ${rejectSummary}`);
  const unavailable = detected.rejectedCounts.market_model_unavailable;
  if (unavailable > detected.evaluatedCount * 0.5) {
    log(
      `⚠ 評価の ${(unavailable / detected.evaluatedCount * 100).toFixed(0)}% で市場モデルを推定できていません。`
      + "シグナルの少なさを結論にしないでください",
    );
  }
  log("");

  // observedAt は反応日の引け。entry.mode = next_open なら翌営業日の始値で建つ。
  const signals: BacktestSignal[] = detected.candidates.map((candidate) => ({
    id: candidate.candidateId,
    code: candidate.code,
    observedAt: candidate.observedAt,
  }));

  return {
    signals,
    prices: inputs.prices,
    benchmark: inputs.benchmark,
    corporateActionDates: inputs.corporateActionDates,
  };
}

/**
 * シグナル日以前で最新の貸借区分が「貸借」の銘柄だけに絞る（売りの研究用）。
 * マスタは to までしか見ない。
 */
export function applyLendableFilter(
  signals: readonly BacktestSignal[],
  to: string | null,
  log: (line: string) => void = console.log,
): BacktestSignal[] {
  const timeline = loadMarginTypeTimeline(to ?? "9999-12-31");
  if (timeline.snapshotCount === 0) {
    throw new StoreRunError("銘柄マスタがありません。先に pnpm ingest:master を実行してください");
  }
  const filtered = filterLendableSignals(signals, timeline.marginTypeOn, MARGIN_TYPE_LENDABLE);
  log(
    `貸借  : シグナル ${signals.length} → ${filtered.kept.length}`
    + `（貸借でない ${filtered.notLendable} / 区分不明 ${filtered.unknown}）`,
  );
  log("");
  return filtered.kept;
}
