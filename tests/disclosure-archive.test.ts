// TDnet 開示保存庫のテスト。
//
// なぜ要るか:
//   daily は毎朝 TDnet を取得しているのに、キーワード抽出に使って**捨てていた**。
//   公開閲覧サービスは約1ヶ月しか遡れない（実測: 2026-06-10 も 2025-09-10 も
//   `first page not found`）。保存しなかった日の開示は永久に失われる。
//   不祥事・子会社イベントの Edge はこれがラベルの一次情報。
//
// 守りたい性質:
//   1. 取り下げ行も残す（何が消えたかを後から復元できること）
//   2. 「開示が無かった日」と「観測しなかった日」を区別できること
//   3. 同じ開示を翌日も観測しても畳めること
//   4. 持てない項目を空文字で埋めないこと

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  appendDisclosureSnapshot,
  computeDisclosureHash,
  listArchivedDates,
  readArchivedDisclosures,
  toArchivedDisclosures,
} from "../src/disclosure-archive.js";
import type { TdnetDisclosureSnapshot } from "../src/fetcher/jpx.js";

const RETRIEVED_AT = "2026-09-11T00:00:00.000Z";

function snapshot(patch: Partial<TdnetDisclosureSnapshot> = {}): TdnetDisclosureSnapshot {
  return {
    observationDate: "2026-09-11",
    disclosures: [
      {
        code: "7203",
        sourceCode: "72030",
        companyName: "テスト自動車",
        title: "特別調査委員会の設置に関するお知らせ",
        publishedAt: "2026-09-11T15:00:00+09:00",
        url: "https://www.release.tdnet.info/inbs/example1.pdf",
      },
    ],
    withdrawn: [],
    explicitEmpty: false,
    pageCount: 1,
    pageUrls: ["https://www.release.tdnet.info/index.html"],
    ...patch,
  };
}

function makeRoot(): string {
  return mkdtempSync(resolve(tmpdir(), "disclosure-archive-"));
}

function testPublishedRowIsStored(): void {
  const root = makeRoot();
  try {
    const result = appendDisclosureSnapshot({ snapshot: snapshot(), retrievedAt: RETRIEVED_AT, root });
    assert.equal(result.appended, 1);
    const rows = readArchivedDisclosures("2026-09-11", root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, "published");
    assert.equal(rows[0]!.code, "7203");
    assert.equal(rows[0]!.sourceCode, "72030");
    assert.equal(rows[0]!.title, "特別調査委員会の設置に関するお知らせ");
    assert.equal(rows[0]!.url, "https://www.release.tdnet.info/inbs/example1.pdf");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testWithdrawnRowIsKept(): void {
  // 取り下げそのものが事象。「その日に何が出て何が消えたか」を残す。
  const root = makeRoot();
  try {
    appendDisclosureSnapshot({
      snapshot: snapshot({
        withdrawn: [{
          sourceCode: "99840",
          companyName: "テスト商事",
          title: "誤送信のお知らせ",
          historyText: "2026/09/11 08:35 削除",
        }],
      }),
      retrievedAt: RETRIEVED_AT,
      root,
    });
    const rows = readArchivedDisclosures("2026-09-11", root);
    const withdrawn = rows.find((row) => row.status === "withdrawn");
    assert.ok(withdrawn, "取り下げ行が保存されていない");
    assert.equal(withdrawn.code, "9984", "発行体コードは公開行と同じ変換で作る");
    assert.equal(withdrawn.sourceCode, "99840");
    assert.equal(withdrawn.historyText, "2026/09/11 08:35 削除");
    // 持てないものを空文字で埋めない。「不明」と「空」を後から区別できなくなる。
    assert.equal(withdrawn.publishedAt, undefined);
    assert.equal(withdrawn.url, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testEmptyDayIsDistinguishableFromUnobservedDay(): void {
  // 「開示が無かった日」と「観測しなかった日」が同じに見えると、
  // あとから穴を埋められない。
  const root = makeRoot();
  try {
    const result = appendDisclosureSnapshot({
      snapshot: snapshot({ disclosures: [], explicitEmpty: true }),
      retrievedAt: RETRIEVED_AT,
      root,
    });
    assert.equal(result.appended, 0);
    assert.deepEqual(listArchivedDates(root), ["2026-09-11"], "0件でも観測した事実は残す");
    assert.deepEqual(readArchivedDisclosures("2026-09-11", root), []);
    assert.deepEqual(readArchivedDisclosures("2026-09-10", root), [], "観測していない日は空");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testRepeatedObservationIsFolded(): void {
  const root = makeRoot();
  try {
    appendDisclosureSnapshot({ snapshot: snapshot(), retrievedAt: RETRIEVED_AT, root });
    const second = appendDisclosureSnapshot({
      snapshot: snapshot(),
      retrievedAt: "2026-09-12T00:00:00.000Z",
      root,
    });
    assert.equal(second.appended, 0);
    assert.equal(second.alreadyPresent, 1);
    assert.equal(readArchivedDisclosures("2026-09-11", root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testStatusChangeIsANewFact(): void {
  // 公開されていたものが取り下げられたら別の事実。畳んではいけない。
  // status **以外はすべて同じ**にして比べる。publishedAt / url の有無で
  // 差が付いていると、status が hash に入っていなくても通ってしまう。
  const common = { code: "7203", title: "お知らせ" } as const;
  assert.notEqual(
    computeDisclosureHash({ ...common, status: "published" }),
    computeDisclosureHash({ ...common, status: "withdrawn" }),
    "status が hash に入っていない。取り下げが公開行と同一視される",
  );
}

function testHashIgnoresObservationTime(): void {
  // 同じ開示を翌日も観測しても同じ事実。
  const rows1 = toArchivedDisclosures(snapshot(), RETRIEVED_AT);
  const rows2 = toArchivedDisclosures(snapshot(), "2026-12-31T00:00:00.000Z");
  assert.equal(rows1[0]!.contentHash, rows2[0]!.contentHash);
}

function testDuplicateWithinOneSnapshotIsFolded(): void {
  const root = makeRoot();
  try {
    const one = snapshot();
    const result = appendDisclosureSnapshot({
      snapshot: { ...one, disclosures: [one.disclosures[0]!, one.disclosures[0]!] },
      retrievedAt: RETRIEVED_AT,
      root,
    });
    assert.equal(result.appended, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testFilePermissionsArePrivate(): void {
  // 再配布の判断を避けるためローカル限定。価格ストアと同じ扱い。
  const root = makeRoot();
  try {
    const result = appendDisclosureSnapshot({ snapshot: snapshot(), retrievedAt: RETRIEVED_AT, root });
    assert.equal(statSync(result.path).mode & 0o777, 0o600);
  } finally { rmSync(root, { recursive: true, force: true }); }

  // すでに緩いパーミッションで存在するファイルも絞り直すこと。
  // 作成時の mode だけに頼ると、一度緩くなったファイルが緩いまま残る。
  const existing = makeRoot();
  try {
    const path = resolve(existing, "2026-09-11.jsonl");
    writeFileSync(path, "", { mode: 0o644 });
    chmodSync(path, 0o644);
    appendDisclosureSnapshot({ snapshot: snapshot(), retrievedAt: RETRIEVED_AT, root: existing });
    assert.equal(statSync(path).mode & 0o777, 0o600, "既存ファイルのパーミッションを絞り直していない");
  } finally { rmSync(existing, { recursive: true, force: true }); }
}

function testIncompleteRowsFailClosed(): void {
  const root = makeRoot();
  try {
    assert.throws(
      () => appendDisclosureSnapshot({
        snapshot: snapshot({
          disclosures: [{
            code: "", sourceCode: "72030", companyName: "テスト", title: "お知らせ",
            publishedAt: "2026-09-11T15:00:00+09:00", url: "https://example.invalid/a.pdf",
          }],
        }),
        retrievedAt: RETRIEVED_AT,
        root,
      }),
      /incomplete TDnet disclosure/,
    );
    assert.throws(
      () => appendDisclosureSnapshot({
        snapshot: snapshot({
          withdrawn: [{ sourceCode: "", companyName: "テスト", title: "お知らせ", historyText: "削除" }],
        }),
        retrievedAt: RETRIEVED_AT,
        root,
      }),
      /incomplete withdrawn TDnet row/,
    );
    assert.throws(
      () => appendDisclosureSnapshot({
        snapshot: snapshot({ observationDate: "2026-13-01" }),
        retrievedAt: RETRIEVED_AT,
        root,
      }),
      /is not a real date/,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testCorruptArchiveFailsClosed(): void {
  const root = makeRoot();
  try {
    writeFileSync(resolve(root, "2026-09-11.jsonl"), "{broken\n");
    assert.throws(() => readArchivedDisclosures("2026-09-11", root), /JSON を解析できません/);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testArchiveIsAppendOnly(): void {
  // 2日目の観測で1日目の内容が消えないこと。
  const root = makeRoot();
  try {
    appendDisclosureSnapshot({ snapshot: snapshot(), retrievedAt: RETRIEVED_AT, root });
    const other = snapshot();
    appendDisclosureSnapshot({
      snapshot: {
        ...other,
        disclosures: [{ ...other.disclosures[0]!, title: "別の開示", url: "https://example.invalid/b.pdf" }],
      },
      retrievedAt: "2026-09-12T00:00:00.000Z",
      root,
    });
    const rows = readArchivedDisclosures("2026-09-11", root);
    assert.equal(rows.length, 2);
    assert.ok(rows.some((row) => row.title === "特別調査委員会の設置に関するお知らせ"));
    assert.ok(rows.some((row) => row.title === "別の開示"));
    assert.ok(readFileSync(resolve(root, "2026-09-11.jsonl"), "utf-8").endsWith("\n"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

testPublishedRowIsStored();
testWithdrawnRowIsKept();
testEmptyDayIsDistinguishableFromUnobservedDay();
testRepeatedObservationIsFolded();
testStatusChangeIsANewFact();
testHashIgnoresObservationTime();
testDuplicateWithinOneSnapshotIsFolded();
testFilePermissionsArePrivate();
testIncompleteRowsFailClosed();
testCorruptArchiveFailsClosed();
testArchiveIsAppendOnly();

console.log("disclosure-archive: 全テスト成功");
