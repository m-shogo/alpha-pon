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

const minimalValidRow = { code: "1234", name: "テスト", dataSource: "jquants" };
const mixedRows = normalizeCompanyRulesUniverseInput({
  candidates: [minimalValidRow, null, "bad-row", ["bad-row"]],
});
assert.deepEqual(mixedRows.rows, [minimalValidRow], "object row 以外は隔離する");
assert.equal(mixedRows.status, "ok");
assert.equal(mixedRows.invalidRowCount, 3);

const malformedIdentity = normalizeCompanyRulesUniverseInput({
  candidates: [
    {},
    { code: "1234", dataSource: "jquants" },
    { code: "1234 ", name: "空白code", dataSource: "jquants" },
    { code: "2345", name: "不明source", dataSource: "external" },
    { code: "3456", name: "mock候補", dataSource: "mock" },
  ],
});
assert.deepEqual(
  malformedIdentity.rows,
  [{ code: "3456", name: "mock候補", dataSource: "mock" }],
  "identity/provenanceが壊れたrowを実データ候補として company rules へ流さない",
);
assert.equal(malformedIdentity.invalidRowCount, 4);

const malformedNumerics = normalizeCompanyRulesUniverseInput({
  candidates: [
    { code: "1234", name: "文字列騰落率", dataSource: "jquants", change5dPct: "10" },
    { code: "2345", name: "無限値", dataSource: "jquants", volumeSpikeRatio: Number.POSITIVE_INFINITY },
    {
      code: "3456",
      name: "正常numeric",
      dataSource: "jquants",
      currentPrice: 100,
      drawdownPct: -20,
      change5dPct: 10,
      volumeSpikeRatio: null,
    },
  ],
});
assert.deepEqual(
  malformedNumerics.rows,
  [{
    code: "3456",
    name: "正常numeric",
    dataSource: "jquants",
    currentPrice: 100,
    drawdownPct: -20,
    change5dPct: 10,
    volumeSpikeRatio: null,
  }],
  "価格risk計算で比較/toFixedするnumeric fieldが壊れたrowは company rules へ流さない",
);
assert.equal(malformedNumerics.invalidRowCount, 2);

const malformedArrayFields = normalizeCompanyRulesUniverseInput({
  candidates: [
    { code: "1234", name: "warnings不正", dataSource: "jquants", warnings: {} },
    { code: "2345", name: "theme不正", dataSource: "jquants", matchedWorldEventTags: "theme" },
    {
      code: "3456",
      name: "price risk不正",
      dataSource: "jquants",
      priceRiskWarnings: [{ level: "warning", reason: "risk", evidence: {} }],
    },
    {
      code: "4567",
      name: "正常候補",
      dataSource: "jquants",
      warnings: ["warning"],
      matchedWorldEventTags: ["theme"],
      priceRiskWarnings: [{ level: "warning", reason: "risk", evidence: ["evidence"] }],
    },
  ],
});
assert.deepEqual(
  malformedArrayFields.rows,
  [{
    code: "4567",
    name: "正常候補",
    dataSource: "jquants",
    warnings: ["warning"],
    matchedWorldEventTags: ["theme"],
    priceRiskWarnings: [{ level: "warning", reason: "risk", evidence: ["evidence"] }],
  }],
  "spread/join対象のarray fieldが壊れたrowは company rules へ流さない",
);
assert.equal(malformedArrayFields.invalidRowCount, 3);

const duplicateCodes = normalizeCompanyRulesUniverseInput({
  candidates: [
    { code: "1234", name: "候補A", dataSource: "jquants", currentPrice: 100 },
    { code: "1234", name: "候補B", dataSource: "jquants", currentPrice: 120 },
    { code: "2345", name: "一意候補", dataSource: "mock" },
  ],
});
assert.deepEqual(
  duplicateCodes.rows,
  [{ code: "2345", name: "一意候補", dataSource: "mock" }],
  "同一codeの複数候補はどちらを正本にするか決められないため両方を隔離する",
);
assert.equal(duplicateCodes.invalidRowCount, 2);

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
