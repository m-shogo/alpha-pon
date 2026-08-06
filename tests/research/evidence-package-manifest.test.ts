import assert from "node:assert/strict";
import {
  buildEvidencePackageManifest,
  computeEvidencePackageHash,
  validateEvidencePackageManifest,
  type EvidencePackageSchemas,
} from "../../src/research/evidence-package-manifest.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";
import {
  evidencePackageBuildRequest,
  evidencePackageContext,
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
  const context = evidencePackageContext();
  const request = evidencePackageBuildRequest();
  const manifest = buildEvidencePackageManifest(request, context);
  assert.equal(manifest.status, "complete");
  assert.deepEqual(manifest.blockers, []);
  assert.equal(manifest.claimIds.length, 1);
  assert.equal(manifest.supportEvidenceIds.length, 1);
  assert.deepEqual(
    validateEvidencePackageManifest(manifest, request, context, schemas),
    [],
  );
  const replayed = buildEvidencePackageManifest(request, context);
  assert.equal(replayed.contentHash, manifest.contentHash);
  assert.equal(computeEvidencePackageHash(manifest), manifest.contentHash);
  console.log("evidence-package-manifest: deterministic complete package OK");
}

{
  const context = evidencePackageContext();
  const request = evidencePackageBuildRequest({
    unknownBudget: evidencePackageUnknownBudget({
      license: {
        status: "unknown",
        severity: "informational",
        summary: "License has not been verified.",
        evidenceRefs: [],
      },
    }),
  });
  const manifest = buildEvidencePackageManifest(request, context);
  assert.equal(manifest.status, "draft");
  assert.ok(manifest.blockers.includes("blocking_unknown:license"));
  assert.ok(validateEvidencePackageManifest(manifest, request, context, schemas)
    .some((item) => item.code === "blocking_unknown_marked_informational"));
  console.log("evidence-package-manifest: unknown severity spoof block OK");
}

{
  const context = evidencePackageContext();
  const request = evidencePackageBuildRequest({ executionRouteComplete: false });
  const manifest = buildEvidencePackageManifest(request, context);
  assert.equal(manifest.status, "draft");
  assert.equal(manifest.completeness.executionRouteComplete, false);
  assert.ok(manifest.blockers.includes("incomplete:executionRouteComplete"));
  assert.deepEqual(
    validateEvidencePackageManifest(manifest, request, context, schemas),
    [],
  );
  console.log("evidence-package-manifest: incomplete execution route stays draft OK");
}

{
  const context = evidencePackageContext();
  const request = evidencePackageBuildRequest();
  const valid = buildEvidencePackageManifest(request, context);
  const tampered = {
    ...valid,
    priceSnapshotHash: "9".repeat(64),
  };
  const issues = validateEvidencePackageManifest(
    tampered,
    request,
    context,
    schemas,
  );
  assert.ok(issues.some((item) => item.code === "invalid_evidence_package_hash"));
  assert.ok(issues.some((item) => item.code === "evidence_package_field_mismatch"));
  console.log("evidence-package-manifest: package tamper block OK");
}

{
  const context = evidencePackageContext();
  const request = evidencePackageBuildRequest();
  const invalidContext = {
    ...context,
    claimGraphSnapshot: {
      ...context.claimGraphSnapshot,
      contentHash: "0".repeat(64),
    },
  };
  const manifest = buildEvidencePackageManifest(request, invalidContext);
  assert.ok(validateEvidencePackageManifest(
    manifest,
    request,
    invalidContext,
    schemas,
  ).some((item) => item.code === "invalid_claim_snapshot_hash"));
  console.log("evidence-package-manifest: pinned Claim snapshot tamper block OK");
}

{
  const context = evidencePackageContext();
  const contradictionId = "claim-edge:evidence-package:contradiction";
  const contradictedContext = {
    ...context,
    claimAssessments: context.claimAssessments.map((assessment) => ({
      ...assessment,
      eligible: false,
      blockers: [
        ...assessment.blockers,
        `unresolved_material_contradiction:${contradictionId}`,
      ],
      contradictionEvidenceIds: [assessment.supportEvidenceIds[0]],
    })),
  };
  const request = evidencePackageBuildRequest();
  const manifest = buildEvidencePackageManifest(request, contradictedContext);
  assert.equal(manifest.status, "draft");
  assert.deepEqual(manifest.openContradictionIds, [contradictionId]);
  assert.ok(manifest.blockers.includes(`open_contradiction:${contradictionId}`));
  assert.ok(manifest.blockers.includes("no_eligible_claims"));
  assert.ok(manifest.blockers.includes("no_eligible_support_evidence"));
  assert.deepEqual(
    validateEvidencePackageManifest(
      manifest,
      request,
      contradictedContext,
      schemas,
    ),
    [],
  );
  console.log("evidence-package-manifest: open contradiction blocks completeness OK");
}

{
  const context = evidencePackageContext();
  const request = evidencePackageBuildRequest();
  const valid = buildEvidencePackageManifest(request, context);
  const nonCanonicalInput = {
    ...valid,
    entityIds: [...valid.entityIds].reverse(),
  };
  const nonCanonical = {
    ...nonCanonicalInput,
    contentHash: computeEvidencePackageHash(nonCanonicalInput),
  };
  assert.ok(validateEvidencePackageManifest(
    nonCanonical,
    request,
    context,
    schemas,
  ).some((item) => item.code === "non_canonical_evidence_package_array"));
  console.log("evidence-package-manifest: non-canonical arrays block OK");
}

console.log("evidence-package-manifest: 全テスト成功");
