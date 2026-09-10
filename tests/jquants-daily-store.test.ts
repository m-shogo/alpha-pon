// 日付メジャー保存からの読み出しテスト。
//
// 危ないところ:
//   1. 高速化のための文字列篩（needle）。保存形式が変われば黙ってすり抜ける。
//      → 「0件だった銘柄」を必ず報告させ、黙って空系列を返さないこと。
//   2. `"7203"` が `"72030"` に誤爆しないこと。桁が違う別銘柄を掴む。
//   3. 期間で絞ったとき、境界日を落とさないこと。

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  codeNeedle,
  loadBacktestSeriesAsOf,
  listIngestedDates,
  loadSeriesForCodes,
  readDateRecords,
  universeOn,
} from "../src/research/providers/jquants-daily-store.js";
import { selectPriceRecordsAsOf, type PitPriceRecord } from "../src/research/price-store.js";

function record(
  code: string,
  tradingDate: string,
  close: number,
  status: PitPriceRecord["status"] = "traded",
): PitPriceRecord {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code,
    market: "TSE",
    tradingDate,
    dataAsOf: `${tradingDate}T15:30:00+09:00`,
    observedAt: `${tradingDate}T23:59:59.999999999+09:00`,
    retrievedAt: "2026-09-01T00:00:00.000Z",
    firstExecutableAt: "2026-09-01T00:00:00.000Z",
    source: "jquants",
    sourceVersion: "test",
    providerPlan: "free",
    delayDays: 84,
    isDelayed: true,
    ingestionRunId: "test",
    currency: "JPY",
    status,
    ...(status === "missing"
      ? { missingReason: "unknown" as const }
      : { ohlcv: { open: close, high: close, low: close, close, volume: 100 } }),
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: "local_only",
    contentHash: `hash-${code}-${tradingDate}`,
  };
}

function makeStore(days: Record<string, PitPriceRecord[]>): string {
  const root = mkdtempSync(resolve(tmpdir(), "jq-daily-store-"));
  for (const [date, records] of Object.entries(days)) {
    writeFileSync(
      resolve(root, `${date}.jsonl`),
      `${records.map((value) => JSON.stringify(value)).join("\n")}\n`,
    );
  }
  return root;
}

function testNeedleDoesNotMatchLongerCode(): void {
  // 4桁 `7203` と5桁 `72030` は別銘柄。閉じ引用符が誤爆を止める。
  const line = JSON.stringify(record("72030", "2025-09-01", 1000));
  assert.ok(line.includes(codeNeedle("72030")));
  assert.ok(!line.includes(codeNeedle("7203")), "4桁の needle が5桁の行に当たってはいけない");
}

function testLoadSeriesPicksOnlyRequestedCodes(): void {
  const root = makeStore({
    "2025-09-01": [record("13060", "2025-09-01", 100), record("72030", "2025-09-01", 200), record("99840", "2025-09-01", 300)],
    "2025-09-02": [record("13060", "2025-09-02", 101), record("72030", "2025-09-02", 201), record("99840", "2025-09-02", 301)],
  });
  try {
    const result = loadSeriesForCodes({ codes: ["72030"], root });
    assert.deepEqual([...result.series.keys()], ["72030"]);
    assert.equal(result.series.get("72030")!.length, 2);
    assert.deepEqual(result.missingCodes, []);
    assert.equal(result.datesScanned, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testIngestedDatesAreSorted(): void {
  // 系列の時系列順は listIngestedDates の昇順に依存している。
  //
  // 注: macOS の readdirSync は実測でソート済みを返すため、この検査は
  // 「ソートを消しても落ちない」等価変異になる。それでも契約は契約なので
  // 明示しておく（readdir 順に依存しない FS へ移したときの防波堤）。
  const root = makeStore({
    "2025-09-03": [record("72030", "2025-09-03", 3)],
    "2025-09-01": [record("72030", "2025-09-01", 1)],
    "2025-12-31": [record("72030", "2025-12-31", 9)],
    "2025-09-10": [record("72030", "2025-09-10", 5)],
  });
  try {
    assert.deepEqual(listIngestedDates(root),
      ["2025-09-01", "2025-09-03", "2025-09-10", "2025-12-31"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testStringFieldCannotImpersonateTheCodeField(): void {
  // 篩（文字列一致）が安全である根拠を固定する。
  //
  // JSON.stringify は文字列値の中の `"` を `\"` にエスケープするので、
  // `"code":"13060"` という並びは「本物の code フィールド」としてしか
  // 行に現れない。文字列値が code フィールドになりすますことはできない。
  // この性質が崩れたら（保存形式を変えたら）、別会社の値段が要求した銘柄の
  // 系列に紛れ込み、検証が静かに嘘になる。
  const foreign = record("99840", "2025-09-01", 500);
  foreign.ingestionRunId = 'run-containing-"code":"13060"-by-accident';

  const root = makeStore({ "2025-09-01": [foreign] });
  try {
    const result = loadSeriesForCodes({ codes: ["13060"], root });
    assert.equal(result.series.get("13060")!.length, 0, "文字列値が code になりすませてはいけない");
    assert.deepEqual(result.missingCodes, ["13060"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testSeriesIsChronological(): void {
  // 日付ファイルの読み順に依存させない。
  const root = makeStore({
    "2025-09-03": [record("72030", "2025-09-03", 203)],
    "2025-09-01": [record("72030", "2025-09-01", 201)],
    "2025-09-02": [record("72030", "2025-09-02", 202)],
  });
  try {
    const result = loadSeriesForCodes({ codes: ["72030"], root });
    assert.deepEqual(
      result.series.get("72030")!.map((value) => value.tradingDate),
      ["2025-09-01", "2025-09-02", "2025-09-03"],
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testMissingCodesAreReportedNotSilentlyEmpty(): void {
  // ここが篩の安全装置。形式が変わって全部すり抜けても、空系列を「データ無し」
  // として黙って返さず、呼び出し側が fail closed できるようにする。
  const root = makeStore({ "2025-09-01": [record("13060", "2025-09-01", 100)] });
  try {
    const result = loadSeriesForCodes({ codes: ["13060", "99999"], root });
    assert.deepEqual(result.missingCodes, ["99999"]);
    assert.equal(result.series.get("99999")!.length, 0);
    assert.equal(result.series.get("13060")!.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDateRangeIncludesBoundaries(): void {
  const root = makeStore({
    "2025-09-01": [record("72030", "2025-09-01", 1)],
    "2025-09-02": [record("72030", "2025-09-02", 2)],
    "2025-09-03": [record("72030", "2025-09-03", 3)],
    "2025-09-04": [record("72030", "2025-09-04", 4)],
  });
  try {
    const result = loadSeriesForCodes({ codes: ["72030"], from: "2025-09-02", to: "2025-09-03", root });
    assert.deepEqual(
      result.series.get("72030")!.map((value) => value.tradingDate),
      ["2025-09-02", "2025-09-03"],
      "from と to の当日を含む",
    );
    assert.equal(result.datesScanned, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testUniverseExcludesNonTradedRows(): void {
  // 板が立たなかった行をユニバースに入れると、対照群に売買できない銘柄が混ざる。
  const root = makeStore({
    "2025-09-01": [
      record("13060", "2025-09-01", 100),
      record("99999", "2025-09-01", 0, "missing"),
      record("72030", "2025-09-01", 200),
    ],
  });
  try {
    assert.deepEqual(universeOn("2025-09-01", root), ["13060", "72030"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testListIngestedDatesIgnoresPartials(): void {
  const root = makeStore({ "2025-09-01": [record("13060", "2025-09-01", 100)] });
  try {
    writeFileSync(resolve(root, "2025-09-02.jsonl.partial"), "{broken\n");
    writeFileSync(resolve(root, "_ingest-log.jsonl"), "{}\n");
    assert.deepEqual(listIngestedDates(root), ["2025-09-01"], "書きかけと台帳は日付ではない");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testMissingStoreIsEmptyNotError(): void {
  const root = resolve(tmpdir(), "jq-daily-store-does-not-exist");
  assert.deepEqual(listIngestedDates(root), []);
  assert.deepEqual(readDateRecords("2025-09-01", root), []);
}

function testInvalidCodeFailsClosed(): void {
  assert.throws(() => loadSeriesForCodes({ codes: ["abc"] }), /invalid security code/);
  assert.throws(() => loadSeriesForCodes({ codes: ["1306"], from: "2025-09-05", to: "2025-09-01" }),
    /from must be on or before to/);
}

function testCorruptLineFailsClosed(): void {
  // 壊れた行を黙って飛ばすと、欠損に気づかないまま検証が進む。
  const root = mkdtempSync(resolve(tmpdir(), "jq-daily-store-"));
  try {
    writeFileSync(resolve(root, "2025-09-01.jsonl"), '{"code":"13060"\n');
    assert.throws(() => readDateRecords("2025-09-01", root), /JSON を解析できません/);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// ── backtest 系列ローダー ────────────────────────────────
// 4,400銘柄×520日を1銘柄ずつ selectPriceRecordsAsOf に通すと同じデータを
// 何度も走査することになるので専用の1パス版を持つ。だが PIT のゲートを
// 独自実装すると、そこだけ先読みが漏れる。ゲートの同一性をここで固定する。

const LATE_AS_OF = "2026-09-01T00:00:00.000Z";

function testLoaderBuildsChronologicalSeries(): void {
  const root = makeStore({
    "2025-09-02": [record("13060", "2025-09-02", 102), record("72030", "2025-09-02", 202)],
    "2025-09-01": [record("13060", "2025-09-01", 101), record("72030", "2025-09-01", 201)],
  });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    assert.deepEqual(result.series.map((value) => value.code), ["13060", "72030"], "code 昇順");
    assert.deepEqual(
      result.series[0]!.bars.map((bar) => bar.date),
      ["2025-09-01", "2025-09-02"],
      "bars は date 昇順",
    );
    assert.deepEqual(result.series[0]!.bars[0], {
      date: "2025-09-01", open: 101, high: 101, low: 101, close: 101, volume: 100,
    });
    assert.equal(result.rowsScanned, 4);
    assert.equal(result.datesScanned, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderAppliesObservedAtGate(): void {
  // 開示遅延の内側の行を混ぜると、全バックテストが先読みになる。
  const early = record("13060", "2025-09-01", 100);
  const root = makeStore({ "2025-09-01": [early] });
  try {
    const before = loadBacktestSeriesAsOf({ asOf: "2025-08-31T00:00:00.000Z", root });
    assert.deepEqual(before.series, [], "observedAt より前の asOf では1本も出さない");
    assert.equal(before.skipped.observedAtAfterAsOf, 1, "落とした理由を報告する");

    const after = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    assert.equal(after.series.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderAppliesRetrievedAtAndFirstExecutableGates(): void {
  // retrievedAt / firstExecutableAt は "executable" 境界の条件。
  // observedAt だけ見ていると「まだ手元に無かったデータ」で約定できてしまう。
  const late = record("13060", "2025-09-01", 100);
  late.retrievedAt = "2026-12-01T00:00:00.000Z";
  late.firstExecutableAt = "2026-12-01T00:00:00.000Z";
  const root = makeStore({ "2025-09-01": [late] });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    assert.deepEqual(result.series, []);
    assert.equal(result.skipped.retrievedAtAfterAsOf, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }

  const notYetExecutable = record("13060", "2025-09-01", 100);
  notYetExecutable.firstExecutableAt = "2026-12-01T00:00:00.000Z";
  const root2 = makeStore({ "2025-09-01": [notYetExecutable] });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root: root2 });
    assert.deepEqual(result.series, []);
    assert.equal(result.skipped.firstExecutableAtAfterAsOf, 1);
  } finally { rmSync(root2, { recursive: true, force: true }); }
}

function testLoaderMatchesSelectPriceRecordsAsOf(): void {
  // ゲートの独自実装が正本からずれていないことを、正本と突き合わせて確かめる。
  const rows = [
    record("13060", "2025-09-01", 100),
    record("13060", "2025-09-02", 101),
  ];
  rows[1]!.retrievedAt = "2026-12-01T00:00:00.000Z";
  rows[1]!.firstExecutableAt = "2026-12-01T00:00:00.000Z";

  const root = makeStore({ "2025-09-01": [rows[0]!], "2025-09-02": [rows[1]!] });
  try {
    const loader = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    const canonical = selectPriceRecordsAsOf(rows, LATE_AS_OF,
      { seriesKind: "security", code: "13060" }, "executable");
    assert.deepEqual(
      loader.series[0]!.bars.map((bar) => bar.date),
      canonical.map((value) => value.tradingDate),
      "1パス版と selectPriceRecordsAsOf が同じ行を選ぶこと",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderExcludesNonTradedRows(): void {
  const root = makeStore({
    "2025-09-01": [record("13060", "2025-09-01", 100), record("99999", "2025-09-01", 0, "missing")],
  });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    assert.deepEqual(result.series.map((value) => value.code), ["13060"]);
    assert.equal(result.skipped.notTraded, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderRejectsSuspendedRowsThatStillCarryPrices(): void {
  // 売買停止・値付かずの日に前日値が残っていることはある。ohlcv の有無だけで
  // 判定すると、その日に約定できたことにしてしまう。status を見ること。
  const suspended = record("99999", "2025-09-01", 500, "suspended");
  assert.ok(suspended.ohlcv, "テスト前提: 停止でも値は入っている");

  const root = makeStore({ "2025-09-01": [record("13060", "2025-09-01", 100), suspended] });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    assert.deepEqual(result.series.map((value) => value.code), ["13060"],
      "status が traded でない行は約定できない");
    assert.equal(result.skipped.notTraded, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderFailsClosedOnDuplicateRevision(): void {
  // 改訂の解決はこのローダーの責務ではない。黙って片方を採ると再現しなくなる。
  const root = mkdtempSync(resolve(tmpdir(), "jq-daily-store-"));
  try {
    const a = record("13060", "2025-09-01", 100);
    const b = record("13060", "2025-09-01", 999);
    b.contentHash = "hash-other";
    writeFileSync(resolve(root, "2025-09-01.jsonl"),
      `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`);
    assert.throws(() => loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root }),
      /two records for 13060 on 2025-09-01/);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderSortsSeriesByCodeRegardlessOfFileOrder(): void {
  // 取り込み側は code 昇順で書くが、それに依存すると取り込み実装を
  // 変えた瞬間に出力順が変わり、差分が毎回汚れる。
  const root = makeStore({
    "2025-09-01": [
      record("99840", "2025-09-01", 3),
      record("13060", "2025-09-01", 1),
      record("72030", "2025-09-01", 2),
    ],
  });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, root });
    assert.deepEqual(result.series.map((value) => value.code), ["13060", "72030", "99840"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderCodeFilter(): void {
  const root = makeStore({
    "2025-09-01": [record("13060", "2025-09-01", 100), record("72030", "2025-09-01", 200)],
  });
  try {
    const result = loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, codes: ["72030"], root });
    assert.deepEqual(result.series.map((value) => value.code), ["72030"]);
    assert.equal(result.skipped.outsideRequestedCodes, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testLoaderInvalidInputFailsClosed(): void {
  // 空のストアでも入力検証が走ること。ループの中の比較に検証を任せると
  // 「1行も無いときだけ不正な asOf が素通り」する（同じ穴を2度踏まないため）。
  const emptyRoot = mkdtempSync(resolve(tmpdir(), "jq-daily-store-empty-"));
  try {
    assert.throws(() => loadBacktestSeriesAsOf({ asOf: "2026-09-01", root: emptyRoot }), /asOf/);
    assert.throws(() => loadBacktestSeriesAsOf({ asOf: "not-a-timestamp", root: emptyRoot }), /asOf/);
  } finally { rmSync(emptyRoot, { recursive: true, force: true }); }

  assert.throws(() => loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, from: "2025-09-05", to: "2025-09-01" }),
    /from must be on or before to/);
  assert.throws(() => loadBacktestSeriesAsOf({ asOf: LATE_AS_OF, codes: ["abc"] }), /invalid security code/);
}

testLoaderBuildsChronologicalSeries();
testLoaderAppliesObservedAtGate();
testLoaderAppliesRetrievedAtAndFirstExecutableGates();
testLoaderMatchesSelectPriceRecordsAsOf();
testLoaderExcludesNonTradedRows();
testLoaderRejectsSuspendedRowsThatStillCarryPrices();
testLoaderSortsSeriesByCodeRegardlessOfFileOrder();
testLoaderFailsClosedOnDuplicateRevision();
testLoaderCodeFilter();
testLoaderInvalidInputFailsClosed();

testNeedleDoesNotMatchLongerCode();
testLoadSeriesPicksOnlyRequestedCodes();
testIngestedDatesAreSorted();
testStringFieldCannotImpersonateTheCodeField();
testSeriesIsChronological();
testMissingCodesAreReportedNotSilentlyEmpty();
testDateRangeIncludesBoundaries();
testUniverseExcludesNonTradedRows();
testListIngestedDatesIgnoresPartials();
testMissingStoreIsEmptyNotError();
testInvalidCodeFailsClosed();
testCorruptLineFailsClosed();

console.log("jquants-daily-store: 全テスト成功");
