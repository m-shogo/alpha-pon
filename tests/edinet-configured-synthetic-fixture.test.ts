import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetSyntheticFixture,
  renderConfiguredEdinetSyntheticFixtureManifest,
} from "../src/research/edinet-configured-synthetic-fixture.js";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

{
  const first = buildConfiguredEdinetSyntheticFixture();
  const second = buildConfiguredEdinetSyntheticFixture();
  assert.equal(first.bundleHash, second.bundleHash);
  assert.deepEqual(first, second);
  assert.equal(first.fixtureId, "configured-edinet-synthetic-pipeline-v1");
  assert.equal(first.synthetic, true);
  assert.equal(first.networkUsed, false);
  assert.equal(first.credentialsRequired, false);
  assert.equal(first.realIssuerAuthorized, false);
  assert.equal(first.realFilingContentIncluded, false);
  assert.equal(first.foundationPreviewEligible, false);
  assert.equal(first.appendAuthorized, false);
  assert.match(first.bundleHash, /^[a-f0-9]{64}$/);
  console.log("edinet-configured-synthetic-fixture: deterministic safety envelope OK");
}

{
  const bundle = buildConfiguredEdinetSyntheticFixture();
  assert.equal(bundle.inventory.issuer.issuerKey, "synthetic-co");
  assert.equal(bundle.inventory.issuer.edinetCode, "E90000");
  assert.equal(bundle.inventory.issuer.secCode, "90000");
  assert.equal(bundle.inventory.candidates.length, 2);
  assert.equal(bundle.reviewPlan.candidateCount, 2);
  assert.equal(bundle.reviewPlan.plannedAcquisitionCount, 4);
  assert.equal(bundle.acquisitionPlan.taskCount, 4);
  assert.equal(bundle.acquisitionManifest.complete, true);
  assert.equal(bundle.acquisitionManifest.succeeded.length, 4);
  assert.equal(bundle.reviewWorkspace.schemaVersion, 2);
  assert.equal(bundle.reviewWorkspace.documentCount, 2);
  assert.equal(bundle.reviewWorkspace.acquisitionCount, 4);
  assert.equal(bundle.dashboard.stages.length, 5);
  assert.equal(bundle.dashboard.verifiedStageCount, 5);
  assert.equal(bundle.dashboard.invalidIntegrityCount, 0);
  assert.equal(bundle.dashboard.lineageIssueCount, 0);
  assert.equal(bundle.dashboard.unsafeBoundaryCount, 0);
  assert.equal(bundle.dashboard.dashboardStatus, "pending_human_review");
  console.log("edinet-configured-synthetic-fixture: full synthetic metadata pipeline OK");
}

{
  const bundle = buildConfiguredEdinetSyntheticFixture();
  const identities = new Set<string>();
  for (const item of bundle.files) {
    const identity = `${item.scope}/${item.fileName}`;
    assert.ok(!identities.has(identity), `duplicate file ${identity}`);
    identities.add(identity);
    assert.equal(item.synthetic, true);
    assert.equal(sha256(item.content), item.sha256);
    assert.equal(Buffer.byteLength(item.content, "utf-8"), item.byteLength);
    assert.ok(!item.fileName.includes("/"));
    assert.ok(!item.fileName.includes("\\"));
  }
  assert.ok(bundle.files.some(item => item.fileName === "synthetic-co-edinet-inventory.fixture.json"));
  assert.ok(bundle.files.some(item => item.fileName === "synthetic-co-edinet-configured-review-plan-v1.fixture.json"));
  assert.ok(bundle.files.some(item => item.fileName === "acquisition-plan.json"));
  assert.ok(bundle.files.some(item => item.fileName === "acquisition-manifest.json"));
  assert.ok(bundle.files.some(item => item.fileName === "configured-review-workspace-v2.json"));
  assert.ok(bundle.files.some(item => item.fileName === "configured-pipeline-dashboard-v1.html"));
  const binaries = bundle.files.filter(item => item.mediaType === "application/octet-stream");
  assert.equal(binaries.length, 4);
  assert.ok(binaries.every(item => item.fileName.endsWith(".synthetic.bin")));
  assert.ok(binaries.every(item => item.content.includes("NOT AN OFFICIAL FILING")));
  console.log("edinet-configured-synthetic-fixture: exported file descriptors and placeholder binaries OK");
}

{
  const bundle = buildConfiguredEdinetSyntheticFixture();
  const serialized = JSON.stringify(bundle);
  for (const forbidden of [
    "E02655",
    "81360",
    "株式会社サンリオ",
    "Subscription-Key",
    "subscription-key",
    "EDINET_API_KEY",
    "apiKey",
    "portfolio",
    "BUY",
  ]) {
    assert.ok(!serialized.includes(forbidden), `forbidden real/sensitive token found: ${forbidden}`);
  }
  assert.ok(serialized.includes("E90000"));
  assert.ok(serialized.includes("synthetic-co"));
  assert.ok(serialized.includes("realFilingContentIncluded"));
  console.log("edinet-configured-synthetic-fixture: no real Sanrio identity, credential, portfolio or BUY data OK");
}

{
  const bundle = buildConfiguredEdinetSyntheticFixture();
  const metadataFiles = bundle.files.filter(item => item.fileName.endsWith(".metadata.json"));
  assert.equal(metadataFiles.length, 4);
  for (const item of metadataFiles) {
    const metadata = JSON.parse(item.content) as Record<string, unknown>;
    assert.equal(metadata.synthetic, true);
    assert.equal(metadata.realFilingContentIncluded, false);
    assert.equal(metadata.executionMode, "explicit_local_command");
    assert.equal(metadata.storageBoundary, "local_only");
    assert.equal(metadata.appendAuthorized, false);
    const endpoint = String(metadata.sourceEndpoint);
    assert.match(endpoint, /^https:\/\/api\.edinet-fsa\.go\.jp\/api\/v2\/documents\/S900/);
    assert.ok(!endpoint.toLowerCase().includes("subscription-key"));
  }
  console.log("edinet-configured-synthetic-fixture: synthetic metadata lineage and credential-free endpoint OK");
}

{
  const bundle = buildConfiguredEdinetSyntheticFixture();
  const manifest = renderConfiguredEdinetSyntheticFixtureManifest(bundle);
  assert.match(manifest, /synthetic: true/);
  assert.match(manifest, /networkUsed: false/);
  assert.match(manifest, /realIssuerAuthorized: false/);
  assert.match(manifest, /realFilingContentIncluded: false/);
  assert.match(manifest, /appendAuthorized: false/);
  assert.match(manifest, /configured-pipeline-dashboard-v1\.html/);
  assert.ok(!manifest.includes("株式会社サンリオ"));
  console.log("edinet-configured-synthetic-fixture: inspectable manifest remains synthetic and non-appendable OK");
}

console.log("edinet-configured-synthetic-fixture.test.ts passed");
