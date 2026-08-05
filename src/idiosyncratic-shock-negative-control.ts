// Shock strategy固有の効果と「単なる大幅下落後の反発」を分離するためのnegative-control matcher。
// 選定入力にfuture returnを持たせない。reaction時点までのmarket/sector/drawdown/confounder情報だけで決める。

export const SHOCK_NEGATIVE_CONTROL_VERSION = 1 as const;

export type ShockNegativeControlCandidate = {
  ticker: string;
  market: string;
  sector: string;
  reactionDate: string;
  shockDrawdownPct: number;
  relativeShockDrawdownPct: number;
  knownIdiosyncraticShock: boolean;
  materialCorporateEvent: boolean;
  liquidityNormal: boolean;
};

export type ShockNegativeControlTarget = {
  caseId: string;
  ticker: string;
  market: string;
  sector: string;
  reactionDate: string;
  shockDrawdownPct: number;
  relativeShockDrawdownPct: number;
};

export type ShockNegativeControlMatch = {
  controlTicker: string;
  distance: number;
  shockDrawdownGapPct: number;
  relativeDrawdownGapPct: number;
};

export type ShockNegativeControlMatchOptions = {
  maxShockDrawdownGapPct?: number;
  maxRelativeDrawdownGapPct?: number;
  maxControls?: number;
};

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function matchShockNegativeControls(
  target: ShockNegativeControlTarget,
  candidates: ShockNegativeControlCandidate[],
  options: ShockNegativeControlMatchOptions = {},
): ShockNegativeControlMatch[] {
  const maxShockGap = options.maxShockDrawdownGapPct ?? 4;
  const maxRelativeGap = options.maxRelativeDrawdownGapPct ?? 3;
  const maxControls = options.maxControls ?? 3;
  if (!finite(target.shockDrawdownPct) || !finite(target.relativeShockDrawdownPct)) return [];
  if (maxControls <= 0) return [];

  return candidates
    .filter(candidate => candidate.ticker !== target.ticker)
    .filter(candidate => candidate.market === target.market)
    .filter(candidate => candidate.sector === target.sector)
    .filter(candidate => candidate.reactionDate === target.reactionDate)
    .filter(candidate => !candidate.knownIdiosyncraticShock)
    .filter(candidate => !candidate.materialCorporateEvent)
    .filter(candidate => candidate.liquidityNormal)
    .filter(candidate => finite(candidate.shockDrawdownPct) && finite(candidate.relativeShockDrawdownPct))
    .map(candidate => {
      const shockDrawdownGapPct = Math.abs(candidate.shockDrawdownPct - target.shockDrawdownPct);
      const relativeDrawdownGapPct = Math.abs(candidate.relativeShockDrawdownPct - target.relativeShockDrawdownPct);
      // relative market moveを強めに合わせる。同値時はtickerで決定し、selectionをdeterministicにする。
      const distance = relativeDrawdownGapPct * 2 + shockDrawdownGapPct;
      return {
        controlTicker: candidate.ticker,
        distance: round(distance),
        shockDrawdownGapPct: round(shockDrawdownGapPct),
        relativeDrawdownGapPct: round(relativeDrawdownGapPct),
      };
    })
    .filter(match => match.shockDrawdownGapPct <= maxShockGap && match.relativeDrawdownGapPct <= maxRelativeGap)
    .sort((a, b) => a.distance - b.distance || a.controlTicker.localeCompare(b.controlTicker))
    .slice(0, maxControls);
}
