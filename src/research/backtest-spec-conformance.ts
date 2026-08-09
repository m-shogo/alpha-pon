import type { BacktestSpec } from "./backtest.js";

const SPEC_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function assertFiniteAtLeast(value: number, minimum: number, field: string): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${field} must be a finite number >= ${minimum}`);
  }
}

function assertOptionalFiniteAtLeast(value: number | undefined, minimum: number, field: string): void {
  if (value === undefined) return;
  assertFiniteAtLeast(value, minimum, field);
}

function assertNonNegativeSafeInteger(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
}

/**
 * Defense-in-depth for callers that invoke runBacktest() directly instead of
 * going through the CLI JSON Schema boundary. Keep these intrinsic numeric and
 * enum constraints aligned with research/schemas/backtest.schema.json.
 */
export function assertBacktestSpecConformance(spec: BacktestSpec): void {
  if (spec.schemaVersion !== 1) throw new Error("backtest spec.schemaVersion must be 1");
  if (typeof spec.id !== "string" || spec.id.length < 6 || !SPEC_ID_PATTERN.test(spec.id)) {
    throw new Error("backtest spec.id must match the canonical lowercase kebab-case contract");
  }
  if (typeof spec.edgeId !== "string" || spec.edgeId.length < 1) {
    throw new Error("backtest spec.edgeId must be a non-empty string");
  }
  if (spec.side !== "long" && spec.side !== "short") {
    throw new Error("backtest spec.side must be long or short");
  }

  assertOptionalFiniteAtLeast(spec.notionalJpy, 1, "backtest spec.notionalJpy");

  if (!["next_open", "same_close", "vwap_next_day"].includes(spec.entry.mode)) {
    throw new Error("backtest spec.entry.mode is invalid");
  }
  assertNonNegativeSafeInteger(spec.entry.lagDays, "backtest spec.entry.lagDays");

  if (!["holding_period", "event_resolution", "stop_or_period"].includes(spec.exit.mode)) {
    throw new Error("backtest spec.exit.mode is invalid");
  }
  if (spec.exit.holdingPeriodDays !== undefined) {
    if (!Number.isSafeInteger(spec.exit.holdingPeriodDays) || spec.exit.holdingPeriodDays < 1) {
      throw new Error("backtest spec.exit.holdingPeriodDays must be a positive safe integer");
    }
  }
  assertOptionalFiniteAtLeast(spec.exit.stopLossBps, 0, "backtest spec.exit.stopLossBps");

  assertFiniteAtLeast(spec.costs.commissionBps, 0, "backtest spec.costs.commissionBps");
  assertFiniteAtLeast(spec.costs.spreadBps, 0, "backtest spec.costs.spreadBps");
  assertFiniteAtLeast(spec.costs.slippageBps, 0, "backtest spec.costs.slippageBps");
  assertOptionalFiniteAtLeast(
    spec.costs.marketImpactBpsPerPctAdv,
    0,
    "backtest spec.costs.marketImpactBpsPerPctAdv",
  );
  assertOptionalFiniteAtLeast(
    spec.costs.borrowCostAnnualBps,
    0,
    "backtest spec.costs.borrowCostAnnualBps",
  );
  if (
    spec.costs.shortRebateAnnualBps !== undefined
    && !Number.isFinite(spec.costs.shortRebateAnnualBps)
  ) {
    throw new Error("backtest spec.costs.shortRebateAnnualBps must be finite");
  }

  const participationLimitPct = spec.liquidity.participationLimitPct;
  if (
    !Number.isFinite(participationLimitPct)
    || participationLimitPct <= 0
    || participationLimitPct > 100
  ) {
    throw new Error("backtest spec.liquidity.participationLimitPct must be > 0 and <= 100");
  }
  assertOptionalFiniteAtLeast(spec.liquidity.minAdtvJpy, 0, "backtest spec.liquidity.minAdtvJpy");

  if (spec.benchmark !== undefined && typeof spec.benchmark !== "string") {
    throw new Error("backtest spec.benchmark must be a string when provided");
  }
  if (spec.notes !== undefined && typeof spec.notes !== "string") {
    throw new Error("backtest spec.notes must be a string when provided");
  }
}
