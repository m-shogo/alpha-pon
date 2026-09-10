// Research OS — Net Alpha Engine。
// 「理論利益」ではなく「手元に残る利益」で評価するためのコスト計上を一箇所にまとめる。
// ここに無いコストは Net Alpha に反映されない = 見落としが目に見える構造にしてある。

export interface CostModel {
  commissionBps: number;
  spreadBps: number;
  slippageBps: number;
  /** 出来高の 1% を執行するごとに追加でかかる bps（線形近似） */
  marketImpactBpsPerPctAdv?: number;
  /** 空売りの年率借株コスト（bps） */
  borrowCostAnnualBps?: number;
  /** 空売り時に受け取るリベート（年率 bps）。通常は 0 か極小。 */
  shortRebateAnnualBps?: number;
}

export interface CostBreakdown {
  commissionBps: number;
  spreadBps: number;
  slippageBps: number;
  marketImpactBps: number;
  borrowCostBps: number;
  totalBps: number;
}

export interface CostInput {
  side: "long" | "short";
  holdingDays: number;
  /** 執行額が1日の売買代金に占める割合(%)。マーケットインパクトの入力。 */
  participationPct: number;
}

/**
 * 往復コストを bps で返す。
 * 手数料・スプレッド・スリッページ・インパクトは entry と exit の 2 回分を計上する。
 * スプレッドは片道あたり半値幅（spreadBps / 2）を負担する前提。
 */
export function computeCosts(model: CostModel, input: CostInput): CostBreakdown {
  const legs = 2;
  const commissionBps = model.commissionBps * legs;
  const spreadBps = (model.spreadBps / 2) * legs;
  const slippageBps = model.slippageBps * legs;
  const marketImpactBps = (model.marketImpactBpsPerPctAdv ?? 0) * input.participationPct * legs;

  const borrowCostBps =
    input.side === "short"
      ? Math.max(
          0,
          ((model.borrowCostAnnualBps ?? 0) - (model.shortRebateAnnualBps ?? 0)) * (input.holdingDays / 365),
        )
      : 0;

  const totalBps = commissionBps + spreadBps + slippageBps + marketImpactBps + borrowCostBps;
  return { commissionBps, spreadBps, slippageBps, marketImpactBps, borrowCostBps, totalBps };
}

export interface NetAlphaInput {
  /** 建玉方向を考慮した銘柄側の粗リターン（bps） */
  grossReturnBps: number;
  /** ベンチマークの同期間リターン（bps）。指定時は超過リターンで評価する。 */
  benchmarkReturnBps?: number;
  costs: CostBreakdown;
}

export interface NetAlphaResult {
  grossReturnBps: number;
  benchmarkReturnBps: number;
  grossAlphaBps: number;
  totalCostBps: number;
  netAlphaBps: number;
}

export function computeNetAlpha(input: NetAlphaInput): NetAlphaResult {
  const benchmarkReturnBps = input.benchmarkReturnBps ?? 0;
  const grossAlphaBps = input.grossReturnBps - benchmarkReturnBps;
  return {
    grossReturnBps: input.grossReturnBps,
    benchmarkReturnBps,
    grossAlphaBps,
    totalCostBps: input.costs.totalBps,
    netAlphaBps: grossAlphaBps - input.costs.totalBps,
  };
}

export interface AggregateStats {
  count: number;
  meanNetAlphaBps: number;
  medianNetAlphaBps: number;
  stdDevBps: number;
  hitRate: number;
  /**
   * 平均 / (標準偏差 / √n)。**観測が独立という仮定に立つ**ため、
   * 同日に複数シグナルが出る戦略では過大になる。判定には使わない。
   */
  tStat: number | null;
  worstBps: number;
  bestBps: number;
  /** クラスタ数（通常はイベント日数）。クラスタキーが無い場合は null。 */
  clusterCount: number | null;
  /**
   * クラスタ内平均どうしの t 統計量（Fama-MacBeth 型）。
   * 同日のシグナルは同じ出来事に相関しており独立ではない。
   * 判定にはこちらを使う。tStat より必ず小さくなるのが正常。
   */
  clusteredTStat: number | null;
}

function tStatOf(values: number[]): number | null {
  const count = values.length;
  if (count <= 1) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  const stdDev = Math.sqrt(variance);
  if (!(stdDev > 0)) return null;
  return mean / (stdDev / Math.sqrt(count));
}

/**
 * クラスタキーごとに平均を取り、その平均どうしで t 統計量を出す。
 *
 * 市場全体が下げた日には多数のシグナルが同時に出る。それらは同じ出来事への
 * 反応であって独立な観測ではない。独立と見なすと t 値が最大 √(1クラスタあたり件数)
 * 倍に膨らみ、存在しないエッジが有意に見える。
 */
function clusteredTStatOf(values: number[], clusterKeys: readonly string[]): number | null {
  if (values.length !== clusterKeys.length) {
    throw new Error(
      `cluster keys must align with values: ${clusterKeys.length} keys for ${values.length} values`,
    );
  }
  const sums = new Map<string, { total: number; count: number }>();
  for (const [index, key] of clusterKeys.entries()) {
    const bucket = sums.get(key) ?? { total: 0, count: 0 };
    bucket.total += values[index];
    bucket.count += 1;
    sums.set(key, bucket);
  }
  const clusterMeans = [...sums.values()].map((bucket) => bucket.total / bucket.count);
  return tStatOf(clusterMeans);
}

export function aggregate(netAlphas: number[], clusterKeys?: readonly string[]): AggregateStats {
  const count = netAlphas.length;
  if (count === 0) {
    return {
      count: 0,
      meanNetAlphaBps: 0,
      medianNetAlphaBps: 0,
      stdDevBps: 0,
      hitRate: 0,
      tStat: null,
      worstBps: 0,
      bestBps: 0,
      clusterCount: clusterKeys === undefined ? null : 0,
      clusteredTStat: null,
    };
  }
  const sorted = [...netAlphas].sort((a, b) => a - b);
  const mean = netAlphas.reduce((sum, value) => sum + value, 0) / count;
  const median =
    count % 2 === 1 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;
  const variance =
    count > 1 ? netAlphas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const hitRate = netAlphas.filter((value) => value > 0).length / count;
  const tStat = count > 1 && stdDev > 0 ? mean / (stdDev / Math.sqrt(count)) : null;

  return {
    count,
    meanNetAlphaBps: mean,
    medianNetAlphaBps: median,
    stdDevBps: stdDev,
    hitRate,
    tStat,
    worstBps: sorted[0],
    bestBps: sorted[count - 1],
    clusterCount: clusterKeys === undefined ? null : new Set(clusterKeys).size,
    clusteredTStat: clusterKeys === undefined ? null : clusteredTStatOf(netAlphas, clusterKeys),
  };
}

/**
 * False Discovery Guard。
 * 複数仮説を試した回数 (trials) を考慮した Benjamini-Hochberg 風の粗い閾値。
 * 「t 統計量が単独で有意でも、20個試したうちの1個なら有意ではない」を機械的に示す。
 */
/** 日本の上場株式等の譲渡益課税（所得税15% + 復興特別所得税0.315% + 住民税5%）。 */
export const JP_CAPITAL_GAINS_TAX_RATE = 0.20315;

/**
 * 税引き後の平均 Net Alpha。
 *
 * 近似であることを明示する。実際の課税は年間の損益通算後に一度かかるため、
 * 1取引ごとに課税されるわけではない。ここでは「戦略全体の平均が正なら
 * その分に課税される」という前提で、平均が負の場合は課税しない。
 * エッジの有無（t 統計量）は税率の乗算で変わらないので、
 * この値は「やる価値があるか」の判断だけに使う。
 */
export function afterTaxMeanBps(
  meanNetAlphaBps: number,
  taxRate: number = JP_CAPITAL_GAINS_TAX_RATE,
): number {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1) {
    throw new Error(`taxRate must be in [0, 1): ${taxRate}`);
  }
  return meanNetAlphaBps > 0 ? meanNetAlphaBps * (1 - taxRate) : meanNetAlphaBps;
}

export function falseDiscoveryGuard(tStat: number | null, trials: number): {
  passed: boolean;
  requiredTStat: number;
  reason: string;
} {
  if (!Number.isSafeInteger(trials) || trials < 1) {
    throw new Error("falseDiscoveryGuard trials must be a positive safe integer");
  }
  // 試行回数 n に対して概ね必要な |t|（正規近似の Bonferroni 相当）
  const requiredTStat = 1.96 + Math.log(trials) * 0.6;
  if (tStat === null) {
    return { passed: false, requiredTStat, reason: "サンプル不足で t 統計量が計算できません" };
  }
  const passed = Math.abs(tStat) >= requiredTStat;
  return {
    passed,
    requiredTStat,
    reason: passed
      ? `|t|=${Math.abs(tStat).toFixed(2)} が試行回数 ${trials} に対する閾値 ${requiredTStat.toFixed(2)} を上回っています`
      : `|t|=${Math.abs(tStat).toFixed(2)} は試行回数 ${trials} に対する閾値 ${requiredTStat.toFixed(2)} に届きません`,
  };
}
