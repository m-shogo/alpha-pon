import assert from "node:assert/strict";
import { normalizeCompanyRulesMemoryInput } from "../src/company-rules-memory-input.js";
import { normalizeCompanyRulesUniverseInput } from "../src/company-rules-universe-input.js";
import { buildUniverseScanOutput, parseUniverseScanOutput } from "../src/universe-scan-output.js";
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
assert.throws(
  () => carryForwardStaleCandidate({ ...base, dataSource: "mock" }, "2026-06-08"),
  /stale fallback source provenance is invalid/,
  "J-Quants fallback must not carry a mock candidate into a J-Quants output",
);
assert.throws(
  () => carryForwardStaleCandidate({ ...base, detectedAt: "2026-06-09" }, "2026-06-08"),
  /stale fallback chronology is invalid/,
  "future-detected candidate must not be carried into an earlier PIT snapshot",
);
assert.throws(
  () => carryForwardStaleCandidate({ ...base, detectedAt: "2026-02-31" }, "2026-06-08"),
  /stale fallback chronology is invalid/,
  "nonexistent detectedAt must not enter stale fallback provenance",
);
assert.throws(
  () => carryForwardStaleCandidate(base, "2026-02-31"),
  /stale fallback chronology is invalid/,
  "nonexistent fallback as-of date must fail closed",
);
assert.throws(
  () => carryForwardStaleCandidate({ ...base, fallbackAsOf: "2026-06-09" }, "2026-06-08"),
  /stale fallback chronology is invalid/,
  "a prior fallback timestamp must not be rolled backward",
);
assert.throws(
  () => carryForwardStaleCandidate({ ...base, carriedForwardAt: "2026-02-31" }, "2026-06-08"),
  /stale fallback chronology is invalid/,
  "malformed prior stale lineage must fail closed",
);
assert.throws(
  () => carryForwardStaleCandidate({ ...base, staleAsOf: "2026-05-31" }, "2026-06-08"),
  /stale fallback chronology is invalid/,
  "stale lineage must not predate the candidate detection date",
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
assert.deepEqual(parseUniverseScanOutput(output), output, "canonical scan output は UI consumer でも保持する");
assert.equal(
  parseUniverseScanOutput({ ...output, count: 0 }),
  null,
  "candidate count と矛盾する metadata を UI 正本へ再包装しない",
);
assert.equal(
  parseUniverseScanOutput({ ...output, dataSource: undefined }),
  null,
  "欠落 dataSource を mock として補完しない",
);
assert.equal(
  parseUniverseScanOutput({ ...output, scanStatus: undefined }),
  null,
  "欠落 scanStatus を fresh として補完しない",
);
assert.equal(
  parseUniverseScanOutput({ ...output, fallbackReason: undefined }),
  null,
  "欠落 fallbackReason を canonical null として補完しない",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-02-31",
    dataSource: "jquants",
    scanStatus: "fresh",
    candidates: [base],
  }),
  /generatedAt must be a real YYYY-MM-DD date/,
  "producer must not emit impossible scan dates",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2999-01-01",
    dataSource: "jquants",
    scanStatus: "fresh",
    candidates: [base],
  }),
  /generatedAt must not be in the future/,
  "future scan dates must not enter the current PIT universe snapshot",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-06-08",
    dataSource: "jquants",
    scanStatus: "fresh",
    candidates: [{ ...base, detectedAt: "2026-02-31" }],
  }),
  /candidate detectedAt must be a real YYYY-MM-DD date/,
  "impossible candidate detection dates must not enter scan provenance",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-06-08",
    dataSource: "jquants",
    scanStatus: "fresh",
    candidates: [{ ...base, detectedAt: "2026-06-09" }],
  }),
  /candidate detectedAt must not be after generatedAt/,
  "candidate detection must respect the scan PIT cutoff",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-06-08",
    dataSource: "jquants",
    scanStatus: "fresh",
    candidates: [base, { ...base, name: "重複候補" }],
  }),
  /candidate code must be unique/,
  "duplicate candidate identities must not enter canonical universe scan output",
);
assert.equal(
  parseUniverseScanOutput({ ...output, count: 2, candidates: [carried, { ...carried, name: "重複候補" }] }),
  null,
  "duplicate candidate identities must fail closed at the canonical parser",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-06-08",
    dataSource: "jquants",
    scanStatus: "fresh",
    candidates: [{ ...base, code: " 1234" }],
  }),
  /candidate code must be canonical/,
  "padded candidate identities must not enter canonical universe scan output",
);
assert.equal(
  parseUniverseScanOutput({ ...output, candidates: [{ ...carried, code: "1234 " }] }),
  null,
  "padded candidate identities must fail closed at the canonical parser",
);
assert.equal(
  parseUniverseScanOutput({ ...output, candidates: [{ ...carried, code: undefined }] }),
  null,
  "missing candidate identities must fail closed at the canonical parser",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-06-08",
    dataSource: "jquants",
    scanStatus: "fresh",
    fallbackReason: "jquants_zero_candidates",
    candidates: [base],
  }),
  /fresh universe scan must not carry a fallback reason/,
  "fresh metadata must not be indistinguishable from stale fallback",
);
assert.throws(
  () => buildUniverseScanOutput({
    generatedAt: "2026-06-08",
    dataSource: "mock",
    scanStatus: "mock",
    candidates: [base],
  }),
  /candidate provenance must match output dataSource/,
  "scan-level provenance must agree with every candidate",
);

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

const malformedDetectedAt = normalizeCompanyRulesUniverseInput({
  candidates: [
    { code: "1234", name: "不存在日", dataSource: "jquants", detectedAt: "2026-02-31", currentPrice: 100 },
    { code: "2345", name: "未来日", dataSource: "jquants", detectedAt: "2999-01-01", currentPrice: 100 },
    { code: "3456", name: "timestamp形式", dataSource: "jquants", detectedAt: "2026-06-01T00:00:00+09:00", currentPrice: 100 },
    { code: "4567", name: "正常日", dataSource: "jquants", detectedAt: "2026-06-01", currentPrice: 100 },
  ],
});
assert.deepEqual(
  malformedDetectedAt.rows,
  [{ code: "4567", name: "正常日", dataSource: "jquants", detectedAt: "2026-06-01", currentPrice: 100 }],
  "priceSignal.asOfへ流れるdetectedAtは実在する当日以前のcanonical日付だけを許可する",
);
assert.equal(malformedDetectedAt.invalidRowCount, 3);

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

const malformedBooleans = normalizeCompanyRulesUniverseInput({
  candidates: [
    { code: "1234", name: "negative flag文字列", dataSource: "jquants", hasNegativeFlag: "false" },
    { code: "2345", name: "recent disclosure数値", dataSource: "jquants", hasRecentDisclosure: 1 },
    {
      code: "3456",
      name: "正常boolean",
      dataSource: "jquants",
      hasNegativeFlag: false,
      hasRecentDisclosure: true,
    },
  ],
});
assert.deepEqual(
  malformedBooleans.rows,
  [{
    code: "3456",
    name: "正常boolean",
    dataSource: "jquants",
    hasNegativeFlag: false,
    hasRecentDisclosure: true,
  }],
  "company rule判定に使うboolean provenanceが壊れたrowはtruthy/falsy coercionへ流さない",
);
assert.equal(malformedBooleans.invalidRowCount, 2);

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
