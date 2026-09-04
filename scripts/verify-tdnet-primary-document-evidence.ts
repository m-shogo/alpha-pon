import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { acquireTdnetPrimaryDocumentEvidence } from "../src/market-events/tdnet-primary-document-evidence.js";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";

const sourceUrl = "https://www.release.tdnet.info/inbs/140120260904000010.pdf";
const maybeCandidate = classifyTdnetDisclosureCandidate({
  code: "4661",
  sourceCode: "46610",
  companyName: "オリエンタルランド",
  title: "決算発表予定日に関するお知らせ",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: sourceUrl,
});
if (!maybeCandidate) throw new Error("earnings disclosure must classify as a TDnet candidate");
const candidate = maybeCandidate;

function fakeResponse(options: {
  body?: string;
  status?: number;
  url?: string;
  contentType?: string;
  contentLength?: string | null;
} = {}): Response {
  const body = new TextEncoder().encode(options.body ?? "%PDF-1.7 synthetic primary document");
  const status = options.status ?? 200;
  const headers = new Headers();
  headers.set("content-type", options.contentType ?? "application/pdf");
  if (options.contentLength !== null) {
    headers.set("content-length", options.contentLength ?? String(body.byteLength));
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    url: options.url ?? sourceUrl,
    headers,
    arrayBuffer: async () => Uint8Array.from(body).buffer,
  } as Response;
}

function fetchReturning(response: Response): typeof fetch {
  return (async () => response) as typeof fetch;
}

const body = "%PDF-1.7 synthetic primary document";
let observedRedirectMode: RequestRedirect | undefined;
const evidence = await acquireTdnetPrimaryDocumentEvidence(candidate, {
  fetchImpl: (async (_input, init) => {
    observedRedirectMode = init?.redirect;
    return fakeResponse({ body });
  }) as typeof fetch,
  now: () => "2026-09-04T15:05:00+09:00",
});
assert.equal(observedRedirectMode, "error", "primary-document acquisition must reject redirects before fetch follows them");
assert.deepEqual(evidence, {
  candidateId: candidate.candidateId,
  sourceUrl,
  retrievedAt: "2026-09-04T15:05:00+09:00",
  contentHash: createHash("sha256").update(new TextEncoder().encode(body)).digest("hex"),
  byteLength: new TextEncoder().encode(body).byteLength,
  contentType: "application/pdf",
});
assert.equal("body" in evidence, false, "raw primary document bytes must not be returned or persisted by the evidence boundary");

let fetchCalls = 0;
const failIfFetched = (async () => {
  fetchCalls += 1;
  return fakeResponse();
}) as typeof fetch;

for (const nonCanonicalUrl of [
  "https://www.release.tdnet.info/inbs/140120260904000010.pdf?download=1",
  "https://www.release.tdnet.info/inbs/140120260904000010.pdf#page=1",
]) {
  await assert.rejects(
    () => acquireTdnetPrimaryDocumentEvidence(
      { ...candidate, sourceUrl: nonCanonicalUrl },
      { fetchImpl: failIfFetched, now: () => "2026-09-04T15:05:00+09:00" },
    ),
    /official TDnet document URL/,
  );
}

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(
    { ...candidate, sourceUrl: "https://example.com/inbs/140120260904000010.pdf" },
    { fetchImpl: failIfFetched, now: () => "2026-09-04T15:05:00+09:00" },
  ),
  /official TDnet document URL/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(
    { ...candidate, sourceUrl: "https://www.release.tdnet.info:444/inbs/140120260904000010.pdf" },
    { fetchImpl: failIfFetched, now: () => "2026-09-04T15:05:00+09:00" },
  ),
  /official TDnet document URL/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(
    { ...candidate, sourceUrl: "https://user:secret@www.release.tdnet.info/inbs/140120260904000010.pdf" },
    { fetchImpl: failIfFetched, now: () => "2026-09-04T15:05:00+09:00" },
  ),
  /official TDnet document URL/,
);
assert.equal(fetchCalls, 0, "non-canonical TDnet URLs must fail before network access");

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ url: "https://example.com/redirected.pdf" })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /final URL must be an official TDnet document URL/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ url: "https://www.release.tdnet.info/inbs/140120260904000011.pdf" })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /final URL must match requested sourceUrl/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ status: 404 })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /HTTP 404/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ contentType: "text/html" })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /must be application\/pdf/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ body: "<html>not a PDF</html>" })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /must have a PDF signature/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ contentLength: "100" })),
    now: () => "2026-09-04T15:05:00+09:00",
    maxBytes: 10,
  }),
  /exceeds maxBytes/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ contentLength: "1" })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /content-length mismatch/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse({ body: "" })),
    now: () => "2026-09-04T15:05:00+09:00",
  }),
  /body must not be empty/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse()),
    now: () => "2026-09-04T14:59:59+09:00",
  }),
  /retrievedAt must not precede disclosurePublishedAt/,
);

await assert.rejects(
  () => acquireTdnetPrimaryDocumentEvidence(candidate, {
    fetchImpl: fetchReturning(fakeResponse()),
    now: () => "2026-09-04T15:05:00",
  }),
  /explicit timezone/,
);

console.log("tdnet-primary-document-evidence: ok");
