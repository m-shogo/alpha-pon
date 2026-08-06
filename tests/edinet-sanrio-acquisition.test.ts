import assert from "node:assert/strict";
import { buildSanrioEdinetAcquisitionPlan } from "../src/fetcher/edinet-sanrio-acquisition.js";

function candidate(input: {
  docID: string;
  description: string;
  parentDocID?: string | null;
  types: Array<"1" | "2" | "3" | "4" | "5">;
}) {
  return {
    doc: {
      docID: input.docID,
      parentDocID: input.parentDocID ?? "",
      docDescription: input.description,
    },
    documentTypePlan: input.types.map(type => ({
      type,
      format: type === "2" ? "pdf" : "zip",
      label: `type_${type}`,
      reason: "synthetic",
    })),
  };
}

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    range: { from: "2026-01-01", to: "2026-08-06" },
    completeness: "complete",
    failedDates: [],
    candidates: [
      candidate({
        docID: "S100YMT4",
        description: "訂正有価証券報告書－第64期",
        parentDocID: "S100TUQ8",
        types: ["1", "2", "5"],
      }),
      candidate({
        docID: "S100YN6Q",
        description: "確認書",
        parentDocID: "S100YMT4",
        types: ["1", "2"],
      }),
      candidate({
        docID: "S100YNR0",
        description: "有価証券報告書－第66期",
        types: ["1", "2", "3", "5"],
      }),
      candidate({
        docID: "S100YNON",
        description: "内部統制報告書－第66期",
        types: ["1", "2", "5"],
      }),
      candidate({
        docID: "S100YO9P",
        description: "臨時報告書",
        types: ["1", "2", "5"],
      }),
    ],
    appendAuthorized: false,
    ...overrides,
  };
}

function testSelectionAndExternalParent(): void {
  const plan = buildSanrioEdinetAcquisitionPlan(inventory());
  const keys = plan.tasks.map(task => `${task.docID}:${task.documentType}:${task.reason}`);

  assert.deepEqual(keys, [
    "S100TUQ8:1:external_parent_structured",
    "S100TUQ8:2:external_parent_human_review",
    "S100YMT4:1:core_filing_structured",
    "S100YMT4:2:core_filing_human_review",
    "S100YN6Q:2:supporting_document_human_review",
    "S100YNON:2:supporting_document_human_review",
    "S100YNR0:1:core_filing_structured",
    "S100YNR0:2:core_filing_human_review",
    "S100YO9P:1:core_filing_structured",
    "S100YO9P:2:core_filing_human_review",
  ]);

  const parentTasks = plan.tasks.filter(task => task.docID === "S100TUQ8");
  assert.ok(parentTasks.every(task => task.parentOutsideInventory));
  assert.ok(parentTasks.every(task => task.sourceDocID === "S100YMT4"));
  assert.equal(plan.appendAuthorized, false);
}

function testUnknownDocumentFallback(): void {
  const value = inventory({
    candidates: [candidate({
      docID: "S100MISC",
      description: "その他の提出書類",
      types: ["1", "2"],
    })],
  });
  const plan = buildSanrioEdinetAcquisitionPlan(value);
  assert.deepEqual(
    plan.tasks.map(task => [task.docID, task.documentType, task.reason]),
    [["S100MISC", "2", "fallback_human_review"]],
  );
}

function testFailClosedInventoryValidation(): void {
  assert.throws(
    () => buildSanrioEdinetAcquisitionPlan(inventory({ completeness: "partial" })),
    /complete/,
  );
  assert.throws(
    () => buildSanrioEdinetAcquisitionPlan(inventory({ failedDates: [{ date: "2026-01-01" }] })),
    /failedDates/,
  );
  assert.throws(
    () => buildSanrioEdinetAcquisitionPlan(inventory({ appendAuthorized: true })),
    /appendAuthorized/,
  );
  assert.throws(
    () => buildSanrioEdinetAcquisitionPlan(inventory({
      issuer: { name: "他社", edinetCode: "E99999", secCode: "99990" },
    })),
    /not Sanrio/,
  );
  assert.throws(
    () => buildSanrioEdinetAcquisitionPlan(inventory({ candidates: [] })),
    /no Sanrio candidates/,
  );
}

function main(): void {
  testSelectionAndExternalParent();
  testUnknownDocumentFallback();
  testFailClosedInventoryValidation();
  console.log("edinet-sanrio-acquisition.test.ts passed");
}

main();
