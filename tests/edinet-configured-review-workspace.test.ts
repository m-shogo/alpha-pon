import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import {
  buildConfiguredEdinetAcquisitionManifest,
  buildConfiguredEdinetAcquisitionPlan,
  type ConfiguredEdinetAcquisitionSuccess,
} from "../src/fetcher/edinet-configured-acquisition.js";
import { buildConfiguredEdinetInventory } from "../src/fetcher/edinet-configured-pilot.js";
import { buildConfiguredEdinetReviewPlan } from "../src/research/edinet-configured-review-plan.js";
import {
  buildConfiguredEdinetReviewWorkspace,
  renderConfiguredEdinetReviewWorkspace,
  type ConfiguredEdinetVerifiedFile,
} from "../src/research/edinet-configured-review-workspace.js";
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

function rehash(record: JsonObject, field: string): void {
  const { [field]: _ignored, ...withoutHash } = record;
  record[field] = digest(withoutHash);
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
  const succeeded: ConfiguredEdinetAcquisitionSuccess[] = acquisitionPlan.tasks.map((task, index) => ({
    task,
    binaryFile: `${task.docID}.type-${task.documentType}.${index}.bin`,
    metadataFile: `${task.docID}.type-${task.documentType}.${index}.metadata.json`,
    sha256: `${index + 1}`.repeat(64).slice(0, 64),
    byteLength: 100 + index,
    retrievedAt: `2026-08-06T12:4${index}:00.000Z`,
  }));
  const manifest = buildConfiguredEdinetAcquisitionManifest({
    plan: acquisitionPlan,
    generatedAt: "2026-08-06T13:00:00.000Z",
    outputDirectory: "synthetic-co-acquisition.fixture",
    succeeded,
    failed: [],
  });
  const verifiedFiles: ConfiguredEdinetVerifiedFile[] = succeeded.map((item, index) => ({
    binaryFile: item.binaryFile,
    metadataFile: item.metadataFile,
    binarySha256: item.sha256,
    binaryByteLength: item.byteLength,
    metadataSha256: `${index + 5}`.repeat(64).slice(0, 64),
    metadataByteLength: 500 + index,
  }));
  return { registry, reviewPlan, acquisitionPlan, manifest, verifiedFiles };
}

function buildWorkspace() {
  const setupValue = setup();
  const workspace = buildConfiguredEdinetReviewWorkspace({
    registry: registryFixture(),
    reviewPlan: setupValue.reviewPlan,
    acquisitionPlan: setupValue.acquisitionPlan,
    acquisitionManifest: setupValue.manifest,
    verifiedFiles: setupValue.verifiedFiles,
    sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    sourceAcquisitionPlanFile: "acquisition-plan.json",
    acquisitionManifestFile: "acquisition-manifest.json",
    generatedAt: "2026-08-06T13:10:00.000Z",
  });
  return { ...setupValue, workspace };
}

{
  const { workspace } = buildWorkspace();
  assert.equal(workspace.schemaVersion, 2);
  assert.equal(workspace.issuer.issuerKey, "synthetic-co");
  assert.equal(workspace.issuer.name, "合成テスト株式会社");
  assert.equal(workspace.acquisitionComplete, true);
  assert.equal(workspace.fileIntegrityVerified, true);
  assert.equal(workspace.documentCount, 2);
  assert.equal(workspace.groupCount, 1);
  assert.equal(workspace.acquisitionCount, 4);
  assert.equal(workspace.structuredDocumentCount, 2);
  assert.equal(workspace.officialPdfCount, 2);
  assert.equal(workspace.reviewStatus, "pending_human_review");
  assert.equal(workspace.foundationPreviewEligible, false);
  assert.equal(workspace.appendAuthorized, false);
  assert.ok(workspace.groups[0]!.documents.every(document =>
    document.structuredDocumentVerified
    && document.officialPdfVerified
    && document.acquisitions.map(item => item.documentType).join(",") === "1,2",
  ));
  assert.ok(workspace.groups[0]!.documents[1]!.blockers.includes("revision_relation_confirmation_required"));
  assert.match(workspace.workspaceHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetReviewWorkspace(workspace);
  assert.match(markdown, /configured review workspace v2/);
  assert.match(markdown, /independent from the Sanrio-specific v1 schema/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  console.log("edinet-configured-review-workspace: synthetic v2 workspace and non-appendable boundary OK");
}

{
  const setupValue = setup();
  const missing = setupValue.verifiedFiles.slice(0, -1);
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: setupValue.manifest,
      verifiedFiles: missing,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /does not cover every acquired binary/,
  );
  console.log("edinet-configured-review-workspace: missing local file verification blocked OK");
}

{
  const setupValue = setup();
  const changed = structuredClone(setupValue.verifiedFiles);
  changed[0]!.binarySha256 = "f".repeat(64);
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: setupValue.manifest,
      verifiedFiles: changed,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /binary integrity mismatch/,
  );
  console.log("edinet-configured-review-workspace: binary hash mismatch blocked OK");
}

{
  const setupValue = setup();
  const tampered = structuredClone(setupValue.manifest) as unknown as JsonObject;
  tampered.complete = false;
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: tampered,
      verifiedFiles: setupValue.verifiedFiles,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /safety\/completeness boundary is invalid/,
  );
  console.log("edinet-configured-review-workspace: incomplete/attempt manifest blocked OK");
}

{
  const setupValue = setup();
  const tampered = structuredClone(setupValue.acquisitionPlan) as unknown as JsonObject;
  tampered.taskCount = 99;
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: tampered,
      acquisitionManifest: setupValue.manifest,
      verifiedFiles: setupValue.verifiedFiles,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /acquisitionPlan\.planHash mismatch/,
  );
  console.log("edinet-configured-review-workspace: acquisition plan tampering blocked OK");
}

{
  const setupValue = setup();
  const registryDrift = registryFixture();
  registryDrift.issuers[0]!.aliases = ["別名"];
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryDrift,
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: setupValue.manifest,
      verifiedFiles: setupValue.verifiedFiles,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /registryHash does not match/,
  );
  console.log("edinet-configured-review-workspace: registry drift blocked OK");
}

{
  const setupValue = setup();
  const manifest = structuredClone(setupValue.manifest) as unknown as JsonObject;
  const successes = manifest.succeeded as JsonObject[];
  successes.pop();
  manifest.totalTasks = successes.length;
  rehash(manifest, "manifestHash");
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: manifest,
      verifiedFiles: setupValue.verifiedFiles.slice(0, -1),
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /does not have exactly type 1 and type 2 acquisitions|document coverage mismatch/,
  );
  console.log("edinet-configured-review-workspace: validly rehashed missing acquisition still blocked OK");
}

{
  const setupValue = setup();
  const reviewPlan = structuredClone(setupValue.reviewPlan) as unknown as JsonObject;
  const groups = reviewPlan.groups as JsonObject[];
  const documents = groups[0]!.documents as JsonObject[];
  documents[0]!.submitDateTime = "2026-06-20T15:00:00";
  rehash(reviewPlan, "reviewPlanHash");
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: setupValue.manifest,
      verifiedFiles: setupValue.verifiedFiles,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /explicit timezone/,
  );
  console.log("edinet-configured-review-workspace: timezone-less submitDateTime blocked OK");
}

{
  const setupValue = setup();
  const manifest = structuredClone(setupValue.manifest) as unknown as JsonObject;
  const successes = manifest.succeeded as JsonObject[];
  successes[0]!.retrievedAt = "2026-02-30T12:40:00Z";
  rehash(manifest, "manifestHash");
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: manifest,
      verifiedFiles: setupValue.verifiedFiles,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
    }),
    /valid Gregorian ISO-8601 timestamp/,
  );
  console.log("edinet-configured-review-workspace: impossible retrievedAt blocked OK");
}

{
  const setupValue = setup();
  const workspace = buildConfiguredEdinetReviewWorkspace({
    registry: registryFixture(),
    reviewPlan: setupValue.reviewPlan,
    acquisitionPlan: setupValue.acquisitionPlan,
    acquisitionManifest: setupValue.manifest,
    verifiedFiles: setupValue.verifiedFiles,
    sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    sourceAcquisitionPlanFile: "acquisition-plan.json",
    acquisitionManifestFile: "acquisition-manifest.json",
    generatedAt: "2026-08-06T22:10:00+09:00",
  });
  assert.equal(workspace.generatedAt, "2026-08-06T22:10:00+09:00");
  assert.throws(
    () => buildConfiguredEdinetReviewWorkspace({
      registry: registryFixture(),
      reviewPlan: setupValue.reviewPlan,
      acquisitionPlan: setupValue.acquisitionPlan,
      acquisitionManifest: setupValue.manifest,
      verifiedFiles: setupValue.verifiedFiles,
      sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
      sourceAcquisitionPlanFile: "acquisition-plan.json",
      acquisitionManifestFile: "acquisition-manifest.json",
      generatedAt: "2026-08-06T13:10:00",
    }),
    /explicit timezone/,
  );
  console.log("edinet-configured-review-workspace: strict generatedAt with valid offset preserved OK");
}

console.log("edinet-configured-review-workspace.test.ts passed");
