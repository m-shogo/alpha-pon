import assert from "node:assert/strict";
import { carryForwardStaleCandidate, STALE_FALLBACK_WARNING } from "../src/universe-stale-fallback.js";
import type { UniverseCandidate } from "../src/universe.js";

const base: UniverseCandidate = {
  code: "1234",
  name: "テスト",
  sector: "tech",
  detectedAt: "2026-06-01",
  currentPrice: 100,
  high52w: 150,
  drawdownPct: -20,
  operatingProfitYoY: null,
  hasDownwardRevision: false,
  hasNegativeFlag: false,
  hasRecentDisclosure: false,
  matchedWorldEventTags: [],
  screeningScore: 60,
  warnings: [STALE_FALLBACK_WARNING],
  status: "monitoring",
  dataSource: "jquants",
};

const carried = carryForwardStaleCandidate(base, "2026-06-08");
assert.equal(carried.detectedAt, "2026-06-01", "stale fallback でも元の detectedAt を保持する");
assert.equal(carried.staleAsOf, "2026-06-08");
assert.equal(carried.carriedForwardAt, "2026-06-08");
assert.equal(carried.fallbackAsOf, "2026-06-08");
assert.equal(
  carried.warnings.filter(warning => warning === STALE_FALLBACK_WARNING).length,
  1,
  "[STALE] warning は重複追加しない"
);

console.log("universe-stale-fallback.test.ts passed");
