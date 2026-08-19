import assert from "node:assert/strict";
import { carryForwardValidStaleCandidates } from "../src/universe-stale-fallback.js";
import type { UniverseCandidate } from "../src/universe.js";

const valid: UniverseCandidate = {
  code: "1234",
  name: "valid",
  sector: "tech",
  detectedAt: "2026-08-18",
  currentPrice: 100,
  high52w: 150,
  drawdownPct: -20,
  operatingProfitYoY: null,
  hasDownwardRevision: false,
  hasNegativeFlag: false,
  hasRecentDisclosure: false,
  matchedWorldEventTags: [],
  screeningScore: 60,
  warnings: [],
  status: "monitoring",
  dataSource: "jquants",
};

const mixed = carryForwardValidStaleCandidates(
  [
    valid,
    { ...valid, code: "9999", dataSource: "mock" },
    { ...valid, code: "8888", detectedAt: "2026-08-21" },
    null,
  ],
  "2026-08-20",
);

assert.equal(mixed.candidates.length, 1, "invalid stale rows must not discard a valid J-Quants fallback row");
assert.equal(mixed.candidates[0]?.code, "1234");
assert.equal(mixed.candidates[0]?.staleAsOf, "2026-08-20");
assert.equal(mixed.invalidRowCount, 3);

const invalidRoot = carryForwardValidStaleCandidates({ candidates: [valid] }, "2026-08-20");
assert.deepEqual(invalidRoot.candidates, []);
assert.equal(invalidRoot.invalidRowCount, 1, "object-shaped candidate root must fail closed without throwing");

console.log("universe-stale-fallback-row-isolation.test.ts passed");
