// EDINET 書類一覧保存庫のテスト。
//
// なぜ要るか:
//   不祥事・子会社 Edge には、価格のある期間のラベルが要る。
//   TDnet は約1ヶ月しか遡れず（保存開始 2026-08-03）、
//   J-Quants Free の価格は84日遅延で上限 2026-06-19。**重ならない。**
//   EDINET の一覧 API は過去日を返す（実測 2024-06-19 / 2026-06-18 とも 200）。
//
// 守りたい性質:
//   1. **docID は一意ではない。** 同じ docID で内容の違う行が来る
//   2. 0件の日も記録する（「無かった」と「観測していない」を区別）
//   3. 同じ観測を繰り返しても増えない
//   4. 上場していない提出者（投資信託）の secCode は null。空文字で埋めない

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  appendEdinetDocuments,
  computeEdinetDocumentHash,
  listArchivedEdinetDates,
  readArchivedEdinetDocuments,
  toArchivedEdinetDocument,
} from "../src/edinet-document-archive.js";
import type { EdinetDoc } from "../src/fetcher/edinet.js";

function doc(over: Partial<EdinetDoc> = {}): EdinetDoc {
  return {
    seqNumber: 1,
    docID: "S100TNU6",
    edinetCode: "E01234",
    secCode: "79950",
    JCN: "1234567890123",
    filerName: "テスト株式会社",
    fundCode: "",
    ordinanceCode: "010",
    formCode: "0A0000",
    docTypeCode: "180",
    periodStart: "",
    periodEnd: "",
    submitDateTime: "2024-06-20 09:16",
    docDescription: "臨時報告書",
    issuerEdinetCode: "",
    subjectEdinetCode: "",
    subsidiaryEdinetCode: "",
    currentReportReason: "第19条第2項第12号",
    parentDocID: "",
    opeDateTime: "",
    withdrawalStatus: "0",
    docInfoEditStatus: "0",
    disclosureStatus: "0",
    xbrlFlag: "1",
    pdfFlag: "1",
    attachDocFlag: "0",
    englishDocFlag: "0",
    csvFlag: "1",
    legalStatus: "1",
    ...over,
  };
}

function makeRoot(): string {
  return mkdtempSync(resolve(tmpdir(), "edinet-archive-"));
}

function testSameDocIdDifferentContentIsKept(): void {
  // 実測で踏んだ欠陥。2024-06-20 の591件のうち2組が同じ docID で
  // docDescription が違っていた。(提出日, docID, 取り下げ状態) で畳んでいたため
  // **別々の事実を静かに1つに潰していた。**
  //
  //   S100TNU6  内部統制報告書－第124期(2024/06/19－2024/06/19)
  //             内部統制報告書－第124期(2023/04/01－2024/03/31)
  const root = makeRoot();
  try {
    const result = appendEdinetDocuments({
      submissionDate: "2024-06-20",
      docs: [
        doc({ docTypeCode: "235", docDescription: "内部統制報告書－第124期(2024/06/19－2024/06/19)" }),
        doc({ docTypeCode: "235", docDescription: "内部統制報告書－第124期(2023/04/01－2024/03/31)" }),
      ],
      root,
    });
    assert.equal(result.appended, 2, "同じ docID でも内容が違えば別の行");
    assert.equal(readArchivedEdinetDocuments("2024-06-20", root).length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testIdenticalRowsAreFolded(): void {
  const root = makeRoot();
  try {
    appendEdinetDocuments({ submissionDate: "2024-06-20", docs: [doc()], root });
    const second = appendEdinetDocuments({ submissionDate: "2024-06-20", docs: [doc(), doc()], root });
    assert.equal(second.appended, 0);
    assert.equal(second.alreadyPresent, 2);
    assert.equal(readArchivedEdinetDocuments("2024-06-20", root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testWithdrawalChangeIsANewFact(): void {
  // 取り下げは別の事実。畳んではいけない。
  const root = makeRoot();
  try {
    appendEdinetDocuments({ submissionDate: "2024-06-20", docs: [doc({ withdrawalStatus: "0" })], root });
    const second = appendEdinetDocuments({
      submissionDate: "2024-06-20", docs: [doc({ withdrawalStatus: "1" })], root,
    });
    assert.equal(second.appended, 1);
    assert.equal(readArchivedEdinetDocuments("2024-06-20", root).length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testEmptyDayIsRecorded(): void {
  const root = makeRoot();
  try {
    appendEdinetDocuments({ submissionDate: "2024-06-22", docs: [], root });
    assert.deepEqual(listArchivedEdinetDates(root), ["2024-06-22"], "0件でも観測した事実を残す");
    assert.deepEqual(readArchivedEdinetDocuments("2024-06-22", root), []);
    assert.deepEqual(readArchivedEdinetDocuments("2024-06-23", root), [], "観測していない日は空");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testUnlistedFilerKeepsNullSecCode(): void {
  // 投資信託などは secCode が無い。空文字で埋めると
  // 「コード不明」と「コード空」を後から区別できなくなる。
  const archived = toArchivedEdinetDocument({
    submissionDate: "2024-06-20",
    doc: doc({ secCode: "", filerName: "テストアセットマネジメント株式会社" }),
  });
  assert.equal(archived.secCode, null);
}

function testReasonCodeIsKeptVerbatim(): void {
  // 「第N号が何を指すか」の解釈はここでしない。条文の読みを勝手に決めない。
  const archived = toArchivedEdinetDocument({
    submissionDate: "2024-06-20",
    doc: doc({ currentReportReason: "第19条第2項第12号,第19条第2項第19号" }),
  });
  assert.equal(archived.currentReportReason, "第19条第2項第12号,第19条第2項第19号");
}

function testSubmitTimeIsKept(): void {
  // 引け後に出た書類は翌営業日の価格に出る。時刻が無いと結び付けられない。
  const archived = toArchivedEdinetDocument({
    submissionDate: "2024-06-20", doc: doc({ submitDateTime: "2024-06-20 16:30" }),
  });
  assert.equal(archived.submitDateTime, "2024-06-20 16:30");
}

function testMissingDocIdFailsClosed(): void {
  assert.throws(
    () => toArchivedEdinetDocument({ submissionDate: "2024-06-20", doc: doc({ docID: "" }) }),
    /has no docID/,
  );
  assert.throws(
    () => appendEdinetDocuments({ submissionDate: "2024-13-01", docs: [doc()] }),
    /is not a real date/,
  );
}

function testHashIgnoresNothingThatIsStored(): void {
  // 保存する項目はすべて判定に入れる。入れ忘れた項目の違いは潰される。
  const base = toArchivedEdinetDocument({ submissionDate: "2024-06-20", doc: doc() });
  const { contentHash: _ignored, ...fields } = base;
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    if (key === "schemaVersion" || key === "submissionDate") continue;
    const changed = { ...fields, [key]: `${String(fields[key])}-changed` };
    assert.notEqual(
      computeEdinetDocumentHash(changed),
      base.contentHash,
      `${key} の違いが hash に反映されていない`,
    );
  }
}

function testFilePermissionsArePrivate(): void {
  const root = makeRoot();
  try {
    const result = appendEdinetDocuments({ submissionDate: "2024-06-20", docs: [doc()], root });
    assert.equal(statSync(result.path).mode & 0o777, 0o600);
  } finally { rmSync(root, { recursive: true, force: true }); }

  // すでに緩いパーミッションで存在するファイルも絞り直すこと。
  // 作成時の mode だけに頼ると、一度緩くなったファイルが緩いまま残る。
  const existing = makeRoot();
  try {
    const path = resolve(existing, "2024-06-20.jsonl");
    writeFileSync(path, "", { mode: 0o644 });
    chmodSync(path, 0o644);
    appendEdinetDocuments({ submissionDate: "2024-06-20", docs: [doc()], root: existing });
    assert.equal(statSync(path).mode & 0o777, 0o600, "既存ファイルのパーミッションを絞り直していない");
  } finally { rmSync(existing, { recursive: true, force: true }); }
}

function testCorruptArchiveFailsClosed(): void {
  const root = makeRoot();
  try {
    writeFileSync(resolve(root, "2024-06-20.jsonl"), "{broken\n");
    assert.throws(() => readArchivedEdinetDocuments("2024-06-20", root), /JSON を解析できません/);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testArchiveIsAppendOnly(): void {
  const root = makeRoot();
  try {
    appendEdinetDocuments({ submissionDate: "2024-06-20", docs: [doc()], root });
    appendEdinetDocuments({
      submissionDate: "2024-06-20", docs: [doc({ docID: "S100OTHER" })], root,
    });
    const rows = readArchivedEdinetDocuments("2024-06-20", root);
    assert.equal(rows.length, 2);
    assert.ok(readFileSync(resolve(root, "2024-06-20.jsonl"), "utf-8").endsWith("\n"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

testSameDocIdDifferentContentIsKept();
testIdenticalRowsAreFolded();
testWithdrawalChangeIsANewFact();
testEmptyDayIsRecorded();
testUnlistedFilerKeepsNullSecCode();
testReasonCodeIsKeptVerbatim();
testSubmitTimeIsKept();
testMissingDocIdFailsClosed();
testHashIgnoresNothingThatIsStored();
testFilePermissionsArePrivate();
testCorruptArchiveFailsClosed();
testArchiveIsAppendOnly();

console.log("edinet-document-archive: 全テスト成功");
