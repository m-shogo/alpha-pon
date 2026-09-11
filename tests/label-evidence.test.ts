// ラベル証拠の正規化テスト。
//
// 証拠は2系統ある。
//   TDnet  … 2026-08-03 以降しか無い（公開ビューアが約1ヶ月）。見出しが手がかり
//   EDINET … 価格のある期間（2024-06-19〜）を丸ごとカバー。事由コードを持つ
//
// 突合を1本にするため、ここで同じ形にそろえる。
//
// 守りたい性質:
//   1. コードは5桁にそろえる（価格ストアと同じ体系。実測 EDINET 264/268 が一致）
//   2. EDINET の `YYYY-MM-DD HH:mm` は **JST として** ISO 化する
//      （時差を付けないと引け前後の判定が実行環境で変わる）
//   3. 価格の無い提出者（投資信託）は証拠にしない
//   4. 時刻の無い行は null のまま（推測で埋めない）

import assert from "node:assert/strict";
import {
  edinetEvidence,
  tdnetEvidence,
  toFiveDigitCode,
  toIsoJst,
} from "../src/research/signals/label-evidence.js";
import type { ArchivedDisclosure } from "../src/disclosure-archive.js";
import type { ArchivedEdinetDocument } from "../src/edinet-document-archive.js";

function tdnetRow(over: Partial<ArchivedDisclosure> = {}): ArchivedDisclosure {
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
    contentHash: "h",
    ...over,
  };
}

function edinetRow(over: Partial<ArchivedEdinetDocument> = {}): ArchivedEdinetDocument {
  return {
    schemaVersion: 1,
    submissionDate: "2025-03-14",
    docId: "S100XXXX",
    edinetCode: "E01234",
    secCode: "51100",
    filerName: "住友ゴム工業株式会社",
    docTypeCode: "180",
    docDescription: "臨時報告書",
    currentReportReason: "第19条第2項第4号",
    submitDateTime: "2025-03-14 15:45",
    ordinanceCode: "010",
    formCode: "0A0000",
    parentDocId: null,
    withdrawalStatus: "0",
    contentHash: "h",
    ...over,
  };
}

function testFiveDigitNormalization(): void {
  assert.equal(toFiveDigitCode("72030"), "72030");
  assert.equal(toFiveDigitCode("7203"), "72030", "4桁は予備コード 0 を補う");
  assert.equal(toFiveDigitCode("335A0"), "335A0", "英字を含む新コードも通す");
  assert.equal(toFiveDigitCode(" 72030 "), "72030");
  assert.equal(toFiveDigitCode("720"), null);
  assert.equal(toFiveDigitCode("720300"), null);
  assert.equal(toFiveDigitCode(""), null);
}

function testTdnetPrefersSourceCode(): void {
  // 4桁へ落としてから突き合わせると、予備コードの違う銘柄を取り違える余地が残る。
  const one = tdnetEvidence(tdnetRow());
  assert.ok(one);
  assert.equal(one.code, "72030", "5桁の sourceCode を使う");
  assert.equal(one.source, "tdnet");
  assert.equal(one.reasonCode, null, "TDnet に事由コードは無い");
}

function testTdnetFallsBackToFourDigitCode(): void {
  const one = tdnetEvidence(tdnetRow({ sourceCode: undefined }));
  assert.ok(one);
  assert.equal(one.code, "72030");
}

function testNonZeroReserveCodeIsPreserved(): void {
  // 予備コードは常に 0 ではない。実測: TDnet 10,508件のうち **280件**が
  // 0 以外（`16724` / code `1672` など）。価格ストアにも `25935` `50765`
  // `94345` `94346` がある。
  //
  // 4桁から `0` を補って作ると `16720` になり、**別の証券を指すか
  // 何にも当たらない。** sourceCode をそのまま使うこと。
  const one = tdnetEvidence(tdnetRow({ code: "1672", sourceCode: "16724" }));
  assert.ok(one);
  assert.equal(one.code, "16724", "予備コードを 0 に潰してはいけない");
  assert.notEqual(one.code, "16720");

  // EDINET も同様に5桁をそのまま使う。
  const edinet = edinetEvidence(edinetRow({ secCode: "25935" }));
  assert.equal(edinet?.code, "25935");
}

function testTdnetWithdrawnKeepsNullTime(): void {
  const one = tdnetEvidence(tdnetRow({ status: "withdrawn", publishedAt: undefined, url: undefined }));
  assert.ok(one);
  assert.equal(one.publishedAt, null, "時刻の無い行を推測で埋めない");
  assert.equal(one.url, null);
}

function testEdinetEvidenceCarriesReasonCode(): void {
  const one = edinetEvidence(edinetRow());
  assert.ok(one);
  assert.equal(one.code, "51100", "secCode はそのまま5桁で価格ストアと一致する");
  assert.equal(one.source, "edinet");
  assert.equal(one.reasonCode, "第19条第2項第4号", "事由コードはそのまま残す");
  assert.equal(one.documentTypeCode, "180");
  assert.ok(one.url?.startsWith("https://"), "証拠 URL は https");
}

function testEdinetSubmitTimeIsInterpretedAsJst(): void {
  // 時差を付けずに渡すと、引け前後の判定が実行環境のタイムゾーンで変わる。
  assert.equal(toIsoJst("2025-03-14 15:45"), "2025-03-14T15:45:00+09:00");
  assert.equal(toIsoJst("2025-03-14 09:00:30"), "2025-03-14T09:00:30+09:00");
  assert.equal(toIsoJst("2025-03-14T15:45"), "2025-03-14T15:45:00+09:00");
  assert.equal(toIsoJst(null), null);
  assert.equal(toIsoJst("不正な時刻"), null, "読めない形式を推測で通さない");

  const one = edinetEvidence(edinetRow({ submitDateTime: "2025-03-14 16:30" }));
  assert.equal(one?.publishedAt, "2025-03-14T16:30:00+09:00");
}

function testUnlistedFilerIsNotEvidence(): void {
  // 投資信託などは価格が無いので証拠にならない。
  assert.equal(edinetEvidence(edinetRow({ secCode: null })), null);
}

function testMalformedSecCodeIsRejected(): void {
  assert.equal(edinetEvidence(edinetRow({ secCode: "511" })), null);
}

function testEdinetMissingTimeKeepsNull(): void {
  const one = edinetEvidence(edinetRow({ submitDateTime: null }));
  assert.ok(one);
  assert.equal(one.publishedAt, null);
}

testFiveDigitNormalization();
testTdnetPrefersSourceCode();
testTdnetFallsBackToFourDigitCode();
testNonZeroReserveCodeIsPreserved();
testTdnetWithdrawnKeepsNullTime();
testEdinetEvidenceCarriesReasonCode();
testEdinetSubmitTimeIsInterpretedAsJst();
testUnlistedFilerIsNotEvidence();
testMalformedSecCodeIsRejected();
testEdinetMissingTimeKeepsNull();

console.log("label-evidence: 全テスト成功");
