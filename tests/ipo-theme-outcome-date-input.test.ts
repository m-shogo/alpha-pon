import assert from "node:assert/strict";
import { addDaysJst, todayJst } from "../src/date.js";
import { isIpoThemeOutcomeInput } from "../src/ipo-theme-watch-input.js";

function outcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: "8136",
    name: "Company 8136",
    hypothesis: {
      reason: "IPO theme",
      relatedWorldEventIds: [],
      evidenceNeeded: [],
      invalidationSignals: [],
    },
    actionLabel: "watch",
    result: "hit",
    return1w: null,
    return1m: null,
    relativeToTopix1m: null,
    maxDrawdownPct: null,
    ...overrides,
  };
}

assert.equal(
  isIpoThemeOutcomeInput(outcome()),
  true,
  "legacy partial IPO outcome rows without chronology fields remain supported",
);

assert.equal(
  isIpoThemeOutcomeInput(outcome({ evaluatedAt: addDaysJst(todayJst(), 1) })),
  false,
  "future evaluation evidence must not enter current IPO outcome statistics",
);

assert.equal(
  isIpoThemeOutcomeInput(outcome({ evaluatedAt: "2026-02-31" })),
  false,
  "nonexistent evaluation dates must fail closed",
);

assert.equal(
  isIpoThemeOutcomeInput(outcome({
    hypothesis: {
      reason: "IPO theme",
      relatedWorldEventIds: [],
      evidenceNeeded: [],
      invalidationSignals: [],
      detectedAt: "2026-02-31",
    },
  })),
  false,
  "nonexistent detectedAt provenance must fail closed when present",
);

assert.equal(
  isIpoThemeOutcomeInput(outcome({
    hypothesis: {
      reason: "IPO theme",
      relatedWorldEventIds: [],
      evidenceNeeded: [],
      invalidationSignals: [],
      detectedAt: "2026-08-20",
    },
    evaluatedAt: "2026-08-19",
  })),
  false,
  "evaluation provenance must not precede hypothesis detection",
);

assert.equal(
  isIpoThemeOutcomeInput(outcome({
    hypothesis: {
      reason: "IPO theme",
      relatedWorldEventIds: [],
      evidenceNeeded: [],
      invalidationSignals: [],
      detectedAt: "2026-08-19",
    },
    evaluatedAt: "2026-08-20",
  })),
  true,
  "canonical historical chronology remains usable",
);

console.log("ipo-theme-outcome-date-input: optional chronology fails closed when present OK");
