// 追いつき範囲のテスト。
//
// なぜ要るか:
//   価格も EDINET も一度きりの遡り取り込みとして作ったので、daily に
//   配線しないと取り込みはその日で止まる。J-Quants Free は84日遅延で
//   毎日1営業日ぶんずつ契約範囲へ入ってくるため、放置すると
//   TDnet の保存開始（2026-08-03）に価格が追いつかず、
//   不祥事 Edge はいつまでも測れない。
//
// 守りたい性質:
//   1. 続きは「最終日の翌日」から（取り込み済みの日を取り直さない）
//   2. **一度も取り込んでいなければ範囲を返さない**（穴の空いた保存庫を作らない）
//   3. 既に最新なら範囲を返さない
//   4. 日付は JST で数える

import assert from "node:assert/strict";
import { resolveCatchUpRange } from "../src/catch-up-range.js";

function testResumesFromTheDayAfterTheLast(): void {
  const result = resolveCatchUpRange({
    archivedDates: ["2026-09-08", "2026-09-09", "2026-09-10"],
    today: "2026-09-14",
  });
  assert.ok(result.ok);
  assert.equal(result.range.from, "2026-09-11", "最終日の翌日から");
  assert.equal(result.range.to, "2026-09-14");
  assert.equal(result.range.calendarDays, 4);
}

function testOrderOfArchivedDatesDoesNotMatter(): void {
  const result = resolveCatchUpRange({
    archivedDates: ["2026-09-10", "2026-09-08", "2026-09-09"],
    today: "2026-09-11",
  });
  assert.ok(result.ok);
  assert.equal(result.range.from, "2026-09-11");
  assert.equal(result.range.calendarDays, 1);
}

function testNeverIngestedReturnsNoRange(): void {
  // 起点が分からないまま適当な日から始めると、穴の空いた保存庫ができる。
  // 最初の遡り取り込みは人が --from を明示して走らせる。
  assert.deepEqual(
    resolveCatchUpRange({ archivedDates: [], today: "2026-09-11" }),
    { ok: false, reason: "never_ingested" },
  );
}

function testAlreadyCurrentReturnsNoRange(): void {
  assert.deepEqual(
    resolveCatchUpRange({ archivedDates: ["2026-09-11"], today: "2026-09-11" }),
    { ok: false, reason: "already_current" },
  );
}

function testFutureArchivedDateIsTreatedAsCurrent(): void {
  // 未来日が混ざっていても取りに行かない。
  assert.deepEqual(
    resolveCatchUpRange({ archivedDates: ["2026-12-31"], today: "2026-09-11" }),
    { ok: false, reason: "already_current" },
  );
}

function testMonthAndYearBoundaries(): void {
  const acrossMonth = resolveCatchUpRange({ archivedDates: ["2026-01-31"], today: "2026-02-02" });
  assert.ok(acrossMonth.ok);
  assert.equal(acrossMonth.range.from, "2026-02-01");

  const acrossYear = resolveCatchUpRange({ archivedDates: ["2025-12-31"], today: "2026-01-02" });
  assert.ok(acrossYear.ok);
  assert.equal(acrossYear.range.from, "2026-01-01");

  // 閏年
  const leap = resolveCatchUpRange({ archivedDates: ["2024-02-28"], today: "2024-03-01" });
  assert.ok(leap.ok);
  assert.equal(leap.range.from, "2024-02-29");
}

function testInvalidInputFailsClosed(): void {
  assert.throws(() => resolveCatchUpRange({ archivedDates: [], today: "20260911" }), /must be YYYY-MM-DD/);
  assert.throws(() => resolveCatchUpRange({ archivedDates: [], today: "2026-02-30" }), /not a real date/);
  assert.throws(
    () => resolveCatchUpRange({ archivedDates: ["nonsense"], today: "2026-09-11" }),
    /archived date/,
  );
}

testResumesFromTheDayAfterTheLast();
testOrderOfArchivedDatesDoesNotMatter();
testNeverIngestedReturnsNoRange();
testAlreadyCurrentReturnsNoRange();
testFutureArchivedDateIsTreatedAsCurrent();
testMonthAndYearBoundaries();
testInvalidInputFailsClosed();

console.log("catch-up-range: 全テスト成功");
