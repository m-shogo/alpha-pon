import assert from "node:assert/strict";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import {
  buildSanrioEdinetInventory,
  documentTypePlan,
  enumerateBusinessDates,
  isSanrioPrimaryDisclosure,
  scanSanrioEdinetRange,
} from "../src/fetcher/edinet-sanrio-pilot.js";

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
    attachDocFlag: "1",
    englishDocFlag: "0",
    csvFlag: "1",
    legalStatus: "1",
    ...overrides,
  };
}

function testBusinessDateEnumeration(): void {
  assert.deepEqual(
    enumerateBusinessDates("2026-08-01", "2026-08-04"),
    ["2026-08-03", "2026-08-04"],
  );
  assert.throws(
    () => enumerateBusinessDates("2026-02-30", "2026-03-01"),
    /valid calendar date/,
  );
  assert.throws(
    () => enumerateBusinessDates("2026-08-04", "2026-08-03"),
    /from must be/,
  );
}

function testSanrioIdentityBoundary(): void {
  assert.equal(isSanrioPrimaryDisclosure(doc()), true);
  assert.equal(isSanrioPrimaryDisclosure(doc({ edinetCode: "", secCode: "81360" })), true);
  assert.equal(isSanrioPrimaryDisclosure(doc({
    edinetCode: "E99999",
    secCode: "99990",
    issuerEdinetCode: "E02655",
    filerName: "サンリオ株式の大量保有者",
  })), false, "issuer-only third-party filing must not enter the primary-disclosure pilot");
}

function testOfficialDocumentTypePlan(): void {
  assert.deepEqual(
    documentTypePlan(doc()).map(item => [item.type, item.format]),
    [["1", "zip"], ["2", "pdf"], ["3", "zip"], ["5", "zip"]],
  );
  assert.deepEqual(documentTypePlan(doc({ legalStatus: "3" })), []);
}

function testInventoryAndLineage(): void {
  const initial = doc();
  const staleDuplicate = doc({
    docID: initial.docID,
    opeDateTime: "2026-06-20T14:00:00+09:00",
    docDescription: "古いメタデータ",
  });
  const correction = doc({
    seqNumber: 2,
    docID: "S100CORR",
    parentDocID: initial.docID,
    formCode: "030001",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
  });
  const outsider = doc({
    docID: "S100OTHER",
    edinetCode: "E99999",
    secCode: "99990",
    filerName: "他社",
  });

  const inventory = buildSanrioEdinetInventory({
    from: "2026-01-01",
    to: "2026-08-06",
    generatedAt: "2026-08-06T06:30:00.000Z",
    scannedBusinessDays: 156,
    failedDates: [],
    docs: [staleDuplicate, outsider, correction, initial],
  });

  assert.equal(inventory.completeness, "complete");
  assert.equal(inventory.appendAuthorized, false);
  assert.equal(inventory.candidates.length, 2);
  assert.equal(inventory.candidates[0]?.doc.docDescription, "有価証券報告書");
  assert.equal(inventory.candidates[1]?.reviewPriority, "high");
  assert.ok(inventory.candidates[1]?.reviewReasons.includes("parent_document_link"));
  assert.ok(inventory.candidates[1]?.reviewReasons.includes("correction_like_text"));
  assert.equal(inventory.lineage.hasBlockingIssues, false);
  assert.equal(
    inventory.lineage.nodes.find(node => node.docID === correction.docID)?.chainRootDocID,
    initial.docID,
  );
}

async function testAuthenticatedRangeScan(): Promise<void> {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const date = url.searchParams.get("date") ?? "";
    calls.push(date);
    const results = date === "2026-08-03" ? [doc()] : [];
    return new Response(JSON.stringify({
      metadata: { message: null, resultset: { count: results.length } },
      results,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const progress: string[] = [];
  const inventory = await scanSanrioEdinetRange("2026-08-01", "2026-08-04", {
    apiKey: "local-test-key",
    fetchImpl,
    sleep: async () => {},
    interRequestDelayMs: 1,
    now: () => new Date("2026-08-06T06:30:00.000Z"),
    onProgress: item => progress.push(`${item.date}:${item.status}:${item.matched}`),
  });

  assert.deepEqual(calls, ["2026-08-03", "2026-08-04"]);
  assert.deepEqual(progress, ["2026-08-03:ok:1", "2026-08-04:ok:0"]);
  assert.equal(inventory.scannedBusinessDays, 2);
  assert.equal(inventory.candidates.length, 1);
  assert.equal(inventory.generatedAt, "2026-08-06T06:30:00.000Z");
}

async function main(): Promise<void> {
  testBusinessDateEnumeration();
  testSanrioIdentityBoundary();
  testOfficialDocumentTypePlan();
  testInventoryAndLineage();
  await testAuthenticatedRangeScan();
  console.log("edinet-sanrio-pilot.test.ts passed");
}

await main();
