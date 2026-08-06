import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import { buildConfiguredEdinetInventory } from "../src/fetcher/edinet-configured-pilot.js";
import {
  buildConfiguredEdinetReviewPlan,
  renderConfiguredEdinetReviewPlan,
} from "../src/research/edinet-configured-review-plan.js";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
} from "../src/research/edinet-issuer-boundary.js";

type JsonObject = Record<string, unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function registryFixture() {
  return {
    schemaVersion: 1,
    registryId: "edinet-issuer-boundary-v1",
    generatedAt: "2026-08-06T12:00:00.000Z",
    issuerCount: 1,
    issuers: [
      {
        issuerKey: "synthetic-co",
        name: "合成テスト株式会社",
        edinetCode: "E90000",
        secCode: "90000",
        aliases: ["合成テスト", "SYNTHETIC TEST CO., LTD."],
        active: true,
        allowedDocumentTypes: ["1", "2"],
        storagePolicy: "local_only",
        factPromotionPolicy: "human_review_required",
        requireOfficialPdfVisualReview: true,
      },
    ],
  };
}

function doc(overrides: Partial<EdinetDoc> = {}): EdinetDoc {
  return {
    seqNumber: 1,
    docID: "S900ROOT",
    edinetCode: "E90000",
    secCode: "90000",
    JCN: "9000000000000",
    filerName: "合成テスト株式会社",
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
    csvFlag: "0",
    legalStatus: "1",
    ...overrides,
  };
}

function setup(input: { pdfFlag?: "0" | "1" } = {}) {
  const registry = buildEdinetIssuerRegistry(registryFixture());
  const boundary = resolveEdinetIssuerBoundary(registry, "synthetic-co");
  const root = doc({ pdfFlag: input.pdfFlag ?? "1" });
  const correction = doc({
    seqNumber: 2,
    docID: "S900CORR",
    parentDocID: root.docID,
    formCode: "030001",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
    currentReportReason: "記載事項の訂正",
    pdfFlag: input.pdfFlag ?? "1",
  });
  const inventory = buildConfiguredEdinetInventory({
    boundary,
    registryHash: registry.registryHash,
    from: "2026-01-01",
    to: "2026-08-06",
    generatedAt: "2026-08-06T12:10:00.000Z",
    scannedBusinessDays: 156,
    failedDates: [],
    docs: [root, correction],
  });
  return { registry, inventory };
}

function rehashInventory(record: JsonObject): void {
  const { inventoryHash: _ignored, ...withoutHash } = record;
  record.inventoryHash = digest(withoutHash);
}

{
  const { registry, inventory } = setup();
  const plan = buildConfiguredEdinetReviewPlan({
    inventory,
    registry: registryFixture(),
    sourceInventoryFile: "synthetic-co-edinet-inventory.fixture.json",
    generatedAt: "2026-08-06T12:20:00.000Z",
  });
  assert.equal(plan.issuer.issuerKey, "synthetic-co");
  assert.equal(plan.issuer.name, "合成テスト株式会社");
  assert.equal(plan.issuer.edinetCode, "E90000");
  assert.equal(plan.registryHash, registry.registryHash);
  assert.equal(plan.candidateCount, 2);
  assert.equal(plan.groupCount, 1);
  assert.equal(plan.plannedAcquisitionCount, 4);
  assert.equal(plan.structuredDocumentPlanCount, 2);
  assert.equal(plan.officialPdfPlanCount, 2);
  assert.equal(plan.reviewStatus, "inventory_review_planned");
  assert.equal(plan.acquisitionAuthorized, false);
  assert.equal(plan.appendAuthorized, false);
  assert.ok(plan.groups[0]!.documents[1]!.blockers.includes("revision_relation_confirmation_required"));
  assert.match(plan.reviewPlanHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetReviewPlan(plan);
  assert.match(markdown, /合成テスト株式会社 EDINET configured review plan/);
  assert.match(markdown, /does not download or append anything/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  console.log("edinet-configured-review-plan: synthetic issuer review plan has no Sanrio dependency OK");
}

{
  const { inventory } = setup({ pdfFlag: "0" });
  const plan = buildConfiguredEdinetReviewPlan({
    inventory,
    registry: registryFixture(),
    sourceInventoryFile: "synthetic-co-edinet-inventory.no-pdf.json",
  });
  assert.equal(plan.officialPdfPlanCount, 0);
  assert.ok(plan.groups.every(group => group.documents.every(document =>
    document.blockers.includes("official_pdf_type_2_not_planned"),
  )));
  assert.equal(plan.acquisitionAuthorized, false);
  console.log("edinet-configured-review-plan: missing official PDF remains an explicit blocker OK");
}

{
  const { inventory } = setup();
  const tampered = structuredClone(inventory) as unknown as JsonObject;
  const first = (tampered.candidates as JsonObject[])[0]!;
  const firstDoc = first.doc as JsonObject;
  firstDoc.docDescription = "tampered";
  assert.throws(
    () => buildConfiguredEdinetReviewPlan({
      inventory: tampered,
      registry: registryFixture(),
      sourceInventoryFile: "synthetic-co-edinet-inventory.fixture.json",
    }),
    /inventory\.inventoryHash mismatch/,
  );
  console.log("edinet-configured-review-plan: inventory tampering blocked OK");
}

{
  const { inventory } = setup();
  const crossed = structuredClone(inventory) as unknown as JsonObject;
  const first = (crossed.candidates as JsonObject[])[0]!;
  const firstDoc = first.doc as JsonObject;
  firstDoc.edinetCode = "E99999";
  rehashInventory(crossed);
  assert.throws(
    () => buildConfiguredEdinetReviewPlan({
      inventory: crossed,
      registry: registryFixture(),
      sourceInventoryFile: "synthetic-co-edinet-inventory.fixture.json",
    }),
    /crossed the configured issuer boundary/,
  );
  console.log("edinet-configured-review-plan: cross-issuer candidate blocked after valid rehash OK");
}

{
  const { inventory } = setup();
  const changedRegistry = registryFixture();
  changedRegistry.issuers[0]!.aliases = ["別名"];
  assert.throws(
    () => buildConfiguredEdinetReviewPlan({
      inventory,
      registry: changedRegistry,
      sourceInventoryFile: "synthetic-co-edinet-inventory.fixture.json",
    }),
    /inventory\.registryHash does not match configured registry/,
  );
  console.log("edinet-configured-review-plan: registry drift blocked OK");
}

{
  const { inventory } = setup();
  const blocked = structuredClone(inventory) as unknown as JsonObject;
  const lineage = blocked.lineage as JsonObject;
  lineage.hasBlockingIssues = true;
  rehashInventory(blocked);
  assert.throws(
    () => buildConfiguredEdinetReviewPlan({
      inventory: blocked,
      registry: registryFixture(),
      sourceInventoryFile: "synthetic-co-edinet-inventory.fixture.json",
    }),
    /lineage has blocking issues/,
  );
  console.log("edinet-configured-review-plan: blocking lineage rejected OK");
}

console.log("edinet-configured-review-plan.test.ts passed");
