import assert from "node:assert/strict";
import { buildOutcomeNotes, resolveActualDirection } from "../src/outcome-notes.js";
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
  assert.equal(resolveActualDirection(null), "unknown");
  assert.equal(resolveActualDirection(Number.NaN), "unknown", "NaN を実績方向へ分類しない");
  assert.equal(resolveActualDirection(Number.POSITIVE_INFINITY), "unknown", "Infinity を上昇実績へ分類しない");
  assert.equal(resolveActualDirection(Number.NEGATIVE_INFINITY), "unknown", "-Infinity を下落実績へ分類しない");
  assert.equal(resolveActualDirection(3), "up");
  assert.equal(resolveActualDirection(-3), "down");
  assert.equal(resolveActualDirection(2.9), "sideways");
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

{
  const notes = buildOutcomeNotes({
    hypothesis: hypothesis("up"),
    returns: { ret1m: Number.POSITIVE_INFINITY, maxDrawdownPct: Number.NEGATIVE_INFINITY, dataAvailability: "ok" },
    relativeToTopix1m: Number.NaN,
    result: "hit",
    dataSource: "jquants",
  });
  assert.equal(notes.whatMatched.length, 0, "非finite値を方向一致・TOPIX一致Evidenceへ変換しない");
  assert.equal(notes.whatDiffered.length, 0, "非finite値を反証Evidenceへ変換しない");
  assert(notes.missedSignals.some(signal => signal.includes("dataAvailability=ok")), "okなのに1mリターンが非finiteなら不整合を明示する");
  assert(!notes.missedSignals.some(signal => signal.includes("最大下落")), "非finite drawdownを最大下落Evidenceへ変換しない");
  assert(!notes.notes.includes("Infinity"), "read-only notesへInfinityを露出しない");
  assert(!notes.notes.includes("NaN"), "read-only notesへNaNを露出しない");
  assert(notes.notes.includes("1m=N/A%"));
  assert(notes.notes.includes("TOPIX比=N/A%"));
}

{
  const notes = buildOutcomeNotes({
    hypothesis: hypothesis("down"),
    returns: { ret1m: null, maxDrawdownPct: null, dataAvailability: "ok" },
    relativeToTopix1m: null,
    result: "unknown",
    dataSource: "jquants",
  });
  assert.equal(notes.whatMatched.length, 0, "欠落1mリターンを方向一致Evidenceへ変換しない");
  assert(notes.missedSignals.some(signal => signal.includes("dataAvailability=ok")), "okなのに1mリターン欠落ならread-only監査へ残す");
}

console.log("outcome-notes.test.ts passed");
