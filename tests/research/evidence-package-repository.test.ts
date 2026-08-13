import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
} from "../../src/research/claim-contradiction-graph.js";
import {
  buildEvidencePackageManifestGoverned,
} from "../../src/research/evidence-package-governed.js";
import {
  validateEvidencePackageRepository,
} from "../../src/research/evidence-package-repository.js";
import {
  EVIDENCE_PACKAGE_CLAIM_ID,
  EVIDENCE_PACKAGE_CUTOFF,
  EVIDENCE_PACKAGE_EVIDENCE_ID,
  EVIDENCE_PACKAGE_ISSUER_ID,
} from "./evidence-package-fixtures.js";
import {
  governedEvidencePackageContext,
  governedEvidencePackageRequest,
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";

function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0
      ? ""
      : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

function repositoryPaths(dir: string) {
  return {
    manifestsPath: join(dir, "manifests.jsonl"),
    claimsPath: join(dir, "claims.jsonl"),
    claimEdgesPath: join(dir, "claim-edges.jsonl"),
    documentRevisionsPath: join(dir, "document-revisions.jsonl"),
    documentDiffsPath: join(dir, "document-diffs.jsonl"),
    evidencePath: join(dir, "evidence.jsonl"),
    evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
    securityEntitiesPath: join(dir, "security-entities.jsonl"),
    securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
  };
}

function writeGovernedDependencies(dir: string): ReturnType<typeof repositoryPaths> {
  const paths = repositoryPaths(dir);
  const context = governedEvidencePackageContext();
  const evidence = context.evidenceSnapshot.evidence[0];
  const claim = withClaimRecordHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_CLAIM_ID}:record:001`,
    claimId: EVIDENCE_PACKAGE_CLAIM_ID,
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID],
    claimClass: "fact",
    statement: "The disclosed event changes the implementation schedule.",
    status: "active",
    informationCutoff: "2026-08-06T00:02:00+09:00",
    effectiveFrom: "2026-08-06T00:02:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    falsificationConditions: [],
    unknownRefs: [],
    modelVersion: "claim-model-v1",
    ruleVersion: "claim-graph-v1",
  });
  const edge = withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: "claim-edge:evidence-package:support:record:001",
    edgeId: "claim-edge:evidence-package:support",
    fromKind: "evidence",
    fromId: EVIDENCE_PACKAGE_EVIDENCE_ID,
    toKind: "claim",
    toId: EVIDENCE_PACKAGE_CLAIM_ID,
    relationType: "supports",
    strength: "material",
    effectiveFrom: "2026-08-06T00:03:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    sourceEvidenceIds: [EVIDENCE_PACKAGE_EVIDENCE_ID],
  });

  writeJsonl(paths.securityEntitiesPath, context.securityMasterSnapshot.entities);
  writeJsonl(
    paths.securityRelationshipsPath,
    context.securityMasterSnapshot.relationships,
  );
  writeJsonl(paths.evidencePath, [evidence]);
  writeJsonl(paths.evidenceRelationsPath, context.evidenceSnapshot.relations);
  writeJsonl(paths.claimsPath, [claim]);
  writeJsonl(paths.claimEdgesPath, [edge]);
  writeJsonl(paths.documentRevisionsPath, []);
  writeJsonl(paths.documentDiffsPath, []);
  return paths;
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-repository-empty-"));
  try {
    const result = validateEvidencePackageRepository(repositoryPaths(dir));
    assert.equal(result.issues.some((item) => item.severity === "error"), false);
    assert.equal(result.manifestCount, 0);
    assert.equal(result.completeHeadCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-repository-valid-"));
  try {
    const paths = writeGovernedDependencies(dir);
    const context = governedEvidencePackageContext();
    const request = governedEvidencePackageRequest();
    const resolver = governedEvidencePackageResolver();
    const manifest = buildEvidencePackageManifestGoverned(
      request,
      context,
      resolver,
    );
    writeJsonl(paths.manifestsPath, [manifest]);

    const result = validateEvidencePackageRepository({
      ...paths,
      externalPins: resolver,
    });
    assert.deepEqual(
      result.issues.filter((item) => item.severity === "error"),
      [],
    );
    assert.equal(result.manifestCount, 1);
    assert.equal(result.activeHeadCount, 1);
    assert.equal(result.completeHeadCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-repository: governed complete package OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-repository-unresolved-"));
  try {
    const paths = writeGovernedDependencies(dir);
    const manifest = buildEvidencePackageManifestGoverned(
      governedEvidencePackageRequest(),
      governedEvidencePackageContext(),
      governedEvidencePackageResolver(),
    );
    writeJsonl(paths.manifestsPath, [manifest]);
    const result = validateEvidencePackageRepository(paths);
    assert.ok(result.issues.some((item) =>
      item.code === "governed_evidence_package_mismatch",
    ));
    assert.equal(result.activeHeadCount, 0);
    assert.equal(result.completeHeadCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-repository: unresolved price/benchmark pins block complete package OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-repository-hidden-dependency-error-"));
  try {
    const paths = writeGovernedDependencies(dir);
    const resolver = governedEvidencePackageResolver();
    const manifest = buildEvidencePackageManifestGoverned(
      governedEvidencePackageRequest(),
      governedEvidencePackageContext(),
      resolver,
    );
    writeJsonl(paths.manifestsPath, [manifest]);
    writeFileSync(`${paths.evidencePath}.batch-journal.json`, "{}\n", "utf-8");

    const result = validateEvidencePackageRepository({
      ...paths,
      externalPins: resolver,
      includeDependencyIssues: false,
    });
    assert.ok(result.issues.some((item) =>
      item.code === "evidence_package_dependency_invalid",
    ));
    assert.equal(result.activeHeadCount, 0);
    assert.equal(result.completeHeadCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-repository: hidden dependency errors still block package eligibility OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-repository-partial-"));
  const paths = repositoryPaths(dir);
  try {
    writeFileSync(paths.manifestsPath, '{"partial":true}', "utf-8");
    const result = validateEvidencePackageRepository(paths);
    assert.ok(result.issues.some((item) =>
      item.code === "partial_evidence_package_tail",
    ));
    assert.equal(result.manifestCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-repository: partial tail block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-repository-cutoff-"));
  try {
    const paths = writeGovernedDependencies(dir);
    const context = governedEvidencePackageContext();
    const request = governedEvidencePackageRequest({
      informationCutoff: "2026-08-06T00:01:30+09:00",
      createdAt: "2026-08-06T00:31:00+09:00",
      packageId: "evidence-package:fixture:early-cutoff",
    });
    const manifest = buildEvidencePackageManifestGoverned(
      request,
      context,
      governedEvidencePackageResolver(),
    );
    writeJsonl(paths.manifestsPath, [manifest]);
    const result = validateEvidencePackageRepository({
      ...paths,
      externalPins: governedEvidencePackageResolver(),
    });
    assert.ok(result.issues.some((item) =>
      item.code === "evidence_package_dependency_snapshot_missing" ||
      item.code === "evidence_package_dependency_invalid" ||
      item.code === "governed_evidence_package_mismatch" ||
      item.code === "evidence_package_cutoff_mismatch",
    ));
    assert.notEqual(request.informationCutoff, EVIDENCE_PACKAGE_CUTOFF);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-repository: cutoff mismatch fails closed OK");
}

console.log("evidence-package-repository: 全テスト成功");
