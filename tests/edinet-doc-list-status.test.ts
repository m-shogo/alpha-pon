// EDINET 書類一覧の応答検証テスト。
//
// なぜ要るか:
//   **HTTP 200 でも `metadata.status` が "404" のことがある。**
//   実測（2026-09-11）で、保持期間の外も、まだ来ていない日も、こう返る。
//
//     { "metadata": { "status": "404", "message": "Not Found" } }
//
//   これを「書類が無かった日」として保存すると、その日は観測済みになり
//   二度と取りに行かれない。休場日は status=200 で0件なので区別できる。

import assert from "node:assert/strict";
import { fetchEdinetDocList } from "../src/fetcher/edinet.js";

function respond(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;
}

const OPTIONS = { apiKey: "test-key", maxAttempts: 1 } as const;

async function testNotFoundStatusIsRejected(): Promise<void> {
  await assert.rejects(
    fetchEdinetDocList("2015-01-01", {
      ...OPTIONS,
      fetchImpl: respond({ metadata: { title: "t", status: "404", message: "Not Found" } }),
    }),
    /is unavailable for 2015-01-01.*metadata\.status=404/s,
  );
}

async function testNotFoundWithEmptyResultsIsAlsoRejected(): Promise<void> {
  // 配列チェックだけでは落ちない形。**ここが本命。**
  // API がエラー時に `results: []` を返すようになっても、
  // 「書類なし」として保存してはいけない。
  await assert.rejects(
    fetchEdinetDocList("2030-01-01", {
      ...OPTIONS,
      fetchImpl: respond({
        metadata: { title: "t", status: "404", message: "Not Found" },
        results: [],
      }),
    }),
    /is unavailable for 2030-01-01/,
  );
}

async function testHolidayWithStatus200IsAccepted(): Promise<void> {
  // 休場日は status=200 で0件。正常な空として通す。
  const rows = await fetchEdinetDocList("2024-07-15", {
    ...OPTIONS,
    fetchImpl: respond({
      metadata: { title: "t", status: "200", message: "OK", resultset: { count: 0 } },
      results: [],
    }),
  });
  assert.deepEqual(rows, []);
}

async function testNormalDayIsAccepted(): Promise<void> {
  const rows = await fetchEdinetDocList("2025-03-14", {
    ...OPTIONS,
    fetchImpl: respond({
      metadata: { title: "t", status: "200", message: "OK", resultset: { count: 1 } },
      results: [{ docID: "S100AAAA", secCode: "72030" }],
    }),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.docID, "S100AAAA");
}

async function testMissingStatusIsRejected(): Promise<void> {
  // status が無い応答も通さない。「200 とみなす」は危ない方向の推測。
  await assert.rejects(
    fetchEdinetDocList("2025-03-14", {
      ...OPTIONS,
      fetchImpl: respond({ metadata: { title: "t", message: "OK" }, results: [] }),
    }),
    /metadata\.status=なし/,
  );
}

async function main(): Promise<void> {
  await testNotFoundStatusIsRejected();
  await testNotFoundWithEmptyResultsIsAlsoRejected();
  await testHolidayWithStatus200IsAccepted();
  await testNormalDayIsAccepted();
  await testMissingStatusIsRejected();
  console.log("edinet-doc-list-status: 全テスト成功");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
