// 上場銘柄マスタの保存庫のテスト。
//
// 守りたい性質:
//   1. 同一性を ID ではなくハッシュで見る
//   2. ハッシュが JSON のキー順に左右されない
//   3. 問い合わせた日と Date が食い違う行を保存しない
//   4. 付帯台帳を日付ファイルとして拾わない
//   5. 取り出し口を通して読む（raw を直接触る場所を増やさない）

import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertRowsBelongToDate,
  codeOf,
  companyNameOf,
  computeMasterRecordHash,
  listIngestedMasterDates,
  marketOf,
  masterDateOf,
  MASTER_INGEST_LEDGER_NAME,
  readMasterDateRecords,
  scaleCategoryOf,
  sector17Of,
  sector33NameOf,
  sector33Of,
  toEquityMasterRecord,
} from "../../src/research/providers/jquants-master-store.js";

const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-master-"));
const AT = "2026-09-12T09:00:00.000Z";

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Date: "2024-06-20",
    Code: "13010",
    CoName: "極洋",
    CoNameEn: "KYOKUYO CO.,LTD.",
    S17: "1", S17Nm: "食品",
    S33: "0050", S33Nm: "水産・農林業",
    ScaleCat: "TOPIX Small 2",
    Mkt: "0111", MktNm: "プライム",
    ...over,
  };
}

function record(over: Record<string, unknown> = {}, queryDate = "2024-06-20") {
  return toEquityMasterRecord({
    queryDate, raw: row(over), retrievedAt: AT, ingestionRunId: `run:${queryDate}`,
  });
}

try {
  function testHashIgnoresKeyOrder() {
    const base = {
      schemaVersion: 1 as const, source: "jquants" as const,
      sourceVersion: "v", providerPlan: "free" as const, queryDate: "2024-06-20",
    };
    assert.equal(
      computeMasterRecordHash({ ...base, raw: { a: 1, b: { x: 1, y: 2 } } }),
      computeMasterRecordHash({ ...base, raw: { b: { y: 2, x: 1 }, a: 1 } }),
      "キー順が違うだけで別物にしない",
    );
  }

  function testHashCoversEveryStoredField() {
    // **業種や規模区分が変わったら別の行。** 実測で6ヶ月に84〜465社が動く。
    const a = record();
    for (const [label, over] of [
      ["33業種", { S33: "0051" }],
      ["規模区分", { ScaleCat: "TOPIX Mid400" }],
      ["市場区分", { Mkt: "0112" }],
      ["社名", { CoName: "極洋ホールディングス" }],
    ] as const) {
      assert.notEqual(a.contentHash, record(over).contentHash, `${label} の違いを見落とさない`);
    }
    // Code が同じでも属性が違えば別ハッシュ（ID を同一性に使わない）
    assert.equal(codeOf(a), codeOf(record({ S33: "0051" })));
    assert.notEqual(a.contentHash, record({ S33: "0051" }).contentHash);
  }

  function testHashDoesNotDependOnWhenWeFetched() {
    const first = toEquityMasterRecord({
      queryDate: "2024-06-20", raw: row(), retrievedAt: AT, ingestionRunId: "a" });
    const second = toEquityMasterRecord({
      queryDate: "2024-06-20", raw: row(), retrievedAt: "2026-09-13T00:00:00.000Z", ingestionRunId: "b" });
    assert.equal(first.contentHash, second.contentHash);
  }

  function testQueryDateMustBeIsoDate() {
    assert.throws(
      () => toEquityMasterRecord({
        queryDate: "2024/06/20", raw: row(), retrievedAt: AT, ingestionRunId: "a" }),
      /queryDate must be YYYY-MM-DD/,
    );
  }

  function testMismatchedDateIsRejected() {
    assert.doesNotThrow(() => assertRowsBelongToDate("2024-06-20", [row(), row()]));
    assert.throws(
      () => assertRowsBelongToDate("2024-06-20", [row(), row({ Date: "2024-06-19" })]),
      /Date が問い合わせた日と違う行が 1 件ある/,
    );
    assert.throws(
      () => assertRowsBelongToDate("2024-06-20", [row({ Date: undefined })]),
      /Date が問い合わせた日と違う行/,
    );
  }

  function testAccessorsReadThroughOneDoor() {
    const one = record();
    assert.equal(masterDateOf(one), "2024-06-20");
    assert.equal(codeOf(one), "13010");
    assert.equal(companyNameOf(one), "極洋");
    assert.equal(sector33Of(one), "0050");
    assert.equal(sector33NameOf(one), "水産・農林業");
    assert.equal(sector17Of(one), "1");
    assert.equal(scaleCategoryOf(one), "TOPIX Small 2");
    assert.equal(marketOf(one), "0111");
  }

  function testSidecarLedgerIsNotADateFile() {
    writeFileSync(join(dir, "2024-06-20.jsonl"), `${JSON.stringify(record())}\n`, "utf-8");
    writeFileSync(join(dir, "2024-06-21.jsonl"),
      `${JSON.stringify(record({ Date: "2024-06-21" }, "2024-06-21"))}\n`, "utf-8");
    writeFileSync(join(dir, MASTER_INGEST_LEDGER_NAME), '{"tradingDate":"2024-06-20"}\n', "utf-8");
    writeFileSync(join(dir, "2024-06-24.jsonl.partial"), "書きかけ\n", "utf-8");
    assert.deepEqual(listIngestedMasterDates(dir), ["2024-06-20", "2024-06-21"]);
  }

  function testReadingReturnsWhatWasWritten() {
    const records = readMasterDateRecords("2024-06-20", dir);
    assert.equal(records.length, 1);
    assert.equal(companyNameOf(records[0]!), "極洋");
    assert.deepEqual(readMasterDateRecords("2099-01-01", dir), [], "無い日は空");
  }

  function testBrokenLineFailsClosed() {
    writeFileSync(join(dir, "2024-06-25.jsonl"), "{壊れている\n", "utf-8");
    assert.throws(() => readMasterDateRecords("2024-06-25", dir), /JSON を解析できません/);
  }

  testHashIgnoresKeyOrder();
  testHashCoversEveryStoredField();
  testHashDoesNotDependOnWhenWeFetched();
  testQueryDateMustBeIsoDate();
  testMismatchedDateIsRejected();
  testAccessorsReadThroughOneDoor();
  testSidecarLedgerIsNotADateFile();
  testReadingReturnsWhatWasWritten();
  testBrokenLineFailsClosed();

  console.log("jquants-master-store: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
