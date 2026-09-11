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
  formatDisclosureArchiveBanner,
  EDINET_RETENTION_DAYS,
  JQUANTS_ROLLING_WINDOW_DAYS,
} from "../src/disclosure-archive-audit.js";

function audit(archivedDates: string[], today: string, retentionDays = TDNET_RETENTION_DAYS) {
  return auditDisclosureArchive({ today, archivedDates, retentionDays });
}

function testMiddleHolesNeedManualBackfill(): void {
  // 追いつき（--catch-up）は**保存済みの最終日の翌日から**しか取らない。
  // 途中の穴は永久に飛ばされるので、人が埋めるしかない。
  //
  // 末尾の穴は翌朝の追いつきで入るので、行動は要らない。
  // これを区別しないと、毎朝「当日が無い」で検査が落ち続ける。
  const report = audit(
    ["2026-09-07", "2026-09-09", "2026-09-10"],   // 09-08 が抜けている
    "2026-09-11",
  );
  const dates = (list: { date: string }[]) => list.map((one) => one.date);

  assert.deepEqual(dates(report.gaps), ["2026-09-08", "2026-09-11"]);
  assert.deepEqual(dates(report.needsManualBackfill), ["2026-09-08"],
    "途中の穴だけが手作業を要する");

  const middle = report.gaps.find((gap) => gap.date === "2026-09-08")!;
  const trailing = report.gaps.find((gap) => gap.date === "2026-09-11")!;
  assert.equal(middle.fillableByCatchUp, false);
  assert.equal(trailing.fillableByCatchUp, true, "最終日より後は追いつきが埋める");
}

function testExpiredTrailingGapStillNeedsAction(): void {
  // 末尾でも回収期限を過ぎていれば、追いつきでも埋まらない。
  const report = audit(["2026-08-01"], "2026-09-11", 28);
  const expired = report.needsManualBackfill.filter((gap) => !gap.recoverable);
  assert.ok(expired.length > 0, "期限切れは手遅れとして報告する");
  assert.ok(
    report.needsManualBackfill.every((gap) => !gap.fillableByCatchUp || !gap.recoverable),
    "自動で埋まる回収可能な穴を手作業扱いにしない",
  );
}

function testTrailingOnlyGapNeedsNoAction(): void {
  // 当日ぶんだけが無い状態。翌朝に入るので行動は要らない。
  const report = audit(["2026-09-09", "2026-09-10"], "2026-09-11");
  assert.deepEqual(report.gaps.map((one) => one.date), ["2026-09-11"]);
  assert.deepEqual(report.needsManualBackfill, []);
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

function testEdinetRetentionMatchesTheMeasuredWindow(): void {
  // 実測（2026-09-11）: 2016-09-12 は取得でき、2016-09-09 は 404。
  // 今日の10年前が 2016-09-11 なので 10年のローリング窓。
  // 期限を長く見積もると取り逃すので、余裕を見て短めに扱う。
  const tenYears = 3_652;
  assert.ok(
    EDINET_RETENTION_DAYS < tenYears,
    `実測の10年より短く見積もること: ${EDINET_RETENTION_DAYS}`,
  );
  assert.ok(
    EDINET_RETENTION_DAYS > tenYears * 0.9,
    `短く見積もりすぎると、埋められる穴を諦めることになる: ${EDINET_RETENTION_DAYS}`,
  );
  // TDnet と同じ緊急度で扱わないこと。桁が違う。
  assert.ok(EDINET_RETENTION_DAYS > TDNET_RETENTION_DAYS * 50);
}

function testRollingWindowIsNotUnderestimated(): void {
  // J-Quants の2年ローリング窓は「D + 730 + 84 = D + 814日」まで。
  // **短く見積もると、まだ取れる日を回収不能と判定して諦めることになる。**
  // 実際に 800 と置いて、5日ぶんを誤って回収不能と報告した（2026-09-12）。
  assert.equal(JQUANTS_ROLLING_WINDOW_DAYS, 814);

  const inside = audit(["2024-06-20"], "2026-09-12", JQUANTS_ROLLING_WINDOW_DAYS);
  const day = inside.gaps.find((gap) => gap.date === "2024-06-28");
  assert.ok(day, "2024-06-28 が欠落として挙がること");
  assert.equal(day!.recoverable, true, "窓の内側はまだ取れる");

  const outside = audit(["2024-06-20"], "2026-10-01", JQUANTS_ROLLING_WINDOW_DAYS);
  const expired = outside.gaps.find((gap) => gap.date === "2024-06-28");
  assert.equal(expired!.recoverable, false, "窓を出たら回収不能");
}

function testEdinetGapIsStillRecoverableAfterAYear(): void {
  // EDINET は10年窓なので、1年前の穴もまだ埋められる。
  // TDnet と同じ 28日で扱うと「回収不能」と誤って諦める。
  const report = audit(
    ["2025-09-10", "2026-09-10", "2026-09-11"],
    "2026-09-11",
    EDINET_RETENTION_DAYS,
  );
  const yearOld = report.gaps.find((gap) => gap.date === "2025-09-11");
  assert.ok(yearOld, "1年前の平日が欠落として挙がること");
  assert.equal(yearOld!.recoverable, true, "10年窓なら1年前はまだ回収できる");
  assert.equal(yearOld!.fillableByCatchUp, false, "途中の穴は追いつきでは埋まらない");
  assert.ok(
    report.needsManualBackfill.some((gap) => gap.date === "2025-09-11"),
    "人が埋める対象として挙がること",
  );
}

function testBannerIsSilentWhenThereIsNoGap(): void {
  // 問題が無い朝に余計な文言を出さない。毎朝出ると読まれなくなる。
  const report = audit(["2026-09-10", "2026-09-11"], "2026-09-11");
  assert.deepEqual(formatDisclosureArchiveBanner(report), []);
  assert.deepEqual(formatDisclosureArchiveBanner(audit([], "2026-09-11")), []);
}

function testBannerShowsTheDeadline(): void {
  // 「抜けている」だけでは動けない。**あと何日で取り戻せなくなるか**を出す。
  const report = audit(["2026-09-07", "2026-09-11"], "2026-09-11", 28);
  const banner = formatDisclosureArchiveBanner(report);
  assert.ok(banner.length > 0, "欠落があるのに何も出していない");
  const text = banner.join("\n");
  assert.ok(/あと \d+ 日で取り戻せなくなります/.test(text), text);
  assert.ok(text.includes("pnpm archive:tdnet"), "埋め方が書かれていない");
  assert.ok(text.includes("--execute"), "dry-run のコマンドを案内しても何も起きない");
  assert.ok(text.includes("2026-09-08"), "最初の欠落日が入っていない");
}

function testBannerCommandRangeIsNotInverted(): void {
  // 実際に出した壊れたコマンド。最終保存日を --to にしていたため、
  // 欠落が最終保存日より後だと from > to になり実行時に落ちる。
  //   pnpm archive:tdnet -- --from 2026-09-14 --to 2026-09-11 --execute
  const report = audit(["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"], "2026-09-15", 28);
  const text = formatDisclosureArchiveBanner(report).join("\n");
  const match = /--from (\d{4}-\d{2}-\d{2}) --to (\d{4}-\d{2}-\d{2})/.exec(text);
  assert.ok(match, `コマンドの範囲を読み取れない: ${text}`);
  assert.ok(match[1]! <= match[2]!, `from > to の壊れたコマンド: ${match[0]}`);
  // 欠落は 09-14 と 09-15（09-12,13 は週末）。
  assert.equal(match[1], "2026-09-14");
  assert.equal(match[2], "2026-09-15");
}

function testBannerReportsUnrecoverableSeparately(): void {
  // 回収できる欠落と、もう手遅れの欠落を同じ扱いにしない。
  const report = audit(["2026-08-01", "2026-09-11"], "2026-09-11", 28);
  const text = formatDisclosureArchiveBanner(report).join("\n");
  assert.ok(text.includes("取り戻せなくなった日"), text);
}

testBannerIsSilentWhenThereIsNoGap();
testBannerShowsTheDeadline();
testBannerCommandRangeIsNotInverted();
testBannerReportsUnrecoverableSeparately();
testMiddleHolesNeedManualBackfill();
testExpiredTrailingGapStillNeedsAction();
testTrailingOnlyGapNeedsNoAction();
testNoGapsWhenEveryWeekdayIsArchived();
testWeekendsAreNotGaps();
testMissingWeekdayIsAGap();
testRecoverableAndLostAreSeparated();
testBeforeFirstArchivedDayIsNotAGap();
testEmptyArchiveIsNotAnError();
testStaleArchiveIsVisible();
testInvalidTodayFailsClosed();
testRetentionDefaultIsConservative();
testEdinetRetentionMatchesTheMeasuredWindow();
testRollingWindowIsNotUnderestimated();
testEdinetGapIsStillRecoverableAfterAYear();

console.log("disclosure-archive-audit: 全テスト成功");
