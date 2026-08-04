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
  /** 平均 / (標準偏差 / √n)。サンプルが少ないときの過信を防ぐために必ず併記する。 */
  tStat: number | null;
  worstBps: number;
  bestBps: number;
}

export function aggregate(netAlphas: number[]): AggregateStats {
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
  };
}

/**
 * False Discovery Guard。
 * 複数仮説を試した回数 (trials) を考慮した Benjamini-Hochberg 風の粗い閾値。
 * 「t 統計量が単独で有意でも、20個試したうちの1個なら有意ではない」を機械的に示す。
 */
export function falseDiscoveryGuard(tStat: number | null, trials: number): {
  passed: boolean;
  requiredTStat: number;
  reason: string;
} {
  // 試行回数 n に対して概ね必要な |t|（正規近似の Bonferroni 相当）
  const requiredTStat = 1.96 + Math.log(Math.max(1, trials)) * 0.6;
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
