import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  EdinetApiError,
  EdinetCredentialsMissingError,
  type EdinetDoc,
} from "../src/fetcher/edinet.js";
import {
  EdinetDocumentTooLargeError,
  fetchEdinetDocument,
} from "../src/fetcher/edinet-document.js";
import { buildEdinetDocumentLineage } from "../src/fetcher/edinet-lineage.js";

function response(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

function doc(overrides: Partial<EdinetDoc> = {}): EdinetDoc {
  return {
    seqNumber: 1,
    docID: "S100ROOT",
    edinetCode: "E02655",
    secCode: "81360",
    JCN: "6010701005104",
    filerName: "株式会社サンリオ",
    fundCode: "",
    ordinanceCode: "010",
    formCode: "030000",
    docTypeCode: "120",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    submitDateTime: "2026-06-20T15:00:00+09:00",
    docDescription: "有価証券報告書",
    issuerEdinetCode: "",
    subjectEdinetCode: "",
    subsidiaryEdinetCode: "",
    currentReportReason: "",
    parentDocID: "",
    opeDateTime: "2026-06-20T15:00:00+09:00",
    withdrawalStatus: "0",
    docInfoEditStatus: "0",
    disclosureStatus: "0",
    xbrlFlag: "1",
    pdfFlag: "1",
    attachDocFlag: "0",
    englishDocFlag: "0",
    csvFlag: "1",
    legalStatus: "1",
    ...overrides,
  };
}

async function testMissingCredentialsStopsBeforeFetch(): Promise<void> {
  let called = false;
  await assert.rejects(
    () => fetchEdinetDocument("S100TEST", "1", {
      apiKey: "",
      fetchImpl: (async () => {
        called = true;
        return response("never");
      }) as typeof fetch,
    }),
    error => error instanceof EdinetCredentialsMissingError,
  );
  assert.equal(called, false);
}

async function testAuthenticatedDownloadAndHash(): Promise<void> {
  const secret = "local-edinet-secret";
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push(url);
    return response("hello", 200, {
      "content-type": "application/zip",
      "content-length": "5",
      "content-disposition": "attachment; filename=test.zip",
    });
  }) as typeof fetch;

  const result = await fetchEdinetDocument("S100TEST", "1", {
    apiKey: secret,
    fetchImpl,
    now: () => new Date("2026-08-06T05:30:00.000Z"),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.origin, "https://api.edinet-fsa.go.jp");
  assert.equal(calls[0]?.pathname, "/api/v2/documents/S100TEST");
  assert.equal(calls[0]?.searchParams.get("type"), "1");
  assert.equal(calls[0]?.searchParams.get("Subscription-Key"), secret);
  assert.equal(result.byteLength, 5);
  assert.equal(
    result.sha256,
    createHash("sha256").update("hello").digest("hex"),
  );
  assert.equal(result.retrievedAt, "2026-08-06T05:30:00.000Z");
  assert.equal(result.sourceEndpoint.includes(secret), false);
  assert.equal(result.sourceEndpoint.endsWith("?type=1"), true);
  assert.equal(new TextDecoder().decode(result.bytes), "hello");
}

async function testRetryAfter(): Promise<void> {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 1) return response("limited", 429, { "retry-after": "2" });
    return response("ok");
  }) as typeof fetch;

  await fetchEdinetDocument("S100TEST", "2", {
    apiKey: "retry-key",
    fetchImpl,
    maxAttempts: 2,
    sleep: async ms => { sleeps.push(ms); },
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
}

async function testAnnouncedSizeLimit(): Promise<void> {
  await assert.rejects(
    () => fetchEdinetDocument("S100TEST", "3", {
      apiKey: "size-key",
      maxBytes: 4,
      fetchImpl: (async () => response("12345", 200, { "content-length": "5" })) as typeof fetch,
    }),
    error => error instanceof EdinetDocumentTooLargeError,
  );
}

async function testStreamingSizeLimitWithoutContentLength(): Promise<void> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123"));
      controller.enqueue(new TextEncoder().encode("45"));
      controller.close();
    },
  });

  await assert.rejects(
    () => fetchEdinetDocument("S100TEST", "4", {
      apiKey: "stream-size-key",
      maxBytes: 4,
      fetchImpl: (async () => new Response(stream, { status: 200 })) as typeof fetch,
    }),
    error =>
      error instanceof EdinetDocumentTooLargeError
      && error.actualBytes === 5
      && error.limitBytes === 4,
  );
}

async function testSecretDoesNotLeakOnError(): Promise<void> {
  const secret = "must-not-leak";
  await assert.rejects(
    () => fetchEdinetDocument("S100TEST", "1", {
      apiKey: secret,
      maxAttempts: 1,
      fetchImpl: (async () => response(secret, 401)) as typeof fetch,
    }),
    error => {
      assert.ok(error instanceof EdinetApiError);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
}

async function testInputValidationBeforeFetch(): Promise<void> {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return response("never");
  }) as typeof fetch;

  await assert.rejects(
    () => fetchEdinetDocument("../secret", "1", { apiKey: "x", fetchImpl }),
    /docID/,
  );
  await assert.rejects(
    () => fetchEdinetDocument("S100TEST", "9", { apiKey: "x", fetchImpl }),
    /document type/,
  );
  assert.equal(called, false);
}

function testLineageProjection(): void {
  const root = doc();
  const correction = doc({
    seqNumber: 2,
    docID: "S100CORR",
    parentDocID: root.docID,
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
  });

  const result = buildEdinetDocumentLineage([correction, root]);
  assert.equal(result.hasBlockingIssues, false);
  assert.deepEqual(result.issues, []);
  const child = result.nodes.find(value => value.docID === correction.docID);
  assert.equal(child?.chainRootDocID, root.docID);
  assert.equal(child?.relation, "parent_linked");
  assert.equal(child?.revisionReviewHint, "correction_candidate");
  assert.equal(child?.requiresHumanReview, true);
}

function testLineageAnomalies(): void {
  const missingParent = doc({
    docID: "S100MISS",
    parentDocID: "S100OUTSIDE",
  });
  const cycleA = doc({
    docID: "S100CYA",
    parentDocID: "S100CYB",
  });
  const cycleB = doc({
    docID: "S100CYB",
    parentDocID: "S100CYA",
  });
  const earlyChild = doc({
    docID: "S100EARLY",
    parentDocID: "S100LATE",
    submitDateTime: "2026-05-01T00:00:00+09:00",
  });
  const lateParent = doc({
    docID: "S100LATE",
    submitDateTime: "2026-06-01T00:00:00+09:00",
  });

  const result = buildEdinetDocumentLineage([
    missingParent,
    cycleA,
    cycleB,
    earlyChild,
    lateParent,
  ]);

  assert.equal(result.hasBlockingIssues, true);
  assert.ok(result.issues.some(value => value.code === "missing_parent_document"));
  assert.ok(result.issues.some(value => value.code === "lineage_cycle"));
  assert.ok(result.issues.some(value => value.code === "child_precedes_parent"));
  const missingParentNode = result.nodes.find(value => value.docID === "S100MISS");
  assert.equal(missingParentNode?.chainRootDocID, "S100OUTSIDE");
}

function testLineageRejectsInvalidSubmitInstants(): void {
  const timezoneLessSubmit = doc({
    docID: "S100NOZONE",
    submitDateTime: "2026-06-20T15:00:00",
  });
  const impossibleSubmit = doc({
    docID: "S100BADDATE",
    submitDateTime: "2026-02-30T15:00:00+09:00",
  });

  const result = buildEdinetDocumentLineage([timezoneLessSubmit, impossibleSubmit]);

  assert.equal(result.hasBlockingIssues, true);
  assert.ok(result.issues.some(value =>
    value.target === "S100NOZONE" && value.code === "invalid_submit_datetime"
  ));
  assert.ok(result.issues.some(value =>
    value.target === "S100BADDATE" && value.code === "invalid_submit_datetime"
  ));
}

function testLineageRejectsNonCanonicalDocIds(): void {
  const empty = doc({ docID: "   " });
  const padded = doc({ docID: " S100PADDED " });

  const result = buildEdinetDocumentLineage([empty, padded]);

  assert.equal(result.hasBlockingIssues, true);
  assert.equal(result.nodes.length, 0);
  assert.ok(result.issues.some(value =>
    value.target === "<empty>" && value.code === "invalid_doc_id"
  ));
  assert.ok(result.issues.some(value =>
    value.target === "S100PADDED" && value.code === "invalid_doc_id"
  ));
}

async function main(): Promise<void> {
  await testMissingCredentialsStopsBeforeFetch();
  await testAuthenticatedDownloadAndHash();
  await testRetryAfter();
  await testAnnouncedSizeLimit();
  await testStreamingSizeLimitWithoutContentLength();
  await testSecretDoesNotLeakOnError();
  await testInputValidationBeforeFetch();
  testLineageProjection();
  testLineageAnomalies();
  testLineageRejectsInvalidSubmitInstants();
  testLineageRejectsNonCanonicalDocIds();
  console.log("edinet-document-lineage.test.ts passed");
}

await main();
