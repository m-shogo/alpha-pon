// 開示保存庫の欠落検査のテスト。
//
// TDnet の公開閲覧サービスは約1ヶ月しか遡れない（実測: 2026-08-03 は取れるが
// 2026-07-31 は not found）。欠落は約30日以内なら埋められるが、
// それを過ぎると永久に埋められない。
//
// 守りたい性質:
//   1. 「まだ回収できる欠落」と「もう手遅れの欠落」を分ける
//   2. 保存を始めた日より前を穴と言わない
//   3. 週末は穴ではない（東証が立たない）
//   4. JST で数える（UTC だと日本の早朝に1日ずれる。実際にずらした）

import assert from "node:assert/strict";
import {
  TDNET_RETENTION_DAYS,
  auditDisclosureArchive,
} from "../src/disclosure-archive-audit.js";

function audit(archivedDates: string[], today: string, retentionDays = TDNET_RETENTION_DAYS) {
  return auditDisclosureArchive({ today, archivedDates, retentionDays });
}

function testNoGapsWhenEveryWeekdayIsArchived(): void {
  // 2026-09-07(月) 〜 2026-09-11(金)
  const report = audit(
    ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"],
    "2026-09-11",
  );
  assert.deepEqual(report.gaps, []);
  assert.equal(report.daysSinceLastArchive, 0);
  assert.equal(report.firstDate, "2026-09-07");
}

function testWeekendsAreNotGaps(): void {
  // 09-12(土) 09-13(日) を飛ばして 09-14(月)。
  const report = audit(["2026-09-11", "2026-09-14"], "2026-09-14");
  assert.deepEqual(report.gaps, [], "週末を欠落として報告してはいけない");
}

function testMissingWeekdayIsAGap(): void {
  const report = audit(["2026-09-07", "2026-09-09"], "2026-09-09");
  assert.deepEqual(report.gaps.map((gap) => gap.date), ["2026-09-08"]);
  assert.equal(report.gaps[0]!.recoverable, true);
}

function testRecoverableAndLostAreSeparated(): void {
  // 保持28日として、今日から見て 5日前の欠落は回収可能、
  // 40日前の欠落は手遅れ。
  const report = audit(["2026-08-01", "2026-09-11"], "2026-09-11", 28);
  const recent = report.recoverableGaps.map((gap) => gap.date);
  const lost = report.lostGaps.map((gap) => gap.date);

  assert.ok(recent.includes("2026-09-10"), "直近の欠落は回収できる");
  assert.ok(lost.includes("2026-08-03"), "保持期間を過ぎた欠落は手遅れ");
  assert.equal(recent.length + lost.length, report.gaps.length);
  // 境界: ちょうど保持日数ぶん前は手遅れ側（余裕を見て短めに扱う）。
  const boundary = report.gaps.find((gap) => gap.date === "2026-08-14");
  assert.ok(boundary);
  assert.equal(boundary.daysLeftToRecover, 28 - 28);
  assert.equal(boundary.recoverable, false);
}

function testBeforeFirstArchivedDayIsNotAGap(): void {
  // 保存を始めた日より前を穴だと言っても意味が無い。
  const report = audit(["2026-09-10", "2026-09-11"], "2026-09-11");
  assert.deepEqual(report.gaps, []);
  assert.equal(report.firstDate, "2026-09-10");
}

function testEmptyArchiveIsNotAnError(): void {
  const report = audit([], "2026-09-11");
  assert.equal(report.archivedDates, 0);
  assert.deepEqual(report.gaps, []);
  assert.equal(report.daysSinceLastArchive, null);
  assert.equal(report.firstDate, null);
}

function testStaleArchiveIsVisible(): void {
  // daily が止まっているとき、最終保存からの日数で分かること。
  const report = audit(["2026-09-01"], "2026-09-11");
  assert.equal(report.daysSinceLastArchive, 10);
  assert.ok(report.gaps.length > 0);
}

function testInvalidTodayFailsClosed(): void {
  assert.throws(() => audit(["2026-09-11"], "20260911"), /today must be YYYY-MM-DD/);
}

function testRetentionDefaultIsConservative(): void {
  // 実測は約30日。余裕を見て短めに扱う（回収期限を長く見積もると取り逃す）。
  assert.ok(TDNET_RETENTION_DAYS <= 30);
  assert.ok(TDNET_RETENTION_DAYS >= 21);
}

testNoGapsWhenEveryWeekdayIsArchived();
testWeekendsAreNotGaps();
testMissingWeekdayIsAGap();
testRecoverableAndLostAreSeparated();
testBeforeFirstArchivedDayIsNotAGap();
testEmptyArchiveIsNotAnError();
testStaleArchiveIsVisible();
testInvalidTodayFailsClosed();
testRetentionDefaultIsConservative();

console.log("disclosure-archive-audit: 全テスト成功");
