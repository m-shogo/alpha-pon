import assert from "node:assert/strict";
import {
  buildEvidencePackageManifestGoverned,
  validateEvidencePackageManifestGoverned,
  type EvidencePackageExternalPinResolver,
} from "../../src/research/evidence-package-governed.js";
import type {
  EvidencePackageSchemas,
} from "../../src/research/evidence-package-manifest.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";
import {
  governedEvidencePackageContext,
  governedEvidencePackageRequest,
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";
import {
  EVIDENCE_PACKAGE_ISSUER_ID,
  EVIDENCE_PACKAGE_SECURITY_ID,
  evidencePackageUnknownBudget,
} from "./evidence-package-fixtures.js";

const schemas: EvidencePackageSchemas = {
  manifest: loadCouncilSchema(
    "research/schemas/evidence-package-manifest.schema.json",
  ),
  claimSnapshot: loadCouncilSchema(
    "research/schemas/claim-graph-snapshot.schema.json",
  ),
  documentSnapshot: loadCouncilSchema(
    "research/schemas/document-revision-diff-snapshot.schema.json",
  ),
};

{
  const context = governedEvidencePackageContext();
  const request = governedEvidencePackageRequest();
  const resolver = governedEvidencePackageResolver();
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.completeness.securityResolved, true);
  assert.equal(manifest.completeness.priceSnapshotComplete, true);
  assert.equal(manifest.completeness.benchmarkComplete, true);
  assert.deepEqual(manifest.blockers, []);
  assert.deepEqual(
    validateEvidencePackageManifestGoverned(
      manifest,
      request,
      context,
      resolver,
      schemas,
    ),
    [],
  );
  const replayed = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  assert.equal(replayed.contentHash, manifest.contentHash);
  console.log("evidence-package-governed: fully resolved package complete OK");
}

{
  const context = governedEvidencePackageContext();
  const request = governedEvidencePackageRequest();
  const emptyResolver: EvidencePackageExternalPinResolver = {
    priceSnapshotHashes: new Set(),
    benchmarkSnapshotHashes: {
      issuer: new Set(),
      topix: new Set(),
      sector: new Set(),
    },
  };
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    context,
    emptyResolver,
  );
  assert.equal(manifest.status, "draft");
  assert.equal(manifest.completeness.priceSnapshotComplete, false);
  assert.equal(manifest.completeness.benchmarkComplete, false);
  assert.ok(manifest.blockers.includes("incomplete:priceSnapshotComplete"));
  assert.ok(manifest.blockers.includes("incomplete:benchmarkComplete"));
  assert.deepEqual(
    validateEvidencePackageManifestGoverned(
      manifest,
      request,
      context,
      emptyResolver,
      schemas,
    ),
    [],
  );
  console.log("evidence-package-governed: unresolved external pins stay draft OK");
}

{
  const context = governedEvidencePackageContext();
  const brokenContext = {
    ...context,
    securityMasterSnapshot: {
      ...context.securityMasterSnapshot,
      relationships: [],
    },
  };
  const request = governedEvidencePackageRequest();
  const resolver = governedEvidencePackageResolver();
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    brokenContext,
    resolver,
  );
  assert.equal(manifest.status, "draft");
  assert.equal(manifest.completeness.securityResolved, false);
  assert.ok(manifest.blockers.includes("incomplete:securityResolved"));
  assert.deepEqual(
    validateEvidencePackageManifestGoverned(
      manifest,
      request,
      brokenContext,
      resolver,
      schemas,
    ),
    [],
  );
  console.log("evidence-package-governed: missing issuer/listing path stays draft OK");
}

{
  const context = governedEvidencePackageContext();
  const request = governedEvidencePackageRequest({
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID, EVIDENCE_PACKAGE_SECURITY_ID],
  });
  const resolver = governedEvidencePackageResolver();
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  assert.equal(manifest.completeness.securityResolved, false);
  assert.equal(manifest.status, "draft");
  console.log("evidence-package-governed: incomplete entity closure stays draft OK");
}

{
  const context = governedEvidencePackageContext();
  const base = governedEvidencePackageRequest();
  const request = governedEvidencePackageRequest({
    benchmarkSnapshotHashes: {
      ...base.benchmarkSnapshotHashes,
      issuer: base.priceSnapshotHash,
    },
  });
  const resolver: EvidencePackageExternalPinResolver = {
    priceSnapshotHashes: new Set([request.priceSnapshotHash]),
    benchmarkSnapshotHashes: {
      issuer: new Set([request.benchmarkSnapshotHashes.issuer]),
      topix: new Set([request.benchmarkSnapshotHashes.topix]),
      sector: new Set([request.benchmarkSnapshotHashes.sector]),
    },
  };
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  assert.ok(validateEvidencePackageManifestGoverned(
    manifest,
    request,
    context,
    resolver,
    schemas,
  ).some((item) => item.code === "external_snapshot_role_collision"));
  console.log("evidence-package-governed: external role collision block OK");
}

{
  const context = governedEvidencePackageContext();
  const request = governedEvidencePackageRequest({
    unknownBudget: evidencePackageUnknownBudget({
      execution: {
        status: "unknown",
        severity: "informational",
        summary: "Execution route unresolved.",
        evidenceRefs: [],
      },
    }),
  });
  const resolver = governedEvidencePackageResolver();
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  assert.equal(manifest.status, "draft");
  assert.ok(manifest.blockers.includes("blocking_unknown:execution"));
  assert.ok(validateEvidencePackageManifestGoverned(
    manifest,
    request,
    context,
    resolver,
    schemas,
  ).some((item) => item.code === "blocking_unknown_marked_informational"));
  console.log("evidence-package-governed: unknown severity spoof block OK");
}

{
  const context = governedEvidencePackageContext();
  const request = governedEvidencePackageRequest({
    informationCutoff: "2026-08-06T00:25:00.000000002+09:00",
    createdAt: "2026-08-06T00:25:00.000000001+09:00",
  });
  const resolver = governedEvidencePackageResolver();
  const manifest = buildEvidencePackageManifestGoverned(
    request,
    context,
    resolver,
  );
  assert.ok(
    validateEvidencePackageManifestGoverned(
      manifest,
      request,
      context,
      resolver,
      schemas,
    ).some((item) => item.code === "evidence_package_created_before_cutoff"),
    "createdAt 1ns before informationCutoff must not collapse to the same millisecond",
  );
  console.log("evidence-package-governed: sub-ms createdAt cutoff ordering OK");
}

console.log("evidence-package-governed: 全テスト成功");
