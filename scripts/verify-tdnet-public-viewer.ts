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

assert.throws(
  () => parseTdnetListHtml(page([
    row({
      time: "15:00",
      code: "81360",
      name: "サンリオ",
      title: "外部リンク",
      href: "https://example.com/not-tdnet.pdf",
    }),
  ]), DATE),
  /non-official document URL/,
  "title documents must stay on the official TDnet public host",
);

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

const endlessPages = (async () => new Response(PAGE_1, { status: 200 })) as typeof fetch;
await assert.rejects(
  fetchTdnetDisclosureSnapshot({ observationDate: DATE, fetchImpl: endlessPages, maxPages: 1 }),
  /exceeded maxPages=1/,
  "max-page exhaustion must fail closed instead of returning a truncated source snapshot",
);

console.log("tdnet-public-viewer: ok");