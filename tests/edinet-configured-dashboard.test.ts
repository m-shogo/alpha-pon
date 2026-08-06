import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetDashboard,
  renderConfiguredEdinetDashboardHtml,
} from "../src/research/edinet-configured-dashboard.js";
import { buildEdinetIssuerRegistry } from "../src/research/edinet-issuer-boundary.js";

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
        name: "<script>合成テスト株式会社</script>",
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

function artifacts() {
  const registry = buildEdinetIssuerRegistry(registryFixture());
  const boundary = registry.issuers[0]!;
  const issuer = {
    issuerKey: boundary.issuerKey,
    name: boundary.name,
    edinetCode: boundary.edinetCode,
    secCode: boundary.secCode,
    boundaryHash: boundary.boundaryHash,
  };
  const inventoryBase = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: registry.registryHash,
    issuer,
    range: { from: "2026-01-01", to: "2026-08-06" },
    generatedAt: "2026-08-06T12:10:00.000Z",
    scannedBusinessDays: 156,
    completeness: "complete",
    failedDates: [],
    candidates: [],
    lineage: { nodes: [], issues: [], hasBlockingIssues: false },
    factPromotionPolicy: "human_review_required",
    requireOfficialPdfVisualReview: true,
    appendAuthorized: false,
  };
  const inventory = { ...inventoryBase, inventoryHash: digest(inventoryBase) };

  const reviewPlanBase = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: registry.registryHash,
    issuer,
    sourceInventoryFile: "synthetic-co-edinet-inventory.<img>.json",
    sourceInventoryHash: inventory.inventoryHash,
    generatedAt: "2026-08-06T12:20:00.000Z",
    inventoryRange: inventoryBase.range,
    candidateCount: 2,
    groupCount: 1,
    plannedAcquisitionCount: 4,
    structuredDocumentPlanCount: 2,
    officialPdfPlanCount: 2,
    reviewStatus: "inventory_review_planned",
    groups: [],
    globalBlockers: ["local_acquisition_not_executed"],
    acquisitionAuthorized: false,
    appendAuthorized: false,
  };
  const reviewPlan = { ...reviewPlanBase, reviewPlanHash: digest(reviewPlanBase) };

  const acquisitionPlanBase = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: registry.registryHash,
    issuer,
    sourceReviewPlanFile: "synthetic-co-edinet-configured-review-plan-v1.fixture.json",
    sourceReviewPlanHash: reviewPlan.reviewPlanHash,
    sourceInventoryFile: reviewPlan.sourceInventoryFile,
    sourceInventoryHash: inventory.inventoryHash,
    generatedAt: "2026-08-06T12:30:00.000Z",
    taskCount: 4,
    tasks: [],
    executionPolicy: "explicit_local_command_only",
    storageBoundary: "local_only",
    automaticAcquisitionAuthorized: false,
    appendAuthorized: false,
  };
  const acquisitionPlan = { ...acquisitionPlanBase, planHash: digest(acquisitionPlanBase) };

  const manifestBase = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: registry.registryHash,
    issuer,
    sourceReviewPlanFile: acquisitionPlan.sourceReviewPlanFile,
    sourceReviewPlanHash: reviewPlan.reviewPlanHash,
    acquisitionPlanHash: acquisitionPlan.planHash,
    generatedAt: "2026-08-06T13:00:00.000Z",
    outputDirectory: "synthetic-co-acquisition.fixture",
    totalTasks: 4,
    succeeded: [],
    failed: [],
    complete: true,
    canonicalManifestWritten: true,
    executionMode: "explicit_local_command",
    storageBoundary: "local_only",
    reviewStatus: "pending_human_review",
    appendAuthorized: false,
  };
  const manifest = { ...manifestBase, manifestHash: digest(manifestBase) };

  const workspaceBase = {
    schemaVersion: 2,
    source: "edinet",
    registryHash: registry.registryHash,
    issuer,
    sourceReviewPlanFile: acquisitionPlan.sourceReviewPlanFile,
    sourceReviewPlanHash: reviewPlan.reviewPlanHash,
    sourceAcquisitionPlanFile: "acquisition-plan.json",
    sourceAcquisitionPlanHash: acquisitionPlan.planHash,
    acquisitionManifestFile: "acquisition-manifest.json",
    acquisitionManifestHash: manifest.manifestHash,
    generatedAt: "2026-08-06T13:10:00.000Z",
    acquisitionComplete: true,
    fileIntegrityVerified: true,
    acquisitionCount: 4,
    documentCount: 2,
    groupCount: 1,
    structuredDocumentCount: 2,
    officialPdfCount: 2,
    reviewStatus: "pending_human_review",
    groups: [],
    globalBlockers: ["human_document_review_not_completed"],
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const workspace = { ...workspaceBase, workspaceHash: digest(workspaceBase) };
  const files = {
    inventory: reviewPlan.sourceInventoryFile,
    reviewPlan: acquisitionPlan.sourceReviewPlanFile,
    acquisitionPlan: workspace.sourceAcquisitionPlanFile,
    acquisitionManifest: workspace.acquisitionManifestFile,
    reviewWorkspace: "configured-review-workspace-v2.json",
  };
  return { registry, inventory, reviewPlan, acquisitionPlan, manifest, workspace, files };
}

function rehash(record: JsonObject, field: string): void {
  const { [field]: _ignored, ...withoutHash } = record;
  record[field] = digest(withoutHash);
}

{
  const values = artifacts();
  const dashboard = buildConfiguredEdinetDashboard({
    registry: registryFixture(),
    inventory: values.inventory,
    reviewPlan: values.reviewPlan,
    acquisitionPlan: values.acquisitionPlan,
    acquisitionManifest: values.manifest,
    reviewWorkspace: values.workspace,
    files: values.files,
    generatedAt: "2026-08-06T13:20:00.000Z",
  });
  assert.equal(dashboard.stages.length, 5);
  assert.equal(dashboard.verifiedStageCount, 5);
  assert.equal(dashboard.invalidIntegrityCount, 0);
  assert.equal(dashboard.lineageIssueCount, 0);
  assert.equal(dashboard.unsafeBoundaryCount, 0);
  assert.equal(dashboard.dashboardStatus, "pending_human_review");
  assert.equal(dashboard.readOnly, true);
  assert.equal(dashboard.appendAuthorized, false);
  assert.ok(dashboard.lineageChecks.every(item => item.matched));
  assert.match(dashboard.dashboardHash, /^[a-f0-9]{64}$/);
  const html = renderConfiguredEdinetDashboardHtml(dashboard);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.ok(!html.includes("<script>合成テスト株式会社</script>"));
  assert.match(html, /&lt;script&gt;合成テスト株式会社&lt;\/script&gt;/);
  assert.match(html, /synthetic-co-edinet-inventory\.&lt;img&gt;\.json/);
  assert.ok(!html.includes("<img>"));
  console.log("edinet-configured-dashboard: verified generic pipeline, CSP and HTML escaping OK");
}

{
  const values = artifacts();
  const tampered = structuredClone(values.inventory) as unknown as JsonObject;
  tampered.scannedBusinessDays = 999;
  const dashboard = buildConfiguredEdinetDashboard({
    registry: registryFixture(),
    inventory: tampered,
    reviewPlan: values.reviewPlan,
    acquisitionPlan: values.acquisitionPlan,
    acquisitionManifest: values.manifest,
    reviewWorkspace: values.workspace,
    files: values.files,
  });
  assert.equal(dashboard.dashboardStatus, "blocked_integrity");
  assert.equal(dashboard.invalidIntegrityCount, 1);
  assert.ok(dashboard.stages[0]!.issues.includes("inventoryHash_mismatch"));
  console.log("edinet-configured-dashboard: hash tampering blocks dashboard OK");
}

{
  const values = artifacts();
  const workspace = structuredClone(values.workspace) as unknown as JsonObject;
  workspace.sourceAcquisitionPlanHash = "f".repeat(64);
  rehash(workspace, "workspaceHash");
  const dashboard = buildConfiguredEdinetDashboard({
    registry: registryFixture(),
    inventory: values.inventory,
    reviewPlan: values.reviewPlan,
    acquisitionPlan: values.acquisitionPlan,
    acquisitionManifest: values.manifest,
    reviewWorkspace: workspace,
    files: values.files,
  });
  assert.equal(dashboard.invalidIntegrityCount, 0);
  assert.equal(dashboard.lineageIssueCount, 1);
  assert.equal(dashboard.dashboardStatus, "blocked_lineage");
  console.log("edinet-configured-dashboard: validly rehashed lineage mismatch blocks dashboard OK");
}

{
  const values = artifacts();
  const manifest = structuredClone(values.manifest) as unknown as JsonObject;
  manifest.appendAuthorized = true;
  rehash(manifest, "manifestHash");
  const workspace = structuredClone(values.workspace) as unknown as JsonObject;
  workspace.acquisitionManifestHash = manifest.manifestHash;
  rehash(workspace, "workspaceHash");
  const dashboard = buildConfiguredEdinetDashboard({
    registry: registryFixture(),
    inventory: values.inventory,
    reviewPlan: values.reviewPlan,
    acquisitionPlan: values.acquisitionPlan,
    acquisitionManifest: manifest,
    reviewWorkspace: workspace,
    files: values.files,
  });
  assert.equal(dashboard.invalidIntegrityCount, 0);
  assert.equal(dashboard.lineageIssueCount, 0);
  assert.equal(dashboard.unsafeBoundaryCount, 1);
  assert.equal(dashboard.dashboardStatus, "blocked_boundary");
  console.log("edinet-configured-dashboard: unsafe append boundary blocks dashboard OK");
}

console.log("edinet-configured-dashboard.test.ts passed");
