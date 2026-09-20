// EDINET 臨時報告書から価格イベントを作るテスト。
//
// F1（価格から逆引き）と違い、**値動きの大きさを条件にしない。**
// 事由が起きた事実だけで母集団を作る。
//
// 守りたい性質:
//   1. 引け後の提出は翌営業日に出る（当日に数えない）
//   2. 提出日が休場なら次の営業日へ送る（自前のカレンダーを持たない）
//   3. 同じ (銘柄, 反応日) は1件にまとめる（同じ値動きを二重に測らない）
//   4. まとめるときも事由は捨てない（何で動いたかが消える）
//   5. 事由コードは完全一致（「第3号」が「第3号の2」を拾わない）
//   6. 書類種別の説明でも母集団を作れる（訂正報告書など。2026-09-21 に追加）
//   7. 事由と書類種別は**どちらか一方**だけ（両方だと母集団の定義が2つになる）
//   8. 同じ銘柄の続けての提出は、指定した暦日までまとめる（訂正は数日つづく）

import assert from "node:assert/strict";
import {
  buildEdinetReasonEvents,
  resolveReactionDate,
  splitReasonCodes,
} from "../src/research/signals/edinet-reason-events.js";
import type { LabelEvidence } from "../src/research/signals/label-evidence.js";

// 2025-03-13(木) 14(金) 17(月) 18(火) — 15,16 は週末で営業日に無い。
const TRADING_DATES = ["2025-03-13", "2025-03-14", "2025-03-17", "2025-03-18"];
const SUBSIDIARY = "第19条第2項第3号";

function evidence(over: Partial<LabelEvidence> = {}): LabelEvidence {
  return {
    source: "edinet",
    code: "51100",
    observationDate: "2025-03-14",
    publishedAt: "2025-03-14T10:00:00+09:00",
    title: "臨時報告書",
    url: "https://api.edinet-fsa.go.jp/api/v2/documents/S100AAAA?type=2",
    reasonCode: SUBSIDIARY,
    documentTypeCode: "180",
    ...over,
  };
}

function build(list: LabelEvidence[], codes: string[] = [SUBSIDIARY]) {
  return buildEdinetReasonEvents({ evidence: list, reasonCodes: codes, tradingDates: TRADING_DATES });
}

function testDocumentDescriptionSelectsThePopulation(): void {
  // 訂正有価証券報告書は臨時報告書（180）ではない。事由も無い。
  const correction = evidence({
    title: "訂正有価証券報告書－第25期(2024/04/01－2025/03/31)",
    documentTypeCode: "130",
    reasonCode: null,
  });
  const built = buildEdinetReasonEvents({
    evidence: [correction, evidence()],
    documentDescriptionPrefixes: ["訂正有価証券報告書"],
    tradingDates: TRADING_DATES,
  });
  assert.equal(built.events.length, 1, "書類種別で選べる");
  assert.deepEqual(built.events[0]!.documentDescriptions, ["訂正有価証券報告書"]);
  assert.deepEqual(built.events[0]!.reasonCodes, [], "事由で選んでいないので空");
  assert.equal(built.rejectedCounts.document_not_requested, 1, "臨時報告書は対象外として数える");
  assert.equal(built.rejectedCounts.not_extraordinary_report, 0, "書類種別モードでは使わない理由");
}

function testDocumentDescriptionIsPrefixMatch(): void {
  const built = buildEdinetReasonEvents({
    evidence: [evidence({ title: "訂正内部統制報告書", documentTypeCode: "126", reasonCode: null })],
    documentDescriptionPrefixes: ["訂正有価証券報告書"],
    tradingDates: TRADING_DATES,
  });
  assert.equal(built.events.length, 0, "「訂正内部統制報告書」を「訂正有価証券報告書」で拾わない");
}

function testSelectorsAreExclusive(): void {
  assert.throws(
    () => buildEdinetReasonEvents({
      evidence: [evidence()],
      reasonCodes: [SUBSIDIARY],
      documentDescriptionPrefixes: ["訂正有価証券報告書"],
      tradingDates: TRADING_DATES,
    }),
    /どちらか一方/,
    "両方を指定したら母集団の定義が2つになる",
  );
  assert.throws(
    () => buildEdinetReasonEvents({ evidence: [evidence()], tradingDates: TRADING_DATES }),
    /どちらか一方/,
    "どちらも無ければ母集団は作れない",
  );
}

function testDedupeWindowFoldsRepeatedFilings(): void {
  const list = [
    evidence({ title: "訂正有価証券報告書", documentTypeCode: "130", reasonCode: null, publishedAt: "2025-03-13T10:00:00+09:00" }),
    evidence({ title: "訂正有価証券報告書", documentTypeCode: "130", reasonCode: null, publishedAt: "2025-03-14T10:00:00+09:00" }),
    evidence({ title: "訂正有価証券報告書", documentTypeCode: "130", reasonCode: null, publishedAt: "2025-03-18T10:00:00+09:00" }),
  ];
  const options = {
    evidence: list,
    documentDescriptionPrefixes: ["訂正有価証券報告書"],
    tradingDates: TRADING_DATES,
  };
  assert.equal(
    buildEdinetReasonEvents(options).events.length,
    3,
    "既定ではまとめない（反応日が違えば別イベント）",
  );
  const folded = buildEdinetReasonEvents({ ...options, dedupeCalendarDays: 3 });
  assert.equal(folded.events.length, 2, "3日以内の2件目はまとめる（13日と18日が残る）");
  assert.deepEqual(folded.events.map((one) => one.reactionDate), ["2025-03-13", "2025-03-18"]);
  assert.equal(folded.rejectedCounts.duplicate_within_window, 1);
  const wide = buildEdinetReasonEvents({ ...options, dedupeCalendarDays: 60 });
  assert.equal(wide.events.length, 1, "60日ならまとめて1件");
  assert.throws(
    () => buildEdinetReasonEvents({ ...options, dedupeCalendarDays: -1 }),
    /0 以上の整数/,
  );
}

function testSplitReasonCodes(): void {
  assert.deepEqual(splitReasonCodes("第19条第2項第3号,第19条第2項第12号"),
    ["第19条第2項第3号", "第19条第2項第12号"]);
  assert.deepEqual(splitReasonCodes(" 第19条第2項第3号 "), ["第19条第2項第3号"]);
  assert.deepEqual(splitReasonCodes(null), []);
  assert.deepEqual(splitReasonCodes(""), []);
}

function testBeforeCloseReactsSameDay(): void {
  const result = build([evidence({ publishedAt: "2025-03-14T10:00:00+09:00" })]);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]!.reactionDate, "2025-03-14");
  assert.equal(result.events[0]!.publishedBeforeClose, true);
}

function testAfterCloseReactsNextTradingDay(): void {
  // 15:30 より後。翌営業日は 03-17（15/16 は週末）。
  const result = build([evidence({ publishedAt: "2025-03-14T16:00:00+09:00" })]);
  assert.equal(result.events[0]!.reactionDate, "2025-03-17", "週末を飛ばして次の営業日");
  assert.equal(result.events[0]!.publishedBeforeClose, false);
}

function testNonTradingDaySubmissionMovesForward(): void {
  // 土曜提出。次の営業日は 03-17。自前の祝日表を持たず価格ストアの営業日で決める。
  const result = build([evidence({ publishedAt: "2025-03-15T10:00:00+09:00" })]);
  assert.equal(result.events[0]!.reactionDate, "2025-03-17");
  assert.equal(result.events[0]!.publishedBeforeClose, false, "営業日でない日に引け前は無い");
}

function testAfterLastTradingDayIsRejected(): void {
  // 価格が無い先の提出はイベントにできない。
  const result = build([evidence({ publishedAt: "2025-03-19T10:00:00+09:00" })]);
  assert.deepEqual(result.events, []);
  assert.equal(result.rejectedCounts.no_trading_day_on_or_after, 1);
}

function testSameCodeAndDateIsFolded(): void {
  // 同じ日に2本出しても、価格の動きは1回。二重に測らない。
  const result = build([
    evidence({ publishedAt: "2025-03-14T10:00:00+09:00" }),
    evidence({ publishedAt: "2025-03-14T11:00:00+09:00", reasonCode: "第19条第2項第3号,第19条第2項第12号" }),
  ], [SUBSIDIARY, "第19条第2項第12号"]);
  assert.equal(result.events.length, 1);
  assert.equal(result.rejectedCounts.duplicate_code_and_date, 1);
  assert.deepEqual(result.events[0]!.reasonCodes, ["第19条第2項第12号", "第19条第2項第3号"],
    "まとめるときも事由を捨てない");
}

function testDifferentCodesAreSeparateEvents(): void {
  const result = build([
    evidence({ code: "51100" }),
    evidence({ code: "72030" }),
  ]);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events.map((one) => one.code), ["51100", "72030"], "eventId 昇順");
}

function testReasonCodeMatchIsExact(): void {
  // 「第3号」の指定で「第3号の2」を拾ってはいけない。
  const result = build([evidence({ reasonCode: "第19条第2項第3号の2" })]);
  assert.deepEqual(result.events, []);
  assert.equal(result.rejectedCounts.reason_not_requested, 1);
}

function testNonExtraordinaryReportIsRejected(): void {
  const result = build([evidence({ documentTypeCode: "130", title: "訂正有価証券報告書" })]);
  assert.deepEqual(result.events, []);
  assert.equal(result.rejectedCounts.not_extraordinary_report, 1);
}

function testMissingPublishTimeIsRejected(): void {
  // 時刻が無いと引け前後を決められない。推測しない。
  const result = build([evidence({ publishedAt: null })]);
  assert.deepEqual(result.events, []);
  assert.equal(result.rejectedCounts.no_publish_time, 1);
}

function testTdnetEvidenceIsIgnored(): void {
  // この母集団は EDINET の事由コードで作る。TDnet は数に入れない。
  const result = build([{ ...evidence(), source: "tdnet" }]);
  assert.deepEqual(result.events, []);
  assert.equal(result.evaluatedCount, 0);
}

function testEmptyReasonCodesFailsClosed(): void {
  // 対象を指定しないまま母集団を作らせない（2026-09-21 に書類種別モードを足して
  // メッセージが「どちらか一方」に変わった。止まる性質は同じ）。
  assert.throws(
    () => buildEdinetReasonEvents({ evidence: [], reasonCodes: [], tradingDates: TRADING_DATES }),
    /どちらか一方/,
  );
}

function testResolveReactionDateDirectly(): void {
  assert.deepEqual(
    resolveReactionDate({ publishedAt: "2025-03-13T09:00:00+09:00", tradingDates: TRADING_DATES }),
    { reactionDate: "2025-03-13", publishedBeforeClose: true },
  );
  assert.equal(
    resolveReactionDate({ publishedAt: "2025-03-20T09:00:00+09:00", tradingDates: TRADING_DATES }),
    null,
  );
}

testSplitReasonCodes();
testBeforeCloseReactsSameDay();
testAfterCloseReactsNextTradingDay();
testNonTradingDaySubmissionMovesForward();
testAfterLastTradingDayIsRejected();
testSameCodeAndDateIsFolded();
testDifferentCodesAreSeparateEvents();
testReasonCodeMatchIsExact();
testNonExtraordinaryReportIsRejected();
testMissingPublishTimeIsRejected();
testTdnetEvidenceIsIgnored();
testEmptyReasonCodesFailsClosed();
testResolveReactionDateDirectly();
testDocumentDescriptionSelectsThePopulation();
testDocumentDescriptionIsPrefixMatch();
testSelectorsAreExclusive();
testDedupeWindowFoldsRepeatedFilings();

console.log("edinet-reason-events: 全テスト成功");
