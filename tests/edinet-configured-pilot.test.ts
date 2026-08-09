import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import {
  buildConfiguredEdinetInventory,
  enumerateConfiguredEdinetBusinessDates,
  isConfiguredIssuerPrimaryDisclosure,
  scanConfiguredEdinetRange,
} from "../src/fetcher/edinet-configured-pilot.js";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
  type EdinetIssuerBoundary,
} from "../src/research/edinet-issuer-boundary.js";

function registry() {
  return buildEdinetIssuerRegistry(JSON.parse(
    readFileSync("config/research/edinet-issuer-registry.v1.json", "utf-8"),
  ) as unknown);
}

function sanrioBoundary(): EdinetIssuerBoundary {
  return resolveEdinetIssuerBoundary(registry(), "sanrio");
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
    attachDocFlag: "1",
    englishDocFlag: "1",
    csvFlag: "1",
    legalStatus: "1",
    ...overrides,
  };
}

{
  assert.deepEqual(
    enumerateConfiguredEdinetBusinessDates("2026-08-01", "2026-08-04"),
    ["2026-08-03", "2026-08-04"],
  );
  assert.throws(
    () => enumerateConfiguredEdinetBusinessDates("2026-02-30", "2026-03-01"),
    /valid calendar date/,
  );
  console.log("edinet-configured-pilot: locale-independent business date range OK");
}

{
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  assert.throws(
    () => buildConfiguredEdinetInventory({
      boundary,
      registryHash: registryValue.registryHash,
      from: "2026-08-03",
      to: "2026-08-04",
      generatedAt: "2026-08-06T11:00:00.000Z",
      scannedBusinessDays: 0,
      failedDates: [],
      docs: [],
    }),
    /scannedBusinessDays must match configured range business days: expected 2/,
  );
  console.log("edinet-configured-pilot: complete inventory cannot understate configured scan coverage OK");
}

{
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  const base = {
    boundary,
    registryHash: registryValue.registryHash,
    from: "2026-08-03",
    to: "2026-08-04",
    generatedAt: "2026-08-06T11:00:00.000Z",
    scannedBusinessDays: 2,
    docs: [] as EdinetDoc[],
  };
  assert.throws(
    () => buildConfiguredEdinetInventory({
      ...base,
      failedDates: [{ date: "2026-08-05", code: "http_500" }],
    }),
    /must be a business date inside the configured range/,
  );
  assert.throws(
    () => buildConfiguredEdinetInventory({
      ...base,
      failedDates: [
        { date: "2026-08-03", code: "http_500" },
        { date: "2026-08-03", code: "network_error" },
      ],
    }),
    /failedDates contains duplicate date: 2026-08-03/,
  );
  assert.throws(
    () => buildConfiguredEdinetInventory({
      ...base,
      failedDates: [{ date: "2026-08-03", code: "   " }],
    }),
    /failedDates\[0\]\.code must be non-empty/,
  );
  console.log("edinet-configured-pilot: failed-date provenance must match configured scan dates OK");
}

{
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  assert.throws(
    () => buildConfiguredEdinetInventory({
      boundary,
      registryHash: registryValue.registryHash,
      from: "2026-08-03",
      to: "2026-08-03",
      generatedAt: "2026-08-06T11:00:00.000Z",
      scannedBusinessDays: 1,
      failedDates: [],
      docs: [doc({ docID: "   " })],
    }),
    /configured EDINET document docID must be non-empty/,
  );
  console.log("edinet-configured-pilot: matched records without docID fail closed OK");
}

{
  const boundary = sanrioBoundary();
  assert.equal(isConfiguredIssuerPrimaryDisclosure(doc(), boundary), true);
  assert.equal(isConfiguredIssuerPrimaryDisclosure(doc({ edinetCode: "", secCode: "81360" }), boundary), true);
  assert.equal(isConfiguredIssuerPrimaryDisclosure(doc({ edinetCode: "E02655", secCode: "99990" }), boundary), false);
  assert.equal(isConfiguredIssuerPrimaryDisclosure(doc({ edinetCode: "E99999", secCode: "81360" }), boundary), false);
  assert.equal(isConfiguredIssuerPrimaryDisclosure(doc({
    edinetCode: "E99999",
    secCode: "99990",
    issuerEdinetCode: "E02655",
    filerName: "サンリオ株式の大量保有者",
  }), boundary), false);
  console.log("edinet-configured-pilot: strict primary issuer boundary blocks mixed and third-party identities OK");
}

{
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  const initial = doc();
  const stale = doc({
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
  const outsider = doc({ docID: "S100OTHER", edinetCode: "E99999", secCode: "99990" });

  const inventory = buildConfiguredEdinetInventory({
    boundary,
    registryHash: registryValue.registryHash,
    from: "2026-01-01",
    to: "2026-08-06",
    generatedAt: "2026-08-06T11:00:00.000Z",
    scannedBusinessDays: 156,
    failedDates: [],
    docs: [stale, correction, outsider, initial],
  });

  assert.equal(inventory.issuer.issuerKey, "sanrio");
  assert.equal(inventory.issuer.boundaryHash, boundary.boundaryHash);
  assert.equal(inventory.registryHash, registryValue.registryHash);
  assert.equal(inventory.candidates.length, 2);
  assert.equal(inventory.candidates[0]!.doc.docDescription, "有価証券報告書");
  assert.deepEqual(
    inventory.candidates[0]!.documentTypePlan.map(item => item.type),
    ["1", "2"],
    "issuer allowlist must exclude attachment/English/CSV downloads",
  );
  assert.ok(inventory.candidates[1]!.reviewReasons.includes("parent_document_link"));
  assert.equal(inventory.factPromotionPolicy, "human_review_required");
  assert.equal(inventory.requireOfficialPdfVisualReview, true);
  assert.equal(inventory.appendAuthorized, false);
  assert.match(inventory.inventoryHash, /^[a-f0-9]{64}$/);
  console.log("edinet-configured-pilot: deterministic inventory, lineage, and download allowlist OK");
}

{
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const date = url.searchParams.get("date") ?? "";
    calls.push(date);
    const results = date === "2026-08-03"
      ? [doc(), doc({ docID: "S100OTHER", edinetCode: "E99999", secCode: "99990" })]
      : [];
    return new Response(JSON.stringify({
      metadata: { message: null, resultset: { count: results.length } },
      results,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const progress: string[] = [];
  const inventory = await scanConfiguredEdinetRange("2026-08-01", "2026-08-04", {
    boundary,
    registryHash: registryValue.registryHash,
    apiKey: "local-test-key",
    fetchImpl,
    sleep: async () => {},
    interRequestDelayMs: 1,
    now: () => new Date("2026-08-06T11:00:00.000Z"),
    onProgress: item => progress.push(`${item.date}:${item.status}:${item.matched}`),
  });
  assert.deepEqual(calls, ["2026-08-03", "2026-08-04"]);
  assert.deepEqual(progress, ["2026-08-03:ok:1", "2026-08-04:ok:0"]);
  assert.equal(inventory.candidates.length, 1);
  assert.equal(inventory.completeness, "complete");
  console.log("edinet-configured-pilot: authenticated inventory-only range scan OK");
}

{
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  const inactive = { ...boundary, active: false };
  assert.throws(
    () => buildConfiguredEdinetInventory({
      boundary: inactive,
      registryHash: registryValue.registryHash,
      from: "2026-01-01",
      to: "2026-01-01",
      generatedAt: "2026-08-06T11:00:00.000Z",
      scannedBusinessDays: 1,
      failedDates: [],
      docs: [],
    }),
    /issuer is inactive/,
  );
  const noStructured = { ...boundary, allowedDocumentTypes: ["2"] };
  assert.throws(
    () => buildConfiguredEdinetInventory({
      boundary: noStructured,
      registryHash: registryValue.registryHash,
      from: "2026-01-01",
      to: "2026-01-01",
      generatedAt: "2026-08-06T11:00:00.000Z",
      scannedBusinessDays: 1,
      failedDates: [],
      docs: [],
    }),
    /requires document type 1/,
  );
  console.log("edinet-configured-pilot: inactive and non-reviewable issuer boundaries blocked OK");
}

console.log("edinet-configured-pilot.test.ts passed");