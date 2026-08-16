import assert from "node:assert/strict";
import { normalizeCompanyRulesMemoryInput } from "../src/company-rules-memory-input.js";
import { normalizeCompanyRulesUniverseInput } from "../src/company-rules-universe-input.js";
import { buildUniverseScanOutput } from "../src/universe-scan-output.js";
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

const output = buildUniverseScanOutput({
  generatedAt: "2026-06-08",
  dataSource: "jquants",
  scanStatus: "stale_fallback",
  fallbackReason: "jquants_zero_candidates",
  candidates: [carried],
});
assert.equal(output.scanStatus, "stale_fallback");
assert.equal(output.fallbackReason, "jquants_zero_candidates");
assert.equal(output.candidates[0]?.detectedAt, "2026-06-01", "scan metadata 追加後も detectedAt は保持する");

const malformedContainer = normalizeCompanyRulesUniverseInput({ candidates: {} });
assert.deepEqual(malformedContainer.rows, [], "object-shaped candidates は company rules へ流さない");
assert.equal(malformedContainer.status, "invalid_candidates");

const mixedRows = normalizeCompanyRulesUniverseInput({
  candidates: [{ code: "1234" }, null, "bad-row", ["bad-row"]],
});
assert.deepEqual(mixedRows.rows, [{ code: "1234" }], "object row 以外は隔離する");
assert.equal(mixedRows.status, "ok");
assert.equal(mixedRows.invalidRowCount, 3);

const validMemory = normalizeCompanyRulesMemoryInput({
  code: "1234",
  watchReason: ["監視理由"],
  knownRisks: ["既知リスク"],
  recurringWarnings: ["継続警告"],
});
assert.equal(validMemory.status, "ok");
assert.deepEqual(validMemory.record?.knownRisks, ["既知リスク"]);

const malformedMemory = normalizeCompanyRulesMemoryInput({ knownRisks: {} });
assert.equal(malformedMemory.status, "invalid_field");
assert.equal(malformedMemory.record, null, "object-shaped memory arrays は company rules へ流さない");

console.log("universe-stale-fallback.test.ts passed");
