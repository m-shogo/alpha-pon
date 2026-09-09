import assert from "node:assert/strict";
import { acquireTdnetPrimaryDocumentEvidence } from "../src/market-events/tdnet-primary-document-evidence.js";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";

const sourceUrl = "https://www.release.tdnet.info/inbs/140120260904000010.pdf";
const candidate = classifyTdnetDisclosureCandidate({
  code: "4661",
  sourceCode: "46610",
  companyName: "オリエンタルランド",
  title: "決算発表予定日に関するお知らせ",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: sourceUrl,
});
if (!candidate) throw new Error("earnings disclosure must classify as a TDnet candidate");

function responseFor(bodyText: string): Response {
  const body = new TextEncoder().encode(bodyText);
  const response = new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(body.byteLength),
    },
  });
  Object.defineProperty(response, "url", { value: sourceUrl });
  return response;
}

function fetchReturning(response: Response): typeof fetch {
  return (async () => response) as typeof fetch;
}

const whitespaceTail = await acquireTdnetPrimaryDocumentEvidence(candidate, {
  fetchImpl: fetchReturning(responseFor("%PDF-1.7 synthetic\n%%EOF\n\r\t ")),
  now: () => "2026-09-04T15:05:00+09:00",
});
assert.ok(whitespaceTail.byteLength > 0, "PDF whitespace after %%EOF must remain valid");

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(responseFor("%PDF-1.7 synthetic\n%%EOF\nTRAILING-PAYLOAD")),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /PDF EOF marker near the end and contain only whitespace after it/,
  "non-whitespace bytes after %%EOF must not be accepted as complete primary-document evidence",
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(responseFor("%PDF-1.7 %%EOF embedded marker then truncated payload")),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /PDF EOF marker near the end and contain only whitespace after it/,
  "an embedded %%EOF marker must not make a truncated payload look complete",
);

console.log("tdnet-primary-document-eof-tail: ok");
