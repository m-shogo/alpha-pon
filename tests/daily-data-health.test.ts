// 「候補0件」が何を意味するのかを区別できるかのテスト。
//
// 2026-09-10 のレポートは全項目0件で、一見「今日は候補がなかった」ように読めたが、
// 実際は J-Quants 403 で1件もスコアできていなかった。
// この2つが同じ見た目になるのを防ぐ。

import assert from "node:assert/strict";
import {
  assessDailyDataHealth,
  formatDailyDataHealthBanner,
} from "../src/daily-data-health.js";
import type { DataQuality } from "../src/types.js";

function results(qualities: DataQuality[]): Array<{ dataQuality: DataQuality }> {
  return qualities.map((dataQuality) => ({ dataQuality }));
}

function testHealthyRunHasNoBanner() {
  const health = assessDailyDataHealth({ results: results(["ok", "ok", "ok"]), attemptedCount: 3 });
  assert.equal(health.availability, "ok");
  assert.deepEqual(health.warnings, []);
  assert.deepEqual(formatDailyDataHealthBanner(health), [], "正常時にノイズを出さない");
}

function testZeroScoredIsUnavailableNotEmpty() {
  // 今朝の実際の状況。監視対象はあるのに1件もスコアできていない。
  const health = assessDailyDataHealth({ results: [], attemptedCount: 31 });
  assert.equal(health.availability, "unavailable");
  assert.equal(health.usableRatio, null, "0 と算出不能を取り違えない");
  const banner = formatDailyDataHealthBanner(health).join("\n");
  assert.ok(banner.includes("「候補がない」ことを意味しません"));
  assert.ok(banner.includes("31"));
}

function testEmptyWatchlistIsConfigProblem() {
  const health = assessDailyDataHealth({ results: [], attemptedCount: 0 });
  assert.equal(health.availability, "unavailable");
  assert.ok(health.warnings.some((one) => one.includes("watchlist")));
}

function testPartialFetchFailureIsDegraded() {
  // 監視対象10件のうち4件がスコア前に失敗。
  const health = assessDailyDataHealth({ results: results(["ok", "ok", "ok", "ok", "ok", "ok"]), attemptedCount: 10 });
  assert.equal(health.availability, "degraded");
  assert.ok(health.warnings.some((one) => one.includes("4 件がスコア算出前に失敗")));
}

function testLowUsableRatioIsDegraded() {
  const health = assessDailyDataHealth({
    results: results(["ok", "missing", "missing", "partial"]),
    attemptedCount: 4,
  });
  assert.equal(health.availability, "degraded");
  assert.equal(health.usableCount, 1);
  assert.equal(health.missingCount, 2);
  assert.equal(health.partialCount, 1);
  assert.equal(health.usableRatio, 0.25);
  assert.ok(health.warnings.some((one) => one.includes("1/4")));
}

function testRatioThresholdIsConfigurable() {
  const input = { results: results(["ok", "missing"]), attemptedCount: 2 };
  assert.equal(assessDailyDataHealth({ ...input, minUsableRatio: 0.6 }).availability, "degraded");
  assert.equal(assessDailyDataHealth({ ...input, minUsableRatio: 0.5 }).availability, "ok");
}

function testBannerAlwaysCarriesTheBreakdown() {
  const health = assessDailyDataHealth({
    results: results(["ok", "missing", "missing"]),
    attemptedCount: 5,
  });
  const banner = formatDailyDataHealthBanner(health).join("\n");
  assert.ok(banner.includes("監視対象 5"));
  assert.ok(banner.includes("スコア算出 3"));
  assert.ok(banner.includes("ok 1"));
  assert.ok(banner.includes("missing 2"));
}

function testInvalidInputFailsClosed() {
  assert.throws(
    () => assessDailyDataHealth({ results: [], attemptedCount: -1 }),
    /attemptedCount must be a non-negative/,
  );
  assert.throws(
    () => assessDailyDataHealth({ results: results(["ok", "ok"]), attemptedCount: 1 }),
    /cannot exceed attemptedCount/,
    "母数より多い結果は入力の矛盾なので落とす",
  );
  assert.throws(
    () => assessDailyDataHealth({ results: [], attemptedCount: 1, minUsableRatio: 1.5 }),
    /minUsableRatio must be within/,
  );
}

testHealthyRunHasNoBanner();
testZeroScoredIsUnavailableNotEmpty();
testEmptyWatchlistIsConfigProblem();
testPartialFetchFailureIsDegraded();
testLowUsableRatioIsDegraded();
testRatioThresholdIsConfigurable();
testBannerAlwaysCarriesTheBreakdown();
testInvalidInputFailsClosed();

console.log("daily-data-health: 全テスト成功");
