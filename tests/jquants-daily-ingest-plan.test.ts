// 履歴取り込み計画のテスト。
//
// 取り込みは必ず中断される（2年分で1時間超、バースト枠で不定期に90秒待ち）。
// 「中断されても壊れない・続きから再開できる」が唯一の要件なので、
// 再開時の日付集合が正しいことをここで固定する。

import assert from "node:assert/strict";
import {
  completedDatesFrom,
  dayOfWeek,
  estimateIngestSeconds,
  formatDuration,
  isCompletedIngest,
  isWeekend,
  parseIngestLedger,
  planIngest,
} from "../src/research/providers/jquants-daily-ingest.js";

function testPlanCoversInclusiveRange(): void {
  const plan = planIngest({ from: "2025-09-01", to: "2025-09-05", completed: [] });
  // 2025-09-01(月) 〜 09-05(金) は全部平日。
  assert.deepEqual(plan.pending, [
    "2025-09-01", "2025-09-02", "2025-09-03", "2025-09-04", "2025-09-05",
  ]);
  assert.equal(plan.totalCalendarDays, 5, "from と to の両端を含む");
}

function testWeekendsAreNotRequested(): void {
  // 2025-09-06 は土曜、09-07 は日曜。東証は立たないので問い合わせない。
  assert.equal(dayOfWeek("2025-09-06"), 6);
  assert.equal(dayOfWeek("2025-09-07"), 0);
  assert.ok(isWeekend("2025-09-06") && isWeekend("2025-09-07"));

  const plan = planIngest({ from: "2025-09-05", to: "2025-09-08", completed: [] });
  assert.deepEqual(plan.pending, ["2025-09-05", "2025-09-08"]);
  assert.equal(plan.skippedWeekends, 2);
}

function testWeekendSkipCanBeDisabled(): void {
  // 祝日は事前に分からないので問い合わせる。土日も強制したい場面のための逃げ道。
  const plan = planIngest({ from: "2025-09-06", to: "2025-09-07", completed: [], skipWeekends: false });
  assert.deepEqual(plan.pending, ["2025-09-06", "2025-09-07"]);
  assert.equal(plan.skippedWeekends, 0);
}

function testResumeSkipsCompletedDates(): void {
  const plan = planIngest({
    from: "2025-09-01",
    to: "2025-09-05",
    completed: ["2025-09-01", "2025-09-02", "2025-09-04"],
  });
  assert.deepEqual(plan.pending, ["2025-09-03", "2025-09-05"], "穴あきでも埋め直す");
  assert.equal(plan.skippedCompleted, 3);
}

function testCompletedWeekendCountsAsCompletedNotWeekend(): void {
  // 取り込み済みの土日（＝祝日判定を記録した日）を週末スキップに数え直すと、
  // 再開のたびに集計がぶれて進捗が信用できなくなる。
  const plan = planIngest({
    from: "2025-09-06",
    to: "2025-09-07",
    completed: ["2025-09-06"],
  });
  assert.equal(plan.skippedCompleted, 1);
  assert.equal(plan.skippedWeekends, 1);
  assert.deepEqual(plan.pending, []);
}

function testResumeIsIdempotent(): void {
  // 全部完了した状態でもう一度計画すると、何も要求しない。
  const first = planIngest({ from: "2025-09-01", to: "2025-09-03", completed: [] });
  const second = planIngest({ from: "2025-09-01", to: "2025-09-03", completed: first.pending });
  assert.deepEqual(second.pending, []);
  const third = planIngest({ from: "2025-09-01", to: "2025-09-03", completed: second.pending });
  assert.deepEqual(third.pending, ["2025-09-01", "2025-09-02", "2025-09-03"],
    "テスト前提: 空を渡せば全部戻る（second が空なのは completed のおかげ）");
}

function testMonthAndYearBoundaries(): void {
  const acrossMonth = planIngest({ from: "2025-01-30", to: "2025-02-03", completed: [], skipWeekends: false });
  assert.deepEqual(acrossMonth.pending, [
    "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02", "2025-02-03",
  ]);
  const acrossYear = planIngest({ from: "2024-12-30", to: "2025-01-02", completed: [], skipWeekends: false });
  assert.deepEqual(acrossYear.pending, ["2024-12-30", "2024-12-31", "2025-01-01", "2025-01-02"]);
  // 2024 は閏年。
  const leap = planIngest({ from: "2024-02-28", to: "2024-03-01", completed: [], skipWeekends: false });
  assert.deepEqual(leap.pending, ["2024-02-28", "2024-02-29", "2024-03-01"]);
}

function testSingleDayRange(): void {
  const plan = planIngest({ from: "2025-09-01", to: "2025-09-01", completed: [] });
  assert.deepEqual(plan.pending, ["2025-09-01"]);
}

function testInvalidInputFailsClosed(): void {
  assert.throws(() => planIngest({ from: "2025-09-05", to: "2025-09-01", completed: [] }),
    /from must be on or before to/);
  assert.throws(() => planIngest({ from: "2025-02-30", to: "2025-03-01", completed: [] }),
    /not a real date/);
  assert.throws(() => planIngest({ from: "20250901", to: "2025-09-02", completed: [] }),
    /must be YYYY-MM-DD/);
  assert.throws(() => planIngest({ from: "2025-09-01", to: "2025-09-02", completed: ["nonsense"] }),
    /completed entry/);
}

function testNotEntitledIsNeverCompleted(): void {
  // 実際に踏んだバグ。2026-09-01 を「枠外」として台帳に記録してしまい、
  // 84日遅延が明けても二度と取りに行かない状態になっていた。
  assert.equal(isCompletedIngest({ outcome: "entitled_rows" }), true);
  assert.equal(isCompletedIngest({ outcome: "entitled_empty" }), true,
    "休場日も完了。でないと毎回聞き直す");
  assert.equal(isCompletedIngest({ outcome: "not_entitled" }), false,
    "枠外は完了ではない。あとで取れる");
}

function testWithheldDaysAreNeverCompleted(): void {
  // 2回目に踏んだバグ。`observedAt` は「対象日+84日の 23:59:59 JST」なので、
  // 契約上の上限日は**いつ実行しても抑止される**。それを完了にすると、
  // 追いつきを毎日回すたびに1日ずつ永久の穴ができる。
  //
  // 実際に 2026-06-19 で作ってしまった。台帳は rowCount 0 で完了、
  // いま API を叩くと4,443件返る。
  assert.equal(
    isCompletedIngest({ outcome: "entitled_rows", withheldForAsOf: 4443 }),
    false,
    "抑止された日を完了にしてはいけない",
  );
  assert.equal(
    isCompletedIngest({ outcome: "entitled_empty", withheldForAsOf: 1 }),
    false,
  );
  // 抑止が0なら従来どおり完了。
  assert.equal(isCompletedIngest({ outcome: "entitled_rows", withheldForAsOf: 0 }), true);
}

function testWithheldEntryIsNotCountedAsCompleted(): void {
  const completed = completedDatesFrom({
    fileNames: [],
    ledgerContent: [
      JSON.stringify({ tradingDate: "2026-06-19", outcome: "entitled_rows", rowCount: 0,
        retrievedAt: "2026-09-11T00:00:00.000Z", withheldForAsOf: 4443 }),
      JSON.stringify({ tradingDate: "2026-06-18", outcome: "entitled_rows", rowCount: 4445,
        retrievedAt: "2026-09-11T00:00:00.000Z" }),
    ].join("\n"),
  });
  assert.deepEqual([...completed], ["2026-06-18"], "抑止された日は再取得の対象に残す");
}

function testCompletedFromFilesAndLedger(): void {
  const completed = completedDatesFrom({
    fileNames: ["2025-09-01.jsonl", "2025-09-02.jsonl", "_ingest-log.jsonl", "2025-09-03.jsonl.partial"],
    ledgerContent: [
      JSON.stringify({ tradingDate: "2025-09-01", outcome: "entitled_rows", rowCount: 4410, retrievedAt: "2026-01-01T00:00:00.000Z" }),
      // 休場日はファイルが無い。台帳が唯一の記録なので、ここが効かないと毎回聞き直す。
      JSON.stringify({ tradingDate: "2025-09-15", outcome: "entitled_empty", rowCount: 0, retrievedAt: "2026-01-01T00:00:00.000Z" }),
      // 枠外は完了に入れない。
      JSON.stringify({ tradingDate: "2026-09-01", outcome: "not_entitled", rowCount: 0, retrievedAt: "2026-01-01T00:00:00.000Z" }),
    ].join("\n"),
  });
  assert.deepEqual([...completed].sort(), ["2025-09-01", "2025-09-02", "2025-09-15"]);
  assert.ok(!completed.has("2026-09-01"), "枠外の日は再取得の対象に残す");
  assert.ok(!completed.has("2025-09-03"), "書きかけ(.partial)は完了ではない");
}

function testLedgerSurvivesRenameCrashWindow(): void {
  // rename 済み・台帳追記前に落ちた日。ファイルはあるが台帳には無い。
  // ファイル側を見ていないと二重取得して contentHash 衝突で落ちる。
  const completed = completedDatesFrom({ fileNames: ["2025-09-01.jsonl"], ledgerContent: "" });
  assert.deepEqual([...completed], ["2025-09-01"]);
}

function testCorruptLedgerFailsClosed(): void {
  // 台帳が壊れたまま進むと、取り込み済みの範囲が分からなくなる。
  assert.throws(() => parseIngestLedger("{not json\n"), /is not JSON/);
  assert.throws(
    () => parseIngestLedger(JSON.stringify({ tradingDate: "2025-13-01", outcome: "entitled_rows", rowCount: 0, retrievedAt: "x" })),
    /tradingDate/,
  );
  assert.deepEqual(parseIngestLedger(""), [], "空の台帳は空。エラーではない");
  assert.deepEqual(parseIngestLedger("\n\n"), [], "空行は飛ばす");
}

function testEstimateShowsThrottleCost(): void {
  // 楽観だけ出すと必ず外れる。実測ではおよそ5回に1回、90秒級で止まる。
  const estimate = estimateIngestSeconds({
    pendingDays: 100,
    optimisticIntervalSec: 3,
    throttleEveryNRequests: 5,
    throttleCostSec: 90,
  });
  assert.equal(estimate.optimisticSec, 300);
  assert.equal(estimate.expectedSec, 300 + 20 * 90);
  assert.ok(estimate.expectedSec > estimate.optimisticSec, "見積りの幅を潰さない");
}

function testEstimateHandlesZeroAndInvalid(): void {
  assert.deepEqual(
    estimateIngestSeconds({ pendingDays: 0, optimisticIntervalSec: 3, throttleEveryNRequests: 5, throttleCostSec: 90 }),
    { optimisticSec: 0, expectedSec: 0 },
  );
  assert.throws(() => estimateIngestSeconds({ pendingDays: -1, optimisticIntervalSec: 3, throttleEveryNRequests: 5, throttleCostSec: 90 }), /pendingDays/);
  assert.throws(() => estimateIngestSeconds({ pendingDays: 1, optimisticIntervalSec: 0, throttleEveryNRequests: 5, throttleCostSec: 90 }), /interval/);
  assert.throws(() => estimateIngestSeconds({ pendingDays: 1, optimisticIntervalSec: 3, throttleEveryNRequests: 0, throttleCostSec: 90 }), /throttleEveryNRequests/);
}

function testFormatDuration(): void {
  assert.equal(formatDuration(45), "45秒");
  assert.equal(formatDuration(90), "1分30秒");
  assert.equal(formatDuration(3660), "1時間1分");
  assert.equal(formatDuration(0), "0秒");
  assert.throws(() => formatDuration(-1), /invalid duration/);
}

testPlanCoversInclusiveRange();
testWeekendsAreNotRequested();
testWeekendSkipCanBeDisabled();
testResumeSkipsCompletedDates();
testCompletedWeekendCountsAsCompletedNotWeekend();
testResumeIsIdempotent();
testMonthAndYearBoundaries();
testSingleDayRange();
testInvalidInputFailsClosed();
testNotEntitledIsNeverCompleted();
testWithheldDaysAreNeverCompleted();
testWithheldEntryIsNotCountedAsCompleted();
testCompletedFromFilesAndLedger();
testLedgerSurvivesRenameCrashWindow();
testCorruptLedgerFailsClosed();
testEstimateShowsThrottleCost();
testEstimateHandlesZeroAndInvalid();
testFormatDuration();

console.log("jquants-daily-ingest-plan: 全テスト成功");
