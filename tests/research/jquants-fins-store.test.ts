// 決算開示の保存庫のテスト。
//
// 守りたい性質:
//   1. 同一性を ID ではなくハッシュで見る（EDINET の docID は実際に衝突した）
//   2. ハッシュが JSON のキー順に左右されない
//   3. 問い合わせた日と DiscDate が食い違う行を保存しない
//   4. 付帯台帳を日付ファイルとして拾わない
//   5. 取り出し口を通して読む（raw を直接触る場所を増やさない）

import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadEarningsEventDatesFromStore,
} from "../../src/research/study-inputs-from-store.js";
import {
  assertRowsBelongToDate,
  codeOf,
  computeFinsRecordHash,
  disclosedDateOf,
  disclosedTimeOf,
  disclosureNumberOf,
  docTypeOf,
  FINS_INGEST_LEDGER_NAME,
  listIngestedFinsDates,
  readFinsDateRecords,
  toFinsDisclosureRecord,
} from "../../src/research/providers/jquants-fins-store.js";

const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-fins-"));
const AT = "2026-09-11T09:00:00.000Z";

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    DiscDate: "2025-05-09",
    DiscTime: "15:00:00",
    Code: "85370",
    DiscNo: "20250303586531",
    DocType: "FYFinancialStatements_Consolidated_JP",
    Sales: "22436000000",
    ...over,
  };
}

function record(over: Record<string, unknown> = {}, queryDate = "2025-05-09") {
  return toFinsDisclosureRecord({
    queryDate,
    raw: row(over),
    retrievedAt: AT,
    ingestionRunId: `run:${queryDate}`,
  });
}

try {
  function testHashIgnoresKeyOrder() {
    // API が項目の順を変えただけで「別の行」に見えると、重複検査が意味を失う。
    const ordered = { a: 1, b: { x: 1, y: 2 }, c: [1, 2] };
    const shuffled = { c: [1, 2], b: { y: 2, x: 1 }, a: 1 };
    const base = {
      schemaVersion: 1 as const,
      source: "jquants" as const,
      sourceVersion: "v",
      providerPlan: "free" as const,
      queryDate: "2025-05-09",
    };
    assert.equal(
      computeFinsRecordHash({ ...base, raw: ordered }),
      computeFinsRecordHash({ ...base, raw: shuffled }),
      "キー順が違うだけで別物にしない",
    );
  }

  function testHashCoversEveryStoredField() {
    // ID を信用しない。**中身が1文字でも違えば別の行。**
    const a = record();
    for (const [label, over] of [
      ["DocType", { DocType: "EarnForecastRevision" }],
      ["DiscTime", { DiscTime: "15:30:00" }],
      ["Sales", { Sales: "22436000001" }],
      ["新しい項目", { NewField: 1 }],
    ] as const) {
      assert.notEqual(a.contentHash, record(over).contentHash, `${label} の違いを見落とさない`);
    }
    // DiscNo が同じでも中身が違えば別ハッシュ（ID を同一性に使わない）
    assert.equal(disclosureNumberOf(a), disclosureNumberOf(record({ Sales: "1" })));
    assert.notEqual(a.contentHash, record({ Sales: "1" }).contentHash);
  }

  function testHashDoesNotDependOnWhenWeFetched() {
    // 取得時刻でハッシュが変わると、同じ開示を再取得するたび別物になる。
    const first = toFinsDisclosureRecord({
      queryDate: "2025-05-09", raw: row(), retrievedAt: AT, ingestionRunId: "a",
    });
    const second = toFinsDisclosureRecord({
      queryDate: "2025-05-09", raw: row(), retrievedAt: "2026-09-12T00:00:00.000Z", ingestionRunId: "b",
    });
    assert.equal(first.contentHash, second.contentHash);
  }

  function testQueryDateMustBeIsoDate() {
    assert.throws(
      () => toFinsDisclosureRecord({
        queryDate: "2025/05/09", raw: row(), retrievedAt: AT, ingestionRunId: "a",
      }),
      /queryDate must be YYYY-MM-DD/,
    );
  }

  function testMismatchedDiscDateIsRejected() {
    // 黙って保存すると、保存庫の「その日」に別の日の開示が混ざる。
    assert.doesNotThrow(() => assertRowsBelongToDate("2025-05-09", [row(), row()]));
    assert.throws(
      () => assertRowsBelongToDate("2025-05-09", [row(), row({ DiscDate: "2025-05-08" })]),
      /DiscDate が問い合わせた日と違う行が 1 件ある/,
    );
    // DiscDate が欠けている行も通さない。
    assert.throws(
      () => assertRowsBelongToDate("2025-05-09", [row({ DiscDate: undefined })]),
      /DiscDate が問い合わせた日と違う行/,
    );
  }

  function testAccessorsReadThroughOneDoor() {
    const one = record({ DocType: "EarnForecastRevision" });
    assert.equal(disclosedDateOf(one), "2025-05-09");
    assert.equal(disclosedTimeOf(one), "15:00:00");
    assert.equal(codeOf(one), "85370");
    assert.equal(docTypeOf(one), "EarnForecastRevision");
    assert.equal(disclosureNumberOf(one), "20250303586531");
  }

  function testSidecarLedgerIsNotADateFile() {
    // 価格側で実際に起きた事故と同じ形。付帯台帳を日付ファイルとして読むと、
    // schema の違う行が混ざって検査が落ちる。
    writeFileSync(join(dir, "2025-05-09.jsonl"), `${JSON.stringify(record())}\n`, "utf-8");
    writeFileSync(join(dir, "2025-05-12.jsonl"), `${JSON.stringify(record({}, "2025-05-12"))}\n`, "utf-8");
    writeFileSync(join(dir, FINS_INGEST_LEDGER_NAME), '{"tradingDate":"2025-05-09"}\n', "utf-8");
    writeFileSync(join(dir, "2025-05-13.jsonl.partial"), "書きかけ\n", "utf-8");
    assert.deepEqual(listIngestedFinsDates(dir), ["2025-05-09", "2025-05-12"]);
  }

  function testReadingReturnsWhatWasWritten() {
    const records = readFinsDateRecords("2025-05-09", dir);
    assert.equal(records.length, 1);
    assert.equal(codeOf(records[0]!), "85370");
    assert.deepEqual(readFinsDateRecords("2099-01-01", dir), [], "無い日は空");
  }

  function testBrokenLineFailsClosed() {
    writeFileSync(join(dir, "2025-05-14.jsonl"), "{壊れている\n", "utf-8");
    assert.throws(() => readFinsDateRecords("2025-05-14", dir), /JSON を解析できません/);
  }

  function testLoaderFailsClosedWhenTheStoreIsMissing() {
    // 空の Map を返すと「既知イベントが無い」と「情報が無い」を区別できない。
    assert.throws(
      () => loadEarningsEventDatesFromStore({
        tradingDates: ["2025-05-09"], root: join(dir, "nonexistent"),
      }),
      /決算開示の保存庫がありません/,
    );
  }

  function testLoaderBuildsKnownEventDates() {
    // 壊れたファイルの混ざらない別の保存庫で見る。
    const clean = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-fins-ok-"));
    try {
      writeFileSync(join(clean, "2025-05-09.jsonl"),
        `${JSON.stringify(record())}\n`
        + `${JSON.stringify(record({ Code: "72030", DiscTime: "16:00:00" }))}\n`,
        "utf-8");
      writeFileSync(join(clean, FINS_INGEST_LEDGER_NAME), '{"tradingDate":"2025-05-09"}\n', "utf-8");

      const result = loadEarningsEventDatesFromStore({
        tradingDates: ["2025-05-09", "2025-05-12"],
        root: clean,
      });
      assert.equal(result.disclosureCount, 2);
      assert.equal(result.datesScanned, 1);
      assert.equal(result.unresolved, 0);
      // 15:00 は引け（2024-11-05 以降は 15:30）より前なので当日だけ。
      assert.deepEqual([...result.byCode.get("85370")!].sort(), ["2025-05-09"]);
      // 16:00 は引け後なので当日＋翌営業日。
      assert.deepEqual([...result.byCode.get("72030")!].sort(), ["2025-05-09", "2025-05-12"]);
    } finally {
      rmSync(clean, { recursive: true, force: true });
    }
  }

  function testLoaderFailsClosedOnABrokenFile() {
    // 1行でも読めなければ止める。読めた分だけで「決算はこれだけ」と言わない。
    const broken = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-fins-ng-"));
    try {
      writeFileSync(join(broken, "2025-05-09.jsonl"), "{壊れている\n", "utf-8");
      assert.throws(
        () => loadEarningsEventDatesFromStore({ tradingDates: ["2025-05-09"], root: broken }),
        /JSON を解析できません/,
      );
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  }

  testHashIgnoresKeyOrder();
  testHashCoversEveryStoredField();
  testHashDoesNotDependOnWhenWeFetched();
  testQueryDateMustBeIsoDate();
  testMismatchedDiscDateIsRejected();
  testAccessorsReadThroughOneDoor();
  testSidecarLedgerIsNotADateFile();
  testReadingReturnsWhatWasWritten();
  testBrokenLineFailsClosed();
  testLoaderFailsClosedWhenTheStoreIsMissing();
  testLoaderBuildsKnownEventDates();
  testLoaderFailsClosedOnABrokenFile();

  console.log("jquants-fins-store: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
