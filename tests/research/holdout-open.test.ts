// 封印を開けて確認を1回だけ行うための判定のテスト。
//
// 守りたい性質:
//   1. 確認期間の長さは、取り込み済みの営業日の数で決める（価格を見ない）
//   2. 期間内の平日に取り込みの穴があれば開けない
//   3. 1 Edge 1回。production_gate の記録があれば開け直せない
//   4. 事前登録が条件（bundle・開始日・営業日数）を書いていなければ開けない
//   5. 合格は「補正後 t ≥ 閾値 かつ Net > 0」。約定なしは不合格
//   6. 記録はスキーマに合う

import assert from "node:assert/strict";
import {
  assertNotOpenedBefore,
  assertPreregistrationMatches,
  buildAccessEntry,
  judgeConfirmation,
  judgeEventStudy,
  missingWeekdays,
  overlappingWindows,
  resolveConfirmationRange,
} from "../../src/research/holdout-open.js";
import { loadSchema } from "../../src/research/io.js";
import { validate } from "../../src/research/schema.js";

function testRangeIsCountedFromIngestedTradingDays() {
  const tradingDates = ["2026-02-27", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"];
  assert.deepEqual(
    resolveConfirmationRange({ tradingDates, from: "2026-03-01", tradingDays: 3 }),
    { to: "2026-03-04", available: 4 },
    "開始日より前の日は数えない",
  );
  assert.deepEqual(
    resolveConfirmationRange({ tradingDates, from: "2026-03-01", tradingDays: 5 }),
    { to: null, available: 4 },
    "足りなければまだ開けない",
  );
  assert.deepEqual(
    resolveConfirmationRange({ tradingDates: [...tradingDates].reverse().concat("2026-03-02"), from: "2026-03-02", tradingDays: 1 }),
    { to: "2026-03-02", available: 4 },
    "順序と重複に依存しない",
  );
  assert.throws(() => resolveConfirmationRange({ tradingDates, from: "2026/03/01", tradingDays: 3 }), /YYYY-MM-DD/);
  assert.throws(() => resolveConfirmationRange({ tradingDates, from: "2026-03-01", tradingDays: 0 }), /1 以上/);
}

function testMissingWeekdaysBlockTheOpen() {
  const completed = new Set(["2026-03-02", "2026-03-03", "2026-03-05", "2026-03-06"]);
  assert.deepEqual(
    missingWeekdays({ from: "2026-02-28", to: "2026-03-08", completedDates: completed }),
    ["2026-03-04"],
    "週末は数えず、平日の穴だけを返す",
  );
  assert.deepEqual(
    missingWeekdays({ from: "2026-03-02", to: "2026-03-03", completedDates: completed }),
    [],
  );
}

function testOneOpenPerEdge() {
  assert.doesNotThrow(() => assertNotOpenedBefore([], "generic-reversal"));
  assert.doesNotThrow(
    () => assertNotOpenedBefore(
      [{ id: "hold-x", edgeId: "other-edge", purpose: "production_gate", openedAt: "2026-01-01T00:00:00+09:00" }],
      "generic-reversal",
    ),
    "別の Edge の開封は関係ない",
  );
  assert.throws(
    () => assertNotOpenedBefore(
      [{ id: "hold-y", edgeId: "generic-reversal", purpose: "production_gate", openedAt: "2026-01-01T00:00:00+09:00" }],
      "generic-reversal",
    ),
    /開封済み.*hold-y/,
  );
}

function testWindowsOverlap() {
  const manifest = {
    schemaVersion: 1 as const,
    sealedAt: "2026-08-04",
    policy: "p",
    windows: [
      { id: "vault-a", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" as const },
      { id: "vault-b", from: "2027-01-01", to: "2027-06-30", scope: "all_universe" as const },
    ],
  };
  assert.deepEqual(overlappingWindows(manifest, "2026-03-01", "2026-12-02"), ["vault-a"]);
  assert.deepEqual(overlappingWindows(manifest, "2026-07-01", "2026-12-31"), [], "封印の後ろだけなら開封ではない");
  assert.deepEqual(overlappingWindows(manifest, "2026-06-30", "2027-01-01"), ["vault-a", "vault-b"], "端の1日でも重なる");
}

function testPreregistrationMustStateTheConditions() {
  const text = [
    "bundle: `research/studies/x.json`",
    "期間: **2026-03-01 以降の 189 営業日**",
    "合格: 補正後 t ≥ 1.96、最小クラスタ 20",
  ].join("\n");
  const ok = { bundlePath: "research/studies/x.json", from: "2026-03-01", tradingDays: 189, minT: 1.96, minClusters: 20 };
  assert.doesNotThrow(() => assertPreregistrationMatches(text, ok));
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, bundlePath: "research/studies/y.json" }), /bundle research\/studies\/y.json/);
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, from: "2026-04-01" }), /開始日/);
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, tradingDays: 89 }), /89 営業日/, "189 の中の 89 に一致させない");
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, minT: 1.5 }), /閾値 1.5/, "引数の閾値が登録と違えば止める");
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, minT: 1.9 }), /閾値 1.9/, "1.96 の中の 1.9 に一致させない");
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, minT: 96 }), /閾値 96/, "1.96 の中の 96 に一致させない");
  assert.throws(() => assertPreregistrationMatches(text, { ...ok, minClusters: 2 }), /最小クラスタ 2/, "20 の中の 2 に一致させない");
}

const BASE_CONFIRM = { clusteredTStat: 1.96, meanNetAlphaBps: 10, executedCount: 50, clusterCount: 30, minT: 1.96, minClusters: 20 };

function testJudgement() {
  assert.equal(judgeConfirmation(BASE_CONFIRM).result, "pass", "閾値ちょうどは合格");
  assert.equal(judgeConfirmation({ ...BASE_CONFIRM, clusteredTStat: 1.95 }).result, "fail");
  assert.equal(judgeConfirmation({ ...BASE_CONFIRM, clusteredTStat: 2.5, meanNetAlphaBps: -1 }).result, "fail", "Net が負なら不合格");
  assert.equal(judgeConfirmation({ ...BASE_CONFIRM, clusteredTStat: -3, meanNetAlphaBps: -100 }).result, "fail", "逆向きに有意でも不合格");
  assert.equal(judgeConfirmation({ ...BASE_CONFIRM, clusteredTStat: null, executedCount: 0, clusterCount: null }).result, "fail");
  const small = judgeConfirmation({ ...BASE_CONFIRM, clusteredTStat: 400, clusterCount: 19 });
  assert.equal(small.result, "fail", "クラスタが少なければ t が大きくても不合格");
  assert.match(small.reason, /標本不足: クラスタ 19 < 20/);
  assert.equal(judgeConfirmation({ ...BASE_CONFIRM, clusterCount: 20 }).result, "pass", "最小クラスタちょうどは判定する");
  assert.throws(() => judgeConfirmation({ ...BASE_CONFIRM, minT: 0 }), /minT/);
  assert.throws(() => judgeConfirmation({ ...BASE_CONFIRM, minClusters: 1 }), /minClusters/);
}

const BASE_EVENT = { clusteredTStat: 2.1, count: 40, clusterCount: 30, minAbsT: 1.96, minClusters: 20 };

function testEventStudyJudgementIsTwoSided() {
  const positive = judgeEventStudy(BASE_EVENT);
  assert.deepEqual([positive.result, positive.direction], ["pass", "positive"]);
  const negative = judgeEventStudy({ ...BASE_EVENT, clusteredTStat: -1.96 });
  assert.deepEqual([negative.result, negative.direction], ["pass", "negative"], "負の向きも閾値ちょうどで反応あり");
  const weak = judgeEventStudy({ ...BASE_EVENT, clusteredTStat: -1.5 });
  assert.deepEqual([weak.result, weak.direction], ["fail", "none"]);
  const small = judgeEventStudy({ ...BASE_EVENT, clusteredTStat: -396, clusterCount: 2 });
  assert.deepEqual([small.result, small.direction], ["fail", "none"], "2クラスタの t = -396 を反応とは呼ばない");
  assert.equal(judgeEventStudy({ ...BASE_EVENT, clusteredTStat: null, count: 0, clusterCount: null }).result, "fail");
  assert.throws(() => judgeEventStudy({ ...BASE_EVENT, minAbsT: -1 }), /minT/);
}

function testAccessEntryWithoutNetAlphaIsValid() {
  // イベントスタディはコスト前なので netAlphaBps を持たない。
  const entry = buildAccessEntry({
    edgeId: "misconduct-disclosure",
    windowId: "vault-2026h2-2027h1",
    openedAt: "2027-08-02T09:00:00.000+09:00",
    actor: "claude-code",
    result: "pass",
    sampleCount: 31,
    notes: "{}",
  });
  assert.equal("netAlphaBps" in entry, false);
  assert.deepEqual(validate(entry, loadSchema("holdout-access")), []);
}

function testAccessEntryMatchesTheSchema() {
  const entry = buildAccessEntry({
    edgeId: "generic-reversal",
    windowId: "vault-2025h2-2026h1",
    openedAt: "2027-02-20T09:00:00.000+09:00",
    actor: "claude-code",
    result: "fail",
    netAlphaBps: -12.5,
    sampleCount: 88,
    notes: JSON.stringify({ from: "2026-03-01" }),
  });
  assert.deepEqual(validate(entry, loadSchema("holdout-access")), [], "access_log のスキーマに合う");
  assert.equal(entry.purpose, "production_gate");
  assert.match(entry.id, /^hold-[0-9a-f]{16}$/);
  const again = buildAccessEntry({
    edgeId: "generic-reversal",
    windowId: "vault-2025h2-2026h1",
    openedAt: "2027-02-20T09:00:00.000+09:00",
    actor: "claude-code",
    result: "fail",
    netAlphaBps: -12.5,
    sampleCount: 88,
    notes: JSON.stringify({ from: "2026-03-01" }),
  });
  assert.equal(entry.id, again.id, "同じ内容なら同じ ID");
}

testRangeIsCountedFromIngestedTradingDays();
testMissingWeekdaysBlockTheOpen();
testOneOpenPerEdge();
testWindowsOverlap();
testPreregistrationMustStateTheConditions();
testJudgement();
testEventStudyJudgementIsTwoSided();
testAccessEntryWithoutNetAlphaIsValid();
testAccessEntryMatchesTheSchema();

console.log("research/holdout-open: 全テスト成功");
