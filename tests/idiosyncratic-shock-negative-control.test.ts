import assert from "node:assert/strict";
import {
  matchShockNegativeControls,
  type ShockNegativeControlCandidate,
} from "../src/idiosyncratic-shock-negative-control.js";

const target = {
  caseId: "shock-a",
  ticker: "AAA",
  market: "US",
  sector: "restaurant_food_service",
  reactionDate: "2020-01-10",
  shockDrawdownPct: -12,
  relativeShockDrawdownPct: -9,
};

const candidates: ShockNegativeControlCandidate[] = [
  {
    ticker: "BBB",
    market: "US",
    sector: "restaurant_food_service",
    reactionDate: "2020-01-10",
    shockDrawdownPct: -11.5,
    relativeShockDrawdownPct: -8.8,
    knownIdiosyncraticShock: false,
    materialCorporateEvent: false,
    liquidityNormal: true,
  },
  {
    ticker: "CCC",
    market: "US",
    sector: "restaurant_food_service",
    reactionDate: "2020-01-10",
    shockDrawdownPct: -13,
    relativeShockDrawdownPct: -9.2,
    knownIdiosyncraticShock: false,
    materialCorporateEvent: false,
    liquidityNormal: true,
  },
  {
    ticker: "DDD",
    market: "US",
    sector: "restaurant_food_service",
    reactionDate: "2020-01-10",
    shockDrawdownPct: -12.1,
    relativeShockDrawdownPct: -9.1,
    knownIdiosyncraticShock: true,
    materialCorporateEvent: false,
    liquidityNormal: true,
  },
  {
    ticker: "EEE",
    market: "US",
    sector: "restaurant_food_service",
    reactionDate: "2020-01-10",
    shockDrawdownPct: -12,
    relativeShockDrawdownPct: -9,
    knownIdiosyncraticShock: false,
    materialCorporateEvent: true,
    liquidityNormal: true,
  },
  {
    ticker: "FFF",
    market: "US",
    sector: "software",
    reactionDate: "2020-01-10",
    shockDrawdownPct: -12,
    relativeShockDrawdownPct: -9,
    knownIdiosyncraticShock: false,
    materialCorporateEvent: false,
    liquidityNormal: true,
  },
];

const matches = matchShockNegativeControls(target, candidates);
assert.deepEqual(matches.map(row => row.controlTicker), ["BBB", "CCC"]);
assert(matches.every(row => row.controlTicker !== "DDD"), "another known shock cannot be a negative control");
assert(matches.every(row => row.controlTicker !== "EEE"), "earnings/guidance/other material event confounder cannot be a negative control");
assert(matches.every(row => row.controlTicker !== "FFF"), "sector mismatch cannot be a negative control");

const deterministic = matchShockNegativeControls(target, [...candidates].reverse());
assert.deepEqual(matches, deterministic, "candidate input ordering must not affect matched controls");

const far = matchShockNegativeControls(target, [{
  ticker: "ZZZ",
  market: "US",
  sector: "restaurant_food_service",
  reactionDate: "2020-01-10",
  shockDrawdownPct: -3,
  relativeShockDrawdownPct: -1,
  knownIdiosyncraticShock: false,
  materialCorporateEvent: false,
  liquidityNormal: true,
}]);
assert.deepEqual(far, [], "a random same-sector stock is not a matched drawdown control");

console.log("idiosyncratic-shock negative control tests: deterministic PIT-only matching OK");
