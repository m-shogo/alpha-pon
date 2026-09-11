// 朝のレポート（reports/latest.md）のテスト。
//
// ユーザーが毎朝読む唯一の出力なのに、テストが1本も無かった。
// 2026-09-11 に開示欠落のバナーを足したので、ここで最低限を固定する。
//
// 守りたい性質:
//   1. 「候補がない」と「データが無い」を同じ見た目にしない
//   2. 開示の欠落は**期限つきで**出る。取り戻せなくなる前に気づけること
//   3. 問題が無い朝は余計な文言を出さない（毎朝出ると読まれなくなる）
//   4. 監査を渡さなくてもレポートは壊れない（daily 側で失敗しても止めない）

import assert from "node:assert/strict";
import { generateSummaryReport } from "../src/report.js";
import { assessDailyDataHealth } from "../src/daily-data-health.js";
import { auditDisclosureArchive } from "../src/disclosure-archive-audit.js";
import type { ScoreResult } from "../src/types.js";

const TODAY = "2026-09-15";

function result(over: Partial<ScoreResult> = {}): ScoreResult {
  return {
    candidate: {
      code: "7203", name: "テスト自動車", market: "prime",
      status: "watch", priority: "medium", tags: [], rules: [],
    },
    breakdown: {
      structuralEvent: 1, supplyDemand: 1, valuation: 1,
      theme: 1, businessSafety: 1, aiReview: 0,
    },
    score: 5,
    alertLevel: "log",
    reasons: ["テスト"],
    negativeReasons: [],
    nextSteps: [],
    dataQuality: "ok",
    warnings: [],
    createdAt: `${TODAY}T09:00:00+09:00`,
    ...over,
  };
}

/** 2026-09-14(月) と 09-15(火) が抜けている保存庫。 */
function gappedArchive() {
  return auditDisclosureArchive({
    today: TODAY,
    archivedDates: ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"],
  });
}

function completeArchive() {
  return auditDisclosureArchive({
    today: TODAY,
    archivedDates: [
      "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
      "2026-09-14", "2026-09-15",
    ],
  });
}

function testReportRendersWithoutOptionalInputs(): void {
  // daily 側は監査に失敗してもレポートを出す。渡されなくても壊れないこと。
  const report = generateSummaryReport([result()], TODAY);
  assert.ok(report.includes("alpha-pon 調査候補レポート"));
  assert.ok(report.includes(TODAY));
  assert.ok(report.includes("買い推奨ではありません"));
}

function testDisclosureGapAppearsWithDeadline(): void {
  // 「抜けている」だけでは動けない。あと何日で取り戻せなくなるかを出す。
  const report = generateSummaryReport([result()], TODAY, undefined, gappedArchive());
  assert.ok(report.includes("開示の記録が"), report.slice(0, 400));
  assert.ok(/あと \d+ 日で取り戻せなくなります/.test(report));
  assert.ok(report.includes("pnpm archive:tdnet"), "埋め方が書かれていない");
  assert.ok(report.includes("--execute"), "dry-run を案内しても何も起きない");
}

function testNoBannerWhenArchiveIsComplete(): void {
  // 問題が無い朝に余計な文言を出さない。毎朝出ると読まれなくなる。
  const report = generateSummaryReport([result()], TODAY, undefined, completeArchive());
  assert.ok(!report.includes("開示の記録が"), report.slice(0, 400));
}

function testDataHealthAndDisclosureBannersCoexist(): void {
  // データ欠落と開示欠落は別の話。片方が出たらもう片方が消える、では困る。
  const health = assessDailyDataHealth({
    results: [result({ dataQuality: "missing" })],
    attemptedCount: 10,
  });
  assert.notEqual(health.availability, "ok", "テスト前提: degraded な健全性");

  const report = generateSummaryReport([result()], TODAY, health, gappedArchive());
  assert.ok(report.includes("データ"), "データ健全性のバナーが消えている");
  assert.ok(report.includes("開示の記録が"), "開示のバナーが消えている");
}

function testBannersComeBeforeTheCounts(): void {
  // 件数を先に見せてからバナーを出すと、件数を鵜呑みにされる。
  const report = generateSummaryReport([result()], TODAY, undefined, gappedArchive());
  const banner = report.indexOf("開示の記録が");
  const firstCount = report.indexOf("件");
  assert.ok(banner >= 0 && firstCount >= 0);
  assert.ok(banner < firstCount, "バナーより先に件数が出ている");
}

testReportRendersWithoutOptionalInputs();
testDisclosureGapAppearsWithDeadline();
testNoBannerWhenArchiveIsComplete();
testDataHealthAndDisclosureBannersCoexist();
testBannersComeBeforeTheCounts();

console.log("summary-report-banners: 全テスト成功");
