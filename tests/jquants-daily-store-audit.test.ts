// 価格ストア健全性検査のテスト。
//
// 検査そのものが壊れていたら、壊れたデータを「ok」と言い続ける。
// 検出できるべき壊れ方を1つずつ壊して確かめる。

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { auditPriceStore } from "../src/research/providers/jquants-daily-store-audit.js";
import { withAdjustmentHash } from "../src/research/providers/jquants-adjustment-events.js";
import type { PitPriceRecord } from "../src/research/price-store.js";

function record(code: string, tradingDate: string, status: PitPriceRecord["status"] = "traded"): PitPriceRecord {
  const close = 1000;
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code,
    market: "TSE",
    tradingDate,
    dataAsOf: `${tradingDate}T15:30:00+09:00`,
    observedAt: `${tradingDate}T23:59:59.999999999+09:00`,
    retrievedAt: "2026-09-01T00:00:00.000Z",
    firstExecutableAt: "2026-09-01T00:00:00.000Z",
    source: "jquants",
    sourceVersion: "jquants-free-unadjusted-v1",
    providerPlan: "free",
    delayDays: 84,
    isDelayed: true,
    ingestionRunId: "test",
    currency: "JPY",
    status,
    ...(status === "traded"
      ? { ohlcv: { open: close, high: close, low: close, close, volume: 100 } }
      : { missingReason: "no_execution" as const }),
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: "local_only",
    contentHash: `hash-${code}-${tradingDate}`,
  };
}

/** traded 5行 + no_trade 1行 の健全な1日。 */
function healthyDay(date: string, extra: PitPriceRecord[] = []): PitPriceRecord[] {
  const rows = [1, 2, 3, 4, 5].map((n) => record(`1000${n}`, date));
  rows.push(record("20001", date, "no_trade"));
  return [...rows, ...extra];
}

function makeStore(days: Record<string, PitPriceRecord[]>, adjustments: string[] = []): string {
  const root = mkdtempSync(resolve(tmpdir(), "price-audit-"));
  for (const [date, records] of Object.entries(days)) {
    writeFileSync(resolve(root, `${date}.jsonl`), `${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
  }
  if (adjustments.length > 0) {
    writeFileSync(resolve(root, "_adjustments.jsonl"), `${adjustments.join("\n")}\n`);
  }
  return root;
}

const LENIENT = { minRowsPerDay: 1, minTradedRatio: 0.8, sampleDates: 0 };

function codes(root: string, patch?: Parameters<typeof auditPriceStore>[0]): string[] {
  return auditPriceStore({ root, ...LENIENT, ...patch }).findings
    .filter((f) => f.severity === "error").map((f) => f.code);
}

function testHealthyStorePasses(): void {
  const adjustment = JSON.stringify(withAdjustmentHash({
    schemaVersion: 1, code: "10001", effectiveDate: "2025-09-01", factor: 0.5,
    source: "jquants", sourceVersion: "test",
    observedAt: "2025-09-01T23:59:59.999999999+09:00", retrievedAt: "2026-09-01T00:00:00.000Z",
  }));
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01"), "2025-09-02": healthyDay("2025-09-02") }, [adjustment]);
  try {
    const report = auditPriceStore({ root, ...LENIENT });
    assert.deepEqual(report.findings, [], JSON.stringify(report.findings));
    assert.equal(report.datesAudited, 2);
    assert.equal(report.stats.adjustmentEvents, 1);
    assert.equal(report.stats.firstDate, "2025-09-01");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testEmptyStoreIsNotAnError(): void {
  // CI に価格データは無い。ここで落とすと誰も検査を回さなくなる。
  const root = mkdtempSync(resolve(tmpdir(), "price-audit-empty-"));
  try {
    const report = auditPriceStore({ root, ...LENIENT });
    assert.equal(report.datesAudited, 0);
    assert.deepEqual(report.findings, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDetectsTruncatedDay(): void {
  // 取り込みが途中で切れた日。件数でしか分からない。
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01"), "2025-09-02": [record("10001", "2025-09-02")] });
  try {
    assert.ok(codes(root, { minRowsPerDay: 5 }).includes("too_few_rows"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDetectsForeignTradingDate(): void {
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01", [record("30001", "2025-08-29")]) });
  try {
    assert.ok(codes(root).includes("foreign_trading_date"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDetectsDuplicateCode(): void {
  const duplicate = record("10001", "2025-09-01");
  duplicate.contentHash = "other";
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01", [duplicate]) });
  try {
    assert.ok(codes(root).includes("duplicate_code"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDetectsHardeningViolation(): void {
  // 実際に踏んだ欠陥。毎日の3.8%が status=missing / missingReason=unknown だった。
  const broken = record("30001", "2025-09-01", "missing");
  broken.missingReason = "unknown";
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01", [broken]) });
  try {
    assert.ok(codes(root).includes("hardening"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDetectsTradedRatioCollapse(): void {
  // 板が立った行の割合が落ちるのは、取り込みか分類が壊れた兆候。
  const rows = [1, 2, 3, 4, 5].map((n) => record(`1000${n}`, "2025-09-01", "no_trade"));
  rows.push(record("20001", "2025-09-01"));
  const root = makeStore({ "2025-09-01": rows });
  try {
    assert.ok(codes(root).includes("traded_ratio_too_low"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDetectsMissingAdjustmentLedger(): void {
  // 台帳が無いまま走らせると、分割を暴落として検出する。
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01") });
  try {
    const report = auditPriceStore({ root, ...LENIENT });
    assert.ok(report.findings.some((f) => f.code === "adjustment_ledger_missing"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testConflictingAdjustmentsAreReportedNotSwallowed(): void {
  // 同じ日に別の factor は畳めない。例外を握りつぶして ok と言わないこと。
  const base = {
    schemaVersion: 1 as const, code: "10001", effectiveDate: "2025-09-01",
    source: "jquants" as const, sourceVersion: "test",
    observedAt: "2025-09-01T23:59:59.999999999+09:00", retrievedAt: "2026-09-01T00:00:00.000Z",
  };
  const root = makeStore({ "2025-09-01": healthyDay("2025-09-01") }, [
    JSON.stringify(withAdjustmentHash({ ...base, factor: 0.5 })),
    JSON.stringify(withAdjustmentHash({ ...base, factor: 0.1 })),
  ]);
  try {
    assert.ok(codes(root).includes("adjustment_ledger"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testSamplingKeepsFirstAndLast(): void {
  // 抜き取り検査でも端は必ず見る。取り込みの切れ目は末尾に出る。
  const days: Record<string, PitPriceRecord[]> = {};
  for (let day = 1; day <= 20; day += 1) {
    const date = `2025-09-${String(day).padStart(2, "0")}`;
    days[date] = healthyDay(date);
  }
  days["2025-09-20"] = [record("10001", "2025-09-20")];
  const root = makeStore(days);
  try {
    const report = auditPriceStore({ root, sampleDates: 5, minRowsPerDay: 5, minTradedRatio: 0.8 });
    assert.ok(report.datesAudited <= 6, `抜き取りが効いていない: ${report.datesAudited}`);
    assert.ok(
      report.findings.some((f) => f.code === "too_few_rows" && f.message.includes("2025-09-20")),
      "末尾の欠けを見落とした",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
}

testHealthyStorePasses();
testEmptyStoreIsNotAnError();
testDetectsTruncatedDay();
testDetectsForeignTradingDate();
testDetectsDuplicateCode();
testDetectsHardeningViolation();
testDetectsTradedRatioCollapse();
testDetectsMissingAdjustmentLedger();
testConflictingAdjustmentsAreReportedNotSwallowed();
testSamplingKeepsFirstAndLast();

console.log("jquants-daily-store-audit: 全テスト成功");
