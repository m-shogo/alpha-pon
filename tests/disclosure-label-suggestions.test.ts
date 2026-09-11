// 価格イベントと TDnet 開示の突き合わせ、およびラベル**提案**のテスト。
//
// ここは提案までで確定はしない。event-labels.ts が「記憶や推測でラベルを
// 付けさせない」ために一次情報の URL を必須にしている以上、見出しの単語一致で
// 確定させたらその原則が骨抜きになる。
//
// 守りたい性質:
//   1. 引け後の開示は翌営業日の価格に結び付ける（当日にしない）
//   2. まだ公になっていない開示を原因にしない
//   3. 複数の分類に当たったら提案しない（単語では決まらない）
//   4. 公表時刻の無い行（取り下げ）を推測で当日扱いにしない

import assert from "node:assert/strict";
import {
  DISCLOSURE_LABEL_RULES,
  matchDisclosuresToEvent,
  matchRuleForReasonCode,
  matchRuleForTitle,
  suggestLabel,
} from "../src/research/signals/disclosure-label-suggestions.js";
import { tdnetEvidence } from "../src/research/signals/label-evidence.js";
import type { ArchivedDisclosure } from "../src/disclosure-archive.js";

/** 証拠1件。コードは5桁でそろえるので sourceCode が効く。 */
function evidenceOf(patch: Partial<ArchivedDisclosure> = {}) {
  const one = tdnetEvidence(disclosure(patch));
  assert.ok(one, "証拠に変換できなかった");
  return one;
}

function disclosure(patch: Partial<ArchivedDisclosure> = {}): ArchivedDisclosure {
  return {
    schemaVersion: 1,
    observationDate: "2026-08-04",
    status: "published",
    code: "7203",
    sourceCode: "72030",
    companyName: "テスト自動車",
    title: "特別調査委員会の設置に関するお知らせ",
    publishedAt: "2026-08-04T14:00:00+09:00",
    url: "https://www.release.tdnet.info/inbs/a.pdf",
    retrievedAt: "2026-09-11T00:00:00.000Z",
    contentHash: "hash-a",
    ...patch,
  };
}

function testBeforeCloseDisclosureMatchesSameDay(): void {
  const matches = matchDisclosuresToEvent({
    code: "72030",
    date: "2026-08-04",
    evidence: [evidenceOf()],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.timing, "before_close");
}

function testAfterCloseDisclosureMatchesNextDay(): void {
  // 15:30 より後に出た開示は翌営業日の価格に出る。
  const after = disclosure({ publishedAt: "2026-08-04T16:00:00+09:00" });

  const sameDay = matchDisclosuresToEvent({ code: "72030", date: "2026-08-04", evidence: [evidenceOf({ publishedAt: "2026-08-04T16:00:00+09:00" })] });
  assert.deepEqual(sameDay, [], "引け後の開示を当日の原因にしてはいけない");

  const nextDay = matchDisclosuresToEvent({ code: "72030", date: "2026-08-05", evidence: [evidenceOf({ publishedAt: "2026-08-04T16:00:00+09:00" })] });
  assert.equal(nextDay.length, 1, "翌営業日に結び付く");
  assert.equal(nextDay[0]!.timing, "after_previous_close");
}

function testFutureDisclosureIsNotAttached(): void {
  // 反応日の引けより後に出た開示は、その日にはまだ公になっていない。
  const later = disclosure({ observationDate: "2026-08-06", publishedAt: "2026-08-06T10:00:00+09:00" });
  assert.deepEqual(
    matchDisclosuresToEvent({ code: "72030", date: "2026-08-04", evidence: [evidenceOf({ observationDate: "2026-08-06", publishedAt: "2026-08-06T10:00:00+09:00" })] }),
    [],
  );
}

function testTooOldDisclosureIsNotAttached(): void {
  // 前営業日の引けより前のものは、その前日の価格に出ているはず。
  const old = disclosure({ observationDate: "2026-08-03", publishedAt: "2026-08-03T10:00:00+09:00" });
  assert.deepEqual(
    matchDisclosuresToEvent({ code: "72030", date: "2026-08-04", evidence: [evidenceOf({ observationDate: "2026-08-03", publishedAt: "2026-08-03T10:00:00+09:00" })] }),
    [],
  );
}

function testOtherCompanyIsNotAttached(): void {
  assert.deepEqual(
    matchDisclosuresToEvent({ code: "72030",
      date: "2026-08-04",
      evidence: [evidenceOf({ code: "9984", sourceCode: "99840" })],
    }),
    [],
  );
}

function testWithdrawnRowWithoutTimeIsNotGuessed(): void {
  // 取り下げ行には公表時刻が無い。時刻で結び付けられないものを推測しない。
  const withdrawn = disclosure({ status: "withdrawn", publishedAt: undefined, url: undefined });
  assert.deepEqual(
    matchDisclosuresToEvent({ code: "72030", date: "2026-08-04", evidence: [evidenceOf({ status: "withdrawn", publishedAt: undefined, url: undefined })] }),
    [],
  );
}

function testSuggestsMisconductForInvestigationCommittee(): void {
  const suggestion = suggestLabel({
    candidateId: "am-7203-2026-08-04",
    code: "72030",
    date: "2026-08-04",
    evidence: [evidenceOf()],
  });
  assert.equal(suggestion.suggestedLabel, "misconduct");
  assert.deepEqual(suggestion.evidenceUrls, ["https://www.release.tdnet.info/inbs/a.pdf"]);
  assert.ok(suggestion.rationale.includes("調査委員会"));
  assert.equal(suggestion.conflicting, false);
}

function testConflictingRulesProduceNoSuggestion(): void {
  // 「不祥事」と「業績」が同じ日に出ることはある。単語では決められない。
  const suggestion = suggestLabel({
    candidateId: "am-7203-2026-08-04",
    code: "72030",
    date: "2026-08-04",
    evidence: [
      evidenceOf(),
      evidenceOf({
        title: "2026年3月期 業績予想の修正に関するお知らせ",
        url: "https://www.release.tdnet.info/inbs/b.pdf",
        contentHash: "hash-b",
        publishedAt: "2026-08-04T15:00:00+09:00",
      }),
    ],
  });
  assert.equal(suggestion.suggestedLabel, null, "複数に当たったら提案しない");
  assert.equal(suggestion.conflicting, true);
  assert.ok(suggestion.rationale.includes("本文を読むまで確定しない"));
  assert.equal(suggestion.evidenceUrls.length, 2, "見た開示はすべて証拠に残す");
}

function testNoDisclosureIsReportedNotGuessed(): void {
  const suggestion = suggestLabel({
    candidateId: "am-7203-2026-08-04",
    code: "72030",
    date: "2026-08-04",
    evidence: [],
  });
  assert.equal(suggestion.suggestedLabel, null);
  assert.deepEqual(suggestion.evidenceUrls, []);
  assert.ok(suggestion.rationale.includes("見つからなかった"));
}

function testUnmatchedDisclosureStillCarriesEvidence(): void {
  // ルールに当たらなくても「何を見て分からなかったか」は残す。
  const suggestion = suggestLabel({
    candidateId: "am-7203-2026-08-04",
    code: "72030",
    date: "2026-08-04",
    evidence: [evidenceOf({ title: "本社移転に関するお知らせ" })],
  });
  assert.equal(suggestion.suggestedLabel, null);
  assert.equal(suggestion.evidenceUrls.length, 1);
  assert.ok(suggestion.rationale.includes("ルールに当たらなかった"));
}

function testMatchesAreChronological(): void {
  const suggestion = suggestLabel({
    candidateId: "am-7203-2026-08-04",
    code: "72030",
    date: "2026-08-04",
    evidence: [
      evidenceOf({ publishedAt: "2026-08-04T14:00:00+09:00", url: "https://example.invalid/late.pdf", contentHash: "l" }),
      evidenceOf({ publishedAt: "2026-08-04T09:00:00+09:00", url: "https://example.invalid/early.pdf", contentHash: "e" }),
    ],
  });
  assert.deepEqual(suggestion.evidenceUrls, [
    "https://example.invalid/early.pdf",
    "https://example.invalid/late.pdf",
  ]);
}

function testSubsidiaryRuleRequiresAProblemWord(): void {
  // 実測で踏んだ問題。「子会社」だけを見ると29営業日で359件当たったが、
  // 中身は「子会社取締役へのストック・オプション」「国内子会社設立」といった
  // 通常の企業活動が大半で、探している「子会社に限定された問題」ではなかった。
  // 共起条件を入れて 24件まで絞れた。
  const routine = [
    "当社執行役、取締役及び従業員並びに当社子会社取締役及び当社子会社従業員に対する株式報酬型ストック・オプションに関するお知らせ",
    "国内子会社設立に関するお知らせ",
    "子会社の商号変更に関するお知らせ",
  ];
  for (const title of routine) {
    assert.equal(
      matchRuleForTitle(title)?.label,
      undefined,
      `通常の企業活動を子会社の問題と読んでいる: ${title}`,
    );
  }

  const problems = [
    "連結子会社における人員削減実施および特別損失の計上見込みに関するお知らせ",
    "海外子会社における不正の疑いに関する調査開始のお知らせ",
    "子会社における火災事故の発生について",
  ];
  for (const title of problems) {
    assert.equal(
      matchRuleForTitle(title)?.label,
      "subsidiary_localized",
      `子会社の問題を拾えていない: ${title}`,
    );
  }
}

function testPreviewAndSuggestionShareTheSameJudgement(): void {
  // 下見と提案で判定が分かれると、下見の件数が当てにならなくなる。
  const title = "連結子会社における特別損失の計上に関するお知らせ";
  const suggestion = suggestLabel({
    candidateId: "am-7203-2026-08-04",
    code: "72030",
    date: "2026-08-04",
    evidence: [evidenceOf({ title })],
  });
  assert.equal(suggestion.suggestedLabel, matchRuleForTitle(title)?.label);
}

function testEdinetIsMatchedByReasonCodeNotTitle(): void {
  // EDINET の `docDescription` は「臨時報告書」だけで記述が無い。実測で
  // 上場会社の臨時報告書1,798件すべてがこの文字列だった。
  // 見出しのキーワード規則は原理的に当たらないので、事由コードで判定する。
  assert.equal(matchRuleForTitle("臨時報告書"), null, "見出しだけでは決まらない");

  // 実測で観測した対応（docs/reference/edinet-reason-codes-2026-09-11.md）
  assert.equal(matchRuleForReasonCode("第19条第2項第6号")?.label, "regulatory_or_litigation");
  assert.equal(matchRuleForReasonCode("第19条第2項第3号")?.label, "corporate_action");
  assert.equal(matchRuleForReasonCode("第19条第2項第8号の2")?.label, "corporate_action");
  assert.equal(matchRuleForReasonCode("第19条第2項第2号の2")?.label, "equity_offering");
}

function testAmbiguousReasonCodesAreNotClassified(): void {
  // 12号・19号は「財政状態に著しい影響」で、実測でも
  // 「連結子会社からの配当金受領」から不祥事まで混ざる。
  // 9号（代表者異動）・9号の2（支配株主等）も分類先が定まらない。
  // **分からないものを分類しない。**
  for (const code of [
    "第19条第2項第12号", "第19条第2項第19号",
    "第19条第2項第9号", "第19条第2項第9号の2",
  ]) {
    assert.equal(matchRuleForReasonCode(code), null, `${code} を分類してはいけない`);
  }
}

function testReasonCodeMatchIsExactNotPrefix(): void {
  // 「第3号」の規則が「第3号の2」を拾ってはいけない（別の事由）。
  assert.equal(matchRuleForReasonCode("第19条第2項第3号の2"), null);
  assert.equal(matchRuleForReasonCode("第19条第2項第6号の3"), null);
}

function testMultipleReasonCodesUseTheFirstMatch(): void {
  // 複数事由のときは、規則に載っているものが1つでもあれば当たる。
  assert.equal(
    matchRuleForReasonCode("第19条第2項第12号,第19条第2項第6号")?.label,
    "regulatory_or_litigation",
  );
  // 載っていないものだけなら当たらない。
  assert.equal(matchRuleForReasonCode("第19条第2項第12号,第19条第2項第19号"), null);
}

function testEdinetEvidenceProducesSuggestion(): void {
  // 端から端まで: EDINET 由来の証拠から提案が出ること。
  const suggestion = suggestLabel({
    candidateId: "am-51100-2025-03-14",
    code: "51100",
    date: "2025-03-14",
    evidence: [{
      source: "edinet",
      code: "51100",
      observationDate: "2025-03-14",
      publishedAt: "2025-03-14T10:00:00+09:00",
      title: "臨時報告書",
      url: "https://api.edinet-fsa.go.jp/api/v2/documents/S100AAAA?type=2",
      reasonCode: "第19条第2項第6号",
      documentTypeCode: "180",
    }],
  });
  assert.equal(suggestion.suggestedLabel, "regulatory_or_litigation");
  assert.equal(suggestion.evidenceUrls.length, 1);
}

function testRulesDoNotClaimCertainty(): void {
  // 見出しだけで決められないものは、その旨を rationale に書いてあること。
  const ambiguous = DISCLOSURE_LABEL_RULES.find((rule) => rule.keywords.includes("不適切"));
  assert.ok(ambiguous);
  assert.ok(
    /切り分け|決まらない|読まない/.test(ambiguous.rationale),
    "曖昧なルールが断定的な rationale を持っている",
  );
  const subsidiary = DISCLOSURE_LABEL_RULES.find((rule) => rule.label === "subsidiary_localized");
  assert.ok(subsidiary);
  assert.ok(/決まらない|読まない/.test(subsidiary.rationale));
}

testBeforeCloseDisclosureMatchesSameDay();
testAfterCloseDisclosureMatchesNextDay();
testFutureDisclosureIsNotAttached();
testTooOldDisclosureIsNotAttached();
testOtherCompanyIsNotAttached();
testWithdrawnRowWithoutTimeIsNotGuessed();
testSuggestsMisconductForInvestigationCommittee();
testConflictingRulesProduceNoSuggestion();
testNoDisclosureIsReportedNotGuessed();
testUnmatchedDisclosureStillCarriesEvidence();
testMatchesAreChronological();
testSubsidiaryRuleRequiresAProblemWord();
testPreviewAndSuggestionShareTheSameJudgement();
testEdinetIsMatchedByReasonCodeNotTitle();
testAmbiguousReasonCodesAreNotClassified();
testReasonCodeMatchIsExactNotPrefix();
testMultipleReasonCodesUseTheFirstMatch();
testEdinetEvidenceProducesSuggestion();
testRulesDoNotClaimCertainty();

console.log("disclosure-label-suggestions: 全テスト成功");
