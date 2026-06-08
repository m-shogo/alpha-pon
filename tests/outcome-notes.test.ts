import assert from "node:assert/strict";
import { buildOutcomeNotes } from "../src/outcome-notes.js";
import type { StockCandidateHypothesis } from "../src/universe.js";

function hypothesis(expectedDirection: StockCandidateHypothesis["expectedDirection"]): StockCandidateHypothesis {
  return {
    schemaVersion: 1,
    code: "1234",
    name: "テスト",
    detectedAt: "2026-06-01",
    reviewDueAt: "2026-07-01",
    reason: "test",
    expectedTimeframe: "1m",
    expectedDirection,
    confidence: 0.5,
    invalidationSignals: [],
    evidenceNeeded: [],
    relatedWorldEventIds: [],
    relatedDisclosureIds: [],
    status: "open",
    label: "検証候補",
  };
}

{
  const notes = buildOutcomeNotes({
    hypothesis: hypothesis("unknown"),
    returns: { ret1m: null, maxDrawdownPct: null, dataAvailability: "missing" },
    relativeToTopix1m: null,
    result: "unknown",
    dataSource: "jquants",
  });
  assert.equal(notes.whatMatched.length, 0, "unknown 同士を一致扱いしない");
  assert(notes.missedSignals.some(signal => signal.includes("未評価")));
  assert(notes.notes.includes("価格データ不足"));
}

{
  const notes = buildOutcomeNotes({
    hypothesis: hypothesis("up"),
    returns: { ret1m: 4.2, maxDrawdownPct: null, dataAvailability: "partial" },
    relativeToTopix1m: 1.1,
    result: "hit",
    dataSource: "jquants",
  });
  assert.equal(notes.whatMatched.length, 0, "partial data では方向/TOPIXを一致扱いしない");
  assert(notes.missedSignals.some(signal => signal.includes("partial")));
}

{
  const notes = buildOutcomeNotes({
    hypothesis: hypothesis("up"),
    returns: { ret1m: 4.2, maxDrawdownPct: null, dataAvailability: "ok" },
    relativeToTopix1m: 1.1,
    result: "hit",
    dataSource: "jquants",
  });
  assert(notes.whatMatched.some(match => match.includes("期待方向 up")));
  assert(notes.whatMatched.some(match => match.includes("TOPIX比")));
}

console.log("outcome-notes.test.ts passed");
