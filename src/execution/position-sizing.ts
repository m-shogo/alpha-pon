// 発注サイズの決定。
//
// 目的:
//   1トレードで失ってよい額から逆算して株数を決める。
//
// なぜ必要か:
//   勝率が高くても、1回の負けで口座の大半を失えば復帰できない。
//   「いくら買うか」を決めずに「何を買うか」だけ決めるのは、
//   期待値がプラスでも破産する経路を残すということ。
//   alpha-pon にはこの層が存在しなかった（positionSize / kelly / sizing いずれも未実装）。
//
// 設計方針:
//   - 1単元も許容リスクに収まらないなら **買わない**。
//     「1単元くらいなら」と例外を作ると、その1回が想定外の損失になる。
//   - どの制約で size が決まったかを必ず返す。
//     理由が分からないサイズは検証も改善もできない。
//   - 単元株に切り捨てる。端数で建てられない現実を無視しない。
//   - 判断は純関数。口座残高も価格も注入する。

export const POSITION_SIZING_REJECT_REASONS = [
  "non_positive_equity",
  "non_positive_price",
  "stop_on_wrong_side",
  "stop_equals_entry",
  "risk_budget_below_one_lot",
  "max_position_below_one_lot",
  "liquidity_below_one_lot",
] as const;

export type PositionSizingRejectReason = (typeof POSITION_SIZING_REJECT_REASONS)[number];

export const POSITION_SIZING_CONSTRAINTS = [
  "risk",
  "max_position",
  "concurrency",
  "liquidity",
] as const;

export type PositionSizingConstraint = (typeof POSITION_SIZING_CONSTRAINTS)[number];

export interface PositionSizingInput {
  side: "long" | "short";
  /** 口座の評価額。 */
  accountEquityJpy: number;
  /** 1トレードで許容する損失（口座に対する %）。例: 0.5 */
  riskPerTradePct: number;
  entryPrice: number;
  /** 損切り価格。long なら entry 未満、short なら entry 超。 */
  stopPrice: number;
  /** 売買単位。既定 100（東証）。 */
  lotSize?: number;
  /** 1銘柄に投じてよい上限（口座に対する %）。 */
  maxPositionPct?: number;
  /** 同時保有の上限本数。1銘柄あたりの上限を equity / n で決める。 */
  maxConcurrentPositions?: number;
  /** 直近平均売買代金。参加率上限に使う。 */
  averageTurnoverJpy?: number;
  /** 1日の売買代金に対する参加率上限（%）。 */
  participationLimitPct?: number;
}

export interface PositionSizingResult {
  rejected: boolean;
  rejectReason?: PositionSizingRejectReason;
  lots: number;
  shares: number;
  notionalJpy: number;
  /** ストップまで逆行した場合に失う額。 */
  riskJpy: number;
  riskPctOfEquity: number;
  /** サイズを決めた制約。どれにも当たらなければ null（許容リスクちょうど）。 */
  bindingConstraint: PositionSizingConstraint | null;
  /** 各制約が許した単元数。デバッグと説明のために全部返す。 */
  lotsByConstraint: Record<PositionSizingConstraint, number>;
  warnings: string[];
}

const DEFAULT_LOT_SIZE = 100;

function rejection(
  reason: PositionSizingRejectReason,
  warnings: string[] = [],
): PositionSizingResult {
  return {
    rejected: true,
    rejectReason: reason,
    lots: 0,
    shares: 0,
    notionalJpy: 0,
    riskJpy: 0,
    riskPctOfEquity: 0,
    bindingConstraint: null,
    lotsByConstraint: { risk: 0, max_position: 0, concurrency: 0, liquidity: 0 },
    warnings,
  };
}

function assertInput(input: PositionSizingInput): void {
  if (input.side !== "long" && input.side !== "short") {
    throw new Error(`side must be long or short: ${input.side}`);
  }
  if (!Number.isFinite(input.riskPerTradePct) || input.riskPerTradePct <= 0 || input.riskPerTradePct > 100) {
    throw new Error(`riskPerTradePct must be within (0, 100]: ${input.riskPerTradePct}`);
  }
  const lotSize = input.lotSize ?? DEFAULT_LOT_SIZE;
  if (!Number.isSafeInteger(lotSize) || lotSize < 1) {
    throw new Error(`lotSize must be a positive safe integer: ${lotSize}`);
  }
  for (const [label, value] of [
    ["maxPositionPct", input.maxPositionPct],
    ["participationLimitPct", input.participationLimitPct],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 100)) {
      throw new Error(`${label} must be within (0, 100]: ${value}`);
    }
  }
  if (input.maxConcurrentPositions !== undefined) {
    if (!Number.isSafeInteger(input.maxConcurrentPositions) || input.maxConcurrentPositions < 1) {
      throw new Error(`maxConcurrentPositions must be a positive safe integer`);
    }
  }
  if (input.averageTurnoverJpy !== undefined) {
    if (!Number.isFinite(input.averageTurnoverJpy) || input.averageTurnoverJpy < 0) {
      throw new Error("averageTurnoverJpy must be a non-negative finite number");
    }
  }
}

/**
 * 許容リスクから発注サイズを決める。
 *
 * 1単元も収まらない場合は買わない（rejected: true）。
 * 「1単元くらいなら」と例外を作らないのが、この関数の唯一の存在理由。
 */
export function sizePosition(input: PositionSizingInput): PositionSizingResult {
  assertInput(input);

  if (!(input.accountEquityJpy > 0)) return rejection("non_positive_equity");
  if (!(input.entryPrice > 0) || !(input.stopPrice > 0)) return rejection("non_positive_price");
  if (input.entryPrice === input.stopPrice) return rejection("stop_equals_entry");

  const wrongSide = input.side === "long"
    ? input.stopPrice > input.entryPrice
    : input.stopPrice < input.entryPrice;
  if (wrongSide) return rejection("stop_on_wrong_side");

  const lotSize = input.lotSize ?? DEFAULT_LOT_SIZE;
  const riskPerShare = Math.abs(input.entryPrice - input.stopPrice);
  const riskBudgetJpy = input.accountEquityJpy * (input.riskPerTradePct / 100);
  const lotCostJpy = input.entryPrice * lotSize;
  const riskPerLotJpy = riskPerShare * lotSize;

  const warnings: string[] = [];
  const lotsByConstraint: Record<PositionSizingConstraint, number> = {
    risk: Math.floor(riskBudgetJpy / riskPerLotJpy),
    max_position: input.maxPositionPct === undefined
      ? Number.POSITIVE_INFINITY
      : Math.floor((input.accountEquityJpy * (input.maxPositionPct / 100)) / lotCostJpy),
    concurrency: input.maxConcurrentPositions === undefined
      ? Number.POSITIVE_INFINITY
      : Math.floor((input.accountEquityJpy / input.maxConcurrentPositions) / lotCostJpy),
    liquidity:
      input.averageTurnoverJpy === undefined || input.participationLimitPct === undefined
        ? Number.POSITIVE_INFINITY
        : Math.floor((input.averageTurnoverJpy * (input.participationLimitPct / 100)) / lotCostJpy),
  };

  // 1単元も許容リスクに収まらないなら買わない。
  if (lotsByConstraint.risk < 1) {
    return rejection(
      "risk_budget_below_one_lot",
      [
        `1単元のリスクは ${Math.round(riskPerLotJpy).toLocaleString()}円で、`
        + `許容リスク ${Math.round(riskBudgetJpy).toLocaleString()}円を超えます。`
        + "ストップを近づけるか、対象を変えてください",
      ],
    );
  }
  if (lotsByConstraint.max_position < 1) return rejection("max_position_below_one_lot");
  if (lotsByConstraint.concurrency < 1) return rejection("max_position_below_one_lot");
  if (lotsByConstraint.liquidity < 1) return rejection("liquidity_below_one_lot");

  let lots = Number.POSITIVE_INFINITY;
  let bindingConstraint: PositionSizingConstraint | null = null;
  for (const constraint of POSITION_SIZING_CONSTRAINTS) {
    const allowed = lotsByConstraint[constraint];
    if (allowed < lots) {
      lots = allowed;
      bindingConstraint = constraint;
    }
  }

  const shares = lots * lotSize;
  const notionalJpy = shares * input.entryPrice;
  const riskJpy = shares * riskPerShare;
  const riskPctOfEquity = (riskJpy / input.accountEquityJpy) * 100;

  if (notionalJpy > input.accountEquityJpy) {
    warnings.push(
      `建玉 ${Math.round(notionalJpy).toLocaleString()}円が口座評価額を超えています（信用取引前提）`,
    );
  }

  return {
    rejected: false,
    lots,
    shares,
    notionalJpy,
    riskJpy,
    riskPctOfEquity,
    bindingConstraint,
    lotsByConstraint,
    warnings,
  };
}
