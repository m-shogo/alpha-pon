import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import {
  buildConfiguredEdinetAcquisitionAttempt,
  buildConfiguredEdinetAcquisitionManifest,
  buildConfiguredEdinetAcquisitionPlan,
  type ConfiguredEdinetAcquisitionPlan,
  type ConfiguredEdinetAcquisitionSuccess,
} from "../src/fetcher/edinet-configured-acquisition.js";
import { buildConfiguredEdinetInventory } from "../src/fetcher/edinet-configured-pilot.js";
import { buildConfiguredEdinetReviewPlan } from "../src/research/edinet-configured-review-plan.js";
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
        aliases: ["合成テスト"],
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

function setup() {
  const registry = buildEdinetIssuerRegistry(registryFixture());
  const boundary = resolveEdinetIssuerBoundary(registry, "synthetic-co");
  const root = doc();
  const correction = doc({
    seqNumber: 2,
    docID: "S900CORR",
    parentDocID: root.docID,
    formCode: "030001",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
    currentReportReason: "記載事項の訂正",
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
  const reviewPlan = buildConfiguredEdinetReviewPlan({
    inventory,
    registry: registryFixture(),
    sourceInventoryFile: "synthetic-co-edinet-inventory.fixture.json",
    generatedAt: "2026-08-06T12:20:00.000Z",
  });
  const acquisitionPlan = buildConfiguredEdinetAcquisitionPlan({
    reviewPlan,
    registry: registryFixture(),
    sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    generatedAt: "2026-08-06T12:30:00.000Z",
  });
  return { registry, inventory, reviewPlan, acquisitionPlan };
}

function rehashReviewPlan(record: JsonObject): void {
  const { reviewPlanHash: _ignored, ...withoutHash } = record;
  record.reviewPlanHash = digest(withoutHash);
}

function successFor(plan: ConfiguredEdinetAcquisitionPlan): ConfiguredEdinetAcquisitionSuccess[] {
  return plan.tasks.map((task, index) => ({
    task,
    binaryFile: `${task.docID}.type-${task.documentType}.${index}.bin`,
    metadataFile: `${task.docID}.type-${task.documentType}.${index}.metadata.json`,
    sha256: `${index + 1}`.repeat(64).slice(0, 64),
    byteLength: 100 + index,
    retrievedAt: `2026-08-06T12:4${index}:00.000Z`,
  }));
}

{
  const { acquisitionPlan } = setup();
  assert.equal(acquisitionPlan.issuer.issuerKey, "synthetic-co");
  assert.equal(acquisitionPlan.taskCount, 4);
  assert.deepEqual(
    acquisitionPlan.tasks.map(task => `${task.docID}:${task.documentType}`),
    ["S900CORR:1", "S900CORR:2", "S900ROOT:1", "S900ROOT:2"],
  );
  assert.ok(acquisitionPlan.tasks.every(task => task.parentOutsidePlan === false));
  assert.ok(acquisitionPlan.tasks.every(task => task.documentType === "1" || task.documentType === "2"));
  assert.equal(acquisitionPlan.executionPolicy, "explicit_local_command_only");
  assert.equal(acquisitionPlan.automaticAcquisitionAuthorized, false);
  assert.equal(acquisitionPlan.appendAuthorized, false);
  assert.match(acquisitionPlan.planHash, /^[a-f0-9]{64}$/);
  console.log("edinet-configured-acquisition: deterministic type 1/2 explicit-local plan OK");
}

{
  const { acquisitionPlan } = setup();
  const succeeded = successFor(acquisitionPlan);
  const manifest = buildConfiguredEdinetAcquisitionManifest({
    plan: acquisitionPlan,
    generatedAt: "2026-08-06T13:00:00.000Z",
    outputDirectory: "synthetic-co-acquisition.fixture",
    succeeded,
    failed: [],
  });
  assert.equal(manifest.complete, true);
  assert.equal(manifest.canonicalManifestWritten, true);
  assert.equal(manifest.reviewStatus, "pending_human_review");
  assert.equal(manifest.executionMode, "explicit_local_command");
  assert.equal(manifest.storageBoundary, "local_only");
  assert.equal(manifest.appendAuthorized, false);
  assert.equal(manifest.succeeded.length, acquisitionPlan.taskCount);
  assert.match(manifest.manifestHash, /^[a-f0-9]{64}$/);
  console.log("edinet-configured-acquisition: all-success canonical manifest remains review-pending OK");
}

{
  const { acquisitionPlan } = setup();
  const succeeded = successFor(acquisitionPlan);
  const failedTask = succeeded.pop()!.task;
  const attempt = buildConfiguredEdinetAcquisitionAttempt({
    plan: acquisitionPlan,
    generatedAt: "2026-08-06T13:00:00.000Z",
    outputDirectory: "synthetic-co-acquisition.fixture",
    succeeded,
    failed: [{ task: failedTask, code: "network_error" }],
  });
  assert.equal(attempt.complete, false);
  assert.equal(attempt.canonicalManifestWritten, false);
  assert.equal(attempt.failed.length, 1);
  assert.equal(attempt.appendAuthorized, false);
  assert.match(attempt.attemptHash, /^[a-f0-9]{64}$/);
  assert.throws(
    () => buildConfiguredEdinetAcquisitionManifest({
      plan: acquisitionPlan,
      generatedAt: "2026-08-06T13:00:00.000Z",
      outputDirectory: "synthetic-co-acquisition.fixture",
      succeeded,
      failed: [{ task: failedTask, code: "network_error" }],
    }),
    /cannot include failures/,
  );
  console.log("edinet-configured-acquisition: partial failure cannot create canonical manifest OK");
}

{
  const { reviewPlan } = setup();
  const missingPdf = structuredClone(reviewPlan) as unknown as JsonObject;
  const groups = missingPdf.groups as JsonObject[];
  const firstDocument = (groups[0]!.documents as JsonObject[])[0]!;
  firstDocument.plannedDocumentTypes = ["1"];
  firstDocument.officialPdfPlanned = false;
  rehashReviewPlan(missingPdf);
  assert.throws(
    () => buildConfiguredEdinetAcquisitionPlan({
      reviewPlan: missingPdf,
      registry: registryFixture(),
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    }),
    /requires both document types 1 and 2/,
  );
  console.log("edinet-configured-acquisition: missing official PDF blocks before network OK");
}

{
  const { reviewPlan } = setup();
  const externalParent = structuredClone(reviewPlan) as unknown as JsonObject;
  const groups = externalParent.groups as JsonObject[];
  const firstDocument = (groups[0]!.documents as JsonObject[])[0]!;
  firstDocument.parentDocID = "S900OUTSIDE";
  rehashReviewPlan(externalParent);
  assert.throws(
    () => buildConfiguredEdinetAcquisitionPlan({
      reviewPlan: externalParent,
      registry: registryFixture(),
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    }),
    /unresolved external parent/,
  );
  console.log("edinet-configured-acquisition: external parent is never invented automatically OK");
}

{
  const { reviewPlan } = setup();
  const tampered = structuredClone(reviewPlan) as unknown as JsonObject;
  tampered.candidateCount = 999;
  assert.throws(
    () => buildConfiguredEdinetAcquisitionPlan({
      reviewPlan: tampered,
      registry: registryFixture(),
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    }),
    /reviewPlan\.reviewPlanHash mismatch/,
  );
  console.log("edinet-configured-acquisition: review plan tampering blocked OK");
}

{
  const { reviewPlan } = setup();
  const registryDrift = registryFixture();
  registryDrift.issuers[0]!.aliases = ["別名"];
  assert.throws(
    () => buildConfiguredEdinetAcquisitionPlan({
      reviewPlan,
      registry: registryDrift,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    }),
    /registryHash does not match/,
  );
  console.log("edinet-configured-acquisition: registry drift blocked OK");
}

{
  const { acquisitionPlan } = setup();
  const succeeded = successFor(acquisitionPlan);
  const modifiedPlan = structuredClone(acquisitionPlan);
  modifiedPlan.tasks[0]!.reason = "configured_official_pdf_review";
  assert.throws(
    () => buildConfiguredEdinetAcquisitionManifest({
      plan: modifiedPlan,
      generatedAt: "2026-08-06T13:00:00.000Z",
      outputDirectory: "synthetic-co-acquisition.fixture",
      succeeded,
      failed: [],
    }),
    /acquisition plan hash mismatch/,
  );
  console.log("edinet-configured-acquisition: acquisition plan tampering blocked OK");
}

{
  const { reviewPlan } = setup();
  assert.throws(
    () => buildConfiguredEdinetAcquisitionPlan({
      reviewPlan,
      registry: registryFixture(),
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      generatedAt: "2026-08-06T12:30:00",
    }),
    /explicit timezone/,
  );
  assert.throws(
    () => buildConfiguredEdinetAcquisitionPlan({
      reviewPlan,
      registry: registryFixture(),
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      generatedAt: "2026-02-30T12:30:00Z",
    }),
    /valid Gregorian/,
  );
  console.log("edinet-configured-acquisition: generatedAt requires strict explicit-timezone instant OK");
}

{
  const { acquisitionPlan } = setup();
  const succeeded = successFor(acquisitionPlan);
  succeeded[0]!.retrievedAt = "2026-08-06T12:40:00";
  assert.throws(
    () => buildConfiguredEdinetAcquisitionManifest({
      plan: acquisitionPlan,
      generatedAt: "2026-08-06T13:00:00.000Z",
      outputDirectory: "synthetic-co-acquisition.fixture",
      succeeded,
      failed: [],
    }),
    /explicit timezone/,
  );
  succeeded[0]!.retrievedAt = "2026-02-30T12:40:00Z";
  assert.throws(
    () => buildConfiguredEdinetAcquisitionManifest({
      plan: acquisitionPlan,
      generatedAt: "2026-08-06T13:00:00.000Z",
      outputDirectory: "synthetic-co-acquisition.fixture",
      succeeded,
      failed: [],
    }),
    /valid Gregorian/,
  );
  console.log("edinet-configured-acquisition: retrievedAt requires strict explicit-timezone instant OK");
}

console.log("edinet-configured-acquisition.test.ts passed");