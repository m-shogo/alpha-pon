// Research OS — Edge の劣化検知 v1。
//
// 目的:
//   過去に効いていた Edge が、直近でも効いているかを期間比較で判定する。
//
// なぜ必要か:
//   既存 Edge はすべて decay: never_checked のまま。
//   promotionGate の decayChecked も
//   「historical と recent で Edge が維持されるか未検証」となっている。
//
//   SNS・高速ニュース・機関投資家のルール・開示速度の変化で、
//   初期の過剰反応も回復速度も変わり得る。
//   昔のデータで作った閾値が今も通用する保証はない。
//
// 判定の姿勢:
//   **「劣化を検出しなかった」と「維持されている」は違う。**
//   サンプルが足りなければ insufficient_data を返す。
//   維持と言うには、両側に十分なクラスタがあることを要求する。
//   何も言えない状態を「問題なし」と読ませない。

import type { AggregateStats } from "../net-alpha.js";

export const DECAY_VERDICTS = [
  /** どちらかの期間のサンプルが足りず、判定できない。 */
  "insufficient_data",
  /** 直近も過去と同程度に効いている。 */
  "maintained",
  /** 直近の効きが目減りしている。 */
  "weakened",
  /** 直近は符号が反転している。 */
  "reversed",
] as const;

export type DecayVerdict = (typeof DECAY_VERDICTS)[number];

export interface DecayPeriod {
  label: string;
  from: string;
  to: string;
  /** クラスタ補正済みの集計。 */
  stats: AggregateStats;
}

export interface DecayCheckInput {
  edgeId: string;
  /** 時系列順の期間。最低2期間必要。 */
  periods: readonly DecayPeriod[];
  /** 末尾から何期間を「直近」とみなすか。既定 1。 */
  recentPeriodCount?: number;
  /** 各側に必要な最小クラスタ数。これ未満は判定不能。既定 10。 */
  minClustersPerSide?: number;
  /**
   * 直近平均が過去平均のこの比率を下回ったら weakened。既定 0.5。
   * 過去がプラスのときだけ使う。
   */
  weakenedRatio?: number;
}

export interface DecaySideSummary {
  periodLabels: string[];
  sampleCount: number;
  clusterCount: number;
  meanNetAlphaBps: number;
  /** 期間をまたいだ t は算出しない。各期間の値を並べる。 */
  clusteredTStats: Array<number | null>;
}

export interface DecayCheckResult {
  edgeId: string;
  verdict: DecayVerdict;
  historical: DecaySideSummary;
  recent: DecaySideSummary;
  /** 直近平均 − 過去平均。判定不能なら null。 */
  deltaBps: number | null;
  reasons: string[];
  warnings: string[];
}

const DEFAULT_RECENT_PERIOD_COUNT = 1;
const DEFAULT_MIN_CLUSTERS_PER_SIDE = 10;
const DEFAULT_WEAKENED_RATIO = 0.5;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertInput(input: DecayCheckInput): void {
  if (typeof input.edgeId !== "string" || input.edgeId.trim() === "") {
    throw new Error("decay check edgeId must be a non-empty string");
  }
  if (input.periods.length < 2) {
    throw new Error("decay check requires at least 2 periods: 比較しないと劣化は測れない");
  }
  let previousTo: string | null = null;
  for (const period of input.periods) {
    if (typeof period.label !== "string" || period.label.trim() === "") {
      throw new Error("decay period label must be a non-empty string");
    }
    for (const [field, value] of [["from", period.from], ["to", period.to]] as const) {
      if (!ISO_DATE_PATTERN.test(value)) {
        throw new Error(`decay period ${period.label}.${field} must be YYYY-MM-DD: ${value}`);
      }
    }
    if (period.from > period.to) {
      throw new Error(`decay period ${period.label}: from must be on or before to`);
    }
    // 時系列順でないと「直近」が定まらない。
    if (previousTo !== null && period.from <= previousTo) {
      throw new Error(
        `decay periods must be in chronological order without overlap: `
        + `${previousTo} → ${period.from}`,
      );
    }
    previousTo = period.to;
  }

  const recentCount = input.recentPeriodCount ?? DEFAULT_RECENT_PERIOD_COUNT;
  if (!Number.isSafeInteger(recentCount) || recentCount < 1 || recentCount >= input.periods.length) {
    throw new Error(
      `recentPeriodCount must be a positive integer smaller than the period count: ${recentCount}`,
    );
  }
  const minClusters = input.minClustersPerSide ?? DEFAULT_MIN_CLUSTERS_PER_SIDE;
  if (!Number.isSafeInteger(minClusters) || minClusters < 1) {
    throw new Error(`minClustersPerSide must be a positive safe integer: ${minClusters}`);
  }
  const ratio = input.weakenedRatio ?? DEFAULT_WEAKENED_RATIO;
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    throw new Error(`weakenedRatio must be within (0, 1): ${ratio}`);
  }
}

function summarize(periods: readonly DecayPeriod[]): DecaySideSummary {
  let sampleCount = 0;
  let clusterCount = 0;
  let weightedSum = 0;
  for (const period of periods) {
    sampleCount += period.stats.count;
    clusterCount += period.stats.clusterCount ?? 0;
    weightedSum += period.stats.meanNetAlphaBps * period.stats.count;
  }
  return {
    periodLabels: periods.map((one) => one.label),
    sampleCount,
    clusterCount,
    meanNetAlphaBps: sampleCount === 0 ? 0 : weightedSum / sampleCount,
    clusteredTStats: periods.map((one) => one.stats.clusteredTStat),
  };
}

/**
 * 過去期間と直近期間を比べて Edge の劣化を判定する。
 *
 * サンプルが足りなければ insufficient_data を返す。
 * 「劣化を検出しなかった」を「維持されている」と読ませない。
 */
export function checkEdgeDecay(input: DecayCheckInput): DecayCheckResult {
  assertInput(input);

  const recentCount = input.recentPeriodCount ?? DEFAULT_RECENT_PERIOD_COUNT;
  const minClusters = input.minClustersPerSide ?? DEFAULT_MIN_CLUSTERS_PER_SIDE;
  const ratio = input.weakenedRatio ?? DEFAULT_WEAKENED_RATIO;

  const split = input.periods.length - recentCount;
  const historical = summarize(input.periods.slice(0, split));
  const recent = summarize(input.periods.slice(split));

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (historical.clusterCount < minClusters || recent.clusterCount < minClusters) {
    reasons.push(
      `クラスタ数が不足しています（過去 ${historical.clusterCount} / 直近 ${recent.clusterCount}、`
      + `必要 ${minClusters}）`,
    );
    warnings.push(
      "判定できないという結果です。「劣化を検出しなかった」ではありません",
    );
    return {
      edgeId: input.edgeId,
      verdict: "insufficient_data",
      historical,
      recent,
      deltaBps: null,
      reasons,
      warnings,
    };
  }

  const deltaBps = recent.meanNetAlphaBps - historical.meanNetAlphaBps;
  let verdict: DecayVerdict;

  if (historical.meanNetAlphaBps <= 0) {
    // そもそも過去も効いていない。劣化以前の話。
    verdict = recent.meanNetAlphaBps > 0 ? "maintained" : "weakened";
    reasons.push(
      `過去期間の平均が ${historical.meanNetAlphaBps.toFixed(0)}bps で、劣化を測る前提が成立していません`,
    );
    warnings.push("過去期間で効いていない Edge に対する判定です。数値を額面どおり読まないでください");
  } else if (recent.meanNetAlphaBps < 0) {
    verdict = "reversed";
    reasons.push(
      `直近が ${recent.meanNetAlphaBps.toFixed(0)}bps で符号が反転しています`
      + `（過去 ${historical.meanNetAlphaBps.toFixed(0)}bps）`,
    );
  } else if (recent.meanNetAlphaBps < historical.meanNetAlphaBps * ratio) {
    verdict = "weakened";
    reasons.push(
      `直近が過去の ${(recent.meanNetAlphaBps / historical.meanNetAlphaBps * 100).toFixed(0)}% まで`
      + `目減りしています（閾値 ${(ratio * 100).toFixed(0)}%）`,
    );
  } else {
    verdict = "maintained";
    reasons.push(
      `直近が過去の ${(recent.meanNetAlphaBps / historical.meanNetAlphaBps * 100).toFixed(0)}% を維持しています`,
    );
  }

  if (recent.clusteredTStats.some((value) => value === null)) {
    warnings.push("直近期間に t 統計量を算出できない期間があります（クラスタ1つ以下）");
  }

  return { edgeId: input.edgeId, verdict, historical, recent, deltaBps, reasons, warnings };
}
