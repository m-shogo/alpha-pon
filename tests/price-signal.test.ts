import assert from "node:assert/strict";
import { buildPriceSignalFromQuotes, evaluatePriceRisk } from "../src/analysis/price-signal.js";
import type { DailyQuote } from "../src/fetcher/jquants.js";

function quote(day: number, close: number, volume = 100): DailyQuote {
  const d = String(day).padStart(2, "0");
  return {
    Date: `2026-05-${d}`,
    Code: "TEST",
    Open: close,
    High: close,
    Low: close,
    Close: close,
    Volume: volume,
    AdjustmentFactor: 1,
    AdjustmentClose: close,
    AdjustmentVolume: volume,
  };
}

const quotes = Array.from({ length: 21 }, (_, i) => {
  const day = i + 1;
  const close = day <= 15 ? 100 : 100 + (day - 15) * 6;
  return quote(day, close, day === 21 ? 400 : 100);
});

const benchmark = Array.from({ length: 21 }, (_, i) => quote(i + 1, 100 + i * 0.2, 100));

const signal = buildPriceSignalFromQuotes("TEST", quotes, benchmark);
assert.equal(signal.source, "jquants");
assert.equal(signal.quality, "exact");
assert.ok((signal.change5dPct ?? 0) >= 20);
assert.ok((signal.change20dPct ?? 0) >= 30);
assert.ok((signal.relativeTopix20dPct ?? 0) >= 15);
assert.ok((signal.volumeSpikeRatio ?? 0) >= 2.5);

const warnings = evaluatePriceRisk(signal);
assert.ok(warnings.some(w => w.reason.includes("直近5日")));
assert.ok(warnings.some(w => w.level === "block" && w.reason.includes("直近20日")));
assert.ok(warnings.some(w => w.reason.includes("TOPIX比")));
assert.ok(warnings.some(w => w.reason.includes("出来高")));

console.log("price-signal.test.ts passed");
