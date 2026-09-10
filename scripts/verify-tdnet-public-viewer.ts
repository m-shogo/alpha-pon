import assert from "node:assert/strict";
import {
  buildTdnetListUrl,
  fetchTdnetDisclosureSnapshot,
  fetchTdnetDisclosures,
  parseTdnetListHtml,
  TDNET_PUBLIC_BASE_URL,
} from "../src/fetcher/jpx.js";

const DATE = "2026-09-04";

function row(input: {
  parity?: "oddnew" | "evennew";
  time: string;
  code: string;
  name: string;
  title: string;
  href: string;
}): string {
  const parity = input.parity ?? "oddnew";
  return `<tr>
    <td class="${parity}-L kjTime" nowrap>${input.time}</td>
    <td class="${parity}-M kjCode" nowrap>${input.code}</td>
    <td class="${parity}-M kjName" nowrap>${input.name}</td>
    <td align="left" class="${parity}-M kjTitle"><a href="${input.href}" target="_blank">${input.title}</a></td>
    <td class="${parity}-M kjXbrl"></td>
    <td class="${parity}-M kjPlace">東</td>
    <td class="${parity}-R kjHistroy"></td>
  </tr>`;
}

function page(rows: string[]): string {
  return `<!doctype html><html><body><table id="main-list-table">${rows.join("\n")}</table></body></html>`;
}


/** 取り下げ(削除)された開示行。`hyodaiDel` が付き、書類リンクが外れる。 */
function withdrawnRow(input: {
  time: string;
  code: string;
  name: string;
  title: string;
  history?: string;
  marker?: "class" | "history_only";
}): string {
  const marker = input.marker ?? "class";
  const trClass = marker === "class" ? ' class="hyodaiDel"' : "";
  const history = input.history ?? "2026/09/05 08:35 削除";
  return `<tr${trClass}>
    <td class="evennew-L kjTime" nowrap>${input.time}</td>
    <td class="evennew-M kjCode" nowrap>${input.code}</td>
    <td class="evennew-M kjName" nowrap>${input.name}</td>
    <td align="left" class="evennew-M kjTitle">${input.title}</td>
    <td class="evennew-M kjXbrl"></td>
    <td class="evennew-M kjPlace">東</td>
    <td class="evennew-R kjHistroy" align="left">${history}</td>
  </tr>`;
}

/** リンクが無く、取り下げマーカーも無い行。未知の構造なので落とさず例外にする。 */
function linklessUnknownRow(): string {
  return `<tr>
    <td class="oddnew-L kjTime" nowrap>15:00</td>
    <td class="oddnew-M kjCode" nowrap>99990</td>
    <td class="oddnew-M kjName" nowrap>未知構造社</td>
    <td align="left" class="oddnew-M kjTitle">リンクの無い通常行</td>
    <td class="oddnew-M kjXbrl"></td>
    <td class="oddnew-M kjPlace">東</td>
    <td class="oddnew-R kjHistroy"></td>
  </tr>`;
}

const PAGE_1 = page([
  row({
    time: "15:30",
    code: "81360",
    name: "サンリオ",
    title: "第三者委員会の設置 &amp; 今後の対応",
    href: "140120260904000001.pdf",
  }),
  row({
    parity: "evennew",
    time: "16:05",
    code: "123A0",
    name: "英字コード社",
    title: "決算発表予定日に関するお知らせ",
    href: "140120260904000002.pdf",
  }),
]);

const parsed = parseTdnetListHtml(PAGE_1, DATE);
assert.deepEqual(parsed, [
  {
    code: "8136",
    sourceCode: "81360",
    companyName: "サンリオ",
    title: "第三者委員会の設置 & 今後の対応",
    publishedAt: "2026-09-04T15:30:00+09:00",
    url: `${TDNET_PUBLIC_BASE_URL}140120260904000001.pdf`,
  },
  {
    code: "123A",
    sourceCode: "123A0",
    companyName: "英字コード社",
    title: "決算発表予定日に関するお知らせ",
    publishedAt: "2026-09-04T16:05:00+09:00",
    url: `${TDNET_PUBLIC_BASE_URL}140120260904000002.pdf`,
  },
]);

assert.equal(
  buildTdnetListUrl(DATE, 1),
  "https://www.release.tdnet.info/inbs/I_list_001_20260904.html",
  "current official TDnet public list URL must be used",
);
assert.equal(
  buildTdnetListUrl(DATE, 12),
  "https://www.release.tdnet.info/inbs/I_list_012_20260904.html",
);
assert.throws(() => buildTdnetListUrl("2026-02-31", 1), /real YYYY-MM-DD/);
assert.throws(() => buildTdnetListUrl(DATE, 0), /between 1 and 999/);

for (const nonCanonicalCode of ["123a0", "12 3A0", "123A"]) {
  assert.throws(
    () => parseTdnetListHtml(page([
      row({
        time: "15:00",
        code: nonCanonicalCode,
        name: "コード異常社",
        title: "決算発表予定日に関するお知らせ",
        href: "140120260904000099.pdf",
      }),
    ]), DATE),
    /invalid company code/,
    "TDnet sourceCode must be preserved and validated as the exact canonical 5-character source value",
  );
}

for (const nonOfficialDocumentUrl of [
  "https://example.com/not-tdnet.pdf",
  "https://user:secret@www.release.tdnet.info/inbs/140120260904000099.pdf",
  "https://www.release.tdnet.info:444/inbs/140120260904000099.pdf",
  "140120260904000099.pdf?download=1",
  "140120260904000099.pdf#page=1",
  "140120260904000099.html",
]) {
  assert.throws(
    () => parseTdnetListHtml(page([
      row({
        time: "15:00",
        code: "81360",
        name: "サンリオ",
        title: "外部リンク",
        href: nonOfficialDocumentUrl,
      }),
    ]), DATE),
    /non-official document URL/,
    "title documents must stay on the canonical official TDnet PDF boundary",
  );
}

assert.throws(
  () => parseTdnetListHtml(
    "<table id=\"main-list-table\"><tr><td class=\"oddnew-M kjCode\">81360</td></tr></table>",
    DATE,
  ),
  /row structure is incomplete/,
  "partial rows must fail closed instead of silently disappearing",
);

const pagedFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("I_list_001_")) return new Response(PAGE_1, { status: 200 });
  if (url.includes("I_list_002_")) {
    return new Response(page([
      row({
        time: "17:00",
        code: "2P110",
        name: "新コード社",
        title: "定時株主総会招集ご通知",
        href: "140120260904000003.pdf",
      }),
    ]), { status: 200 });
  }
  if (url.includes("I_list_003_")) return new Response("not found", { status: 404 });
  return new Response("unexpected", { status: 500 });
}) as typeof fetch;

const snapshot = await fetchTdnetDisclosureSnapshot({
  observationDate: DATE,
  fetchImpl: pagedFetch,
  maxPages: 5,
});
assert.equal(snapshot.explicitEmpty, false);
assert.equal(snapshot.pageCount, 2);
assert.equal(snapshot.disclosures.length, 3);
assert.equal(snapshot.disclosures[2]?.code, "2P11");
assert.equal(snapshot.disclosures[2]?.sourceCode, "2P110");
assert.equal(snapshot.pageUrls.length, 2);

const compatibilityRows = await fetchTdnetDisclosures({
  observationDate: DATE,
  fetchImpl: pagedFetch,
  maxPages: 5,
});
assert.deepEqual(compatibilityRows, snapshot.disclosures, "legacy array caller must use the same current public source snapshot");

const explicitEmptyFetch = (async () => new Response(
  "<html><body>2026年09月04日 に開示された情報はありません。</body></html>",
  { status: 200 },
)) as typeof fetch;
const explicitEmpty = await fetchTdnetDisclosureSnapshot({
  observationDate: DATE,
  fetchImpl: explicitEmptyFetch,
});
assert.equal(explicitEmpty.explicitEmpty, true);
assert.deepEqual(explicitEmpty.disclosures, []);
assert.equal(explicitEmpty.pageCount, 1);

const brokenStructureFetch = (async () => new Response(
  "<html><body><table><tr><td>redesigned without known TDnet classes</td></tr></table></body></html>",
  { status: 200 },
)) as typeof fetch;
await assert.rejects(
  fetchTdnetDisclosureSnapshot({ observationDate: DATE, fetchImpl: brokenStructureFetch }),
  /page structure was not recognized/,
  "200 response with an unknown structure must not become a successful empty snapshot",
);

const firstPage404 = (async () => new Response("not found", { status: 404 })) as typeof fetch;
await assert.rejects(
  fetchTdnetDisclosureSnapshot({ observationDate: DATE, fetchImpl: firstPage404 }),
  /first page not found/,
);

const redirectedViewerFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  assert.equal(init?.redirect, "error", "official TDnet public viewer fetches must reject HTTP redirects");
  const response = new Response(PAGE_1, { status: 200 });
  Object.defineProperty(response, "url", {
    value: "https://example.com/inbs/I_list_001_20260904.html",
  });
  return response;
}) as typeof fetch;
await assert.rejects(
  fetchTdnetDisclosureSnapshot({ observationDate: DATE, fetchImpl: redirectedViewerFetch, maxPages: 1 }),
  /final URL must match requested official URL/,
  "redirected or substituted viewer responses must not be accepted as official TDnet snapshots",
);

const endlessPages = (async () => new Response(PAGE_1, { status: 200 })) as typeof fetch;
await assert.rejects(
  fetchTdnetDisclosureSnapshot({ observationDate: DATE, fetchImpl: endlessPages, maxPages: 1 }),
  /exceeded maxPages=1/,
  "max-page exhaustion must fail closed instead of returning a truncated source snapshot",
);


// --- 取り下げ(削除)行の扱い ---
// 実データ 2026-09-08 の Ｇ－ＳＡＡＦＨＤ 行で、1行の取り下げによりその日の
// 全開示(131件)が失われていた。取り下げと確認できた行だけを明示的に除外する。
{
  const withdrawnOut: Array<{ sourceCode: string; companyName: string; title: string; historyText: string }> = [];
  const rows = parseTdnetListHtml(
    page([
      row({ time: "15:30", code: "81360", name: "サンリオ", title: "通常開示", href: "140120260904000001.pdf" }),
      withdrawnRow({ time: "15:30", code: "14470", name: "取り下げ社", title: "取り下げられた開示" }),
    ]),
    DATE,
    withdrawnOut,
  );
  assert.equal(rows.length, 1, "取り下げ行を除いた残りは取得できる");
  assert.equal(rows[0].sourceCode, "81360");
  assert.deepEqual(withdrawnOut, [
    {
      sourceCode: "14470",
      companyName: "取り下げ社",
      title: "取り下げられた開示",
      historyText: "2026/09/05 08:35 削除",
    },
  ], "取り下げは silent drop せず内容ごと記録する");
}

// 履歴欄の削除表記だけでも取り下げと判定する（class 名の変更に耐える）
{
  const withdrawnOut: Array<{ sourceCode: string }> = [];
  const rows = parseTdnetListHtml(
    page([withdrawnRow({ time: "15:30", code: "14470", name: "取り下げ社", title: "取り下げ", marker: "history_only" })]),
    DATE,
    withdrawnOut as never[],
  );
  assert.equal(rows.length, 0);
  assert.equal(withdrawnOut.length, 1, "履歴欄の削除表記でも取り下げと判定する");
}

// 取り下げマーカーが無いリンクなし行は、従来どおり fail closed のまま
assert.throws(
  () => parseTdnetListHtml(page([linklessUnknownRow()]), DATE),
  /TDnet row has no disclosure document link/,
  "未知の構造まで黙って落としてはいけない",
);

// 全行が取り下げのページを「構造未認識」と取り違えない
{
  const allWithdrawn = page([
    withdrawnRow({ time: "15:30", code: "14470", name: "取り下げ社A", title: "取り下げA" }),
    withdrawnRow({ time: "15:31", code: "14480", name: "取り下げ社B", title: "取り下げB" }),
  ]);
  const fetchAllWithdrawn = async (url: string | URL): Promise<Response> =>
    String(url) === buildTdnetListUrl(DATE, 1)
      ? new Response(allWithdrawn, { status: 200 })
      : new Response("", { status: 404 });
  const snapshot = await fetchTdnetDisclosureSnapshot({
    observationDate: DATE,
    fetchImpl: fetchAllWithdrawn as typeof fetch,
  });
  assert.equal(snapshot.disclosures.length, 0);
  assert.equal(snapshot.withdrawn.length, 2, "全行取り下げでも例外にせず件数を返す");
}

console.log("tdnet-public-viewer: ok");
