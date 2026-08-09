import assert from "node:assert/strict";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import { buildEdinetDocumentLineage } from "../src/fetcher/edinet-lineage.js";

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

function testRejectsPaddedParentDocId(): void {
  const root = doc();
  const child = doc({
    seqNumber: 2,
    docID: "S100CHILD",
    parentDocID: " S100ROOT ",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
  });

  const result = buildEdinetDocumentLineage([root, child]);

  assert.equal(result.hasBlockingIssues, true);
  assert.ok(result.issues.some(value =>
    value.code === "invalid_parent_doc_id" && value.target === "S100CHILD"
  ));
  const childNode = result.nodes.find(value => value.docID === "S100CHILD");
  assert.equal(childNode?.parentDocID, null);
  assert.equal(childNode?.chainRootDocID, "S100CHILD");
  assert.equal(childNode?.relation, "root");
}

function testAllowsEmptyAndCanonicalParentDocIds(): void {
  const root = doc();
  const child = doc({
    seqNumber: 2,
    docID: "S100CHILD",
    parentDocID: "S100ROOT",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
  });

  const result = buildEdinetDocumentLineage([root, child]);

  assert.equal(result.hasBlockingIssues, false);
  assert.deepEqual(result.issues, []);
  const childNode = result.nodes.find(value => value.docID === "S100CHILD");
  assert.equal(childNode?.parentDocID, "S100ROOT");
  assert.equal(childNode?.chainRootDocID, "S100ROOT");
  assert.equal(childNode?.relation, "parent_linked");
}

function main(): void {
  testRejectsPaddedParentDocId();
  testAllowsEmptyAndCanonicalParentDocIds();
  console.log("edinet-parent-doc-id-canonicality.test.ts passed");
}

main();
