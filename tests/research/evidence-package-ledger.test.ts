import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEvidencePackageManifestGoverned,
  validateEvidencePackageManifestGoverned,
} from "../../src/research/evidence-package-governed.js";
import {
  computeEvidencePackageHash,
  type EvidencePackageBuildRequest,
  type EvidencePackageManifest,
  type EvidencePackageSchemas,
} from "../../src/research/evidence-package-manifest.js";
import {
  activeEvidencePackageHeads,
  appendEvidencePackageManifestsGoverned,
  validateEvidencePackageLedger,
} from "../../src/research/evidence-package-ledger.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";
import {
  governedEvidencePackageContext,
  governedEvidencePackageRequest,
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";

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
const context = governedEvidencePackageContext();
const resolver = governedEvidencePackageResolver();

function manifestFor(
  overrides: Partial<EvidencePackageBuildRequest> = {},
): {
  request: EvidencePackageBuildRequest;
  manifest: EvidencePackageManifest;
} {
  const request = governedEvidencePackageRequest(overrides);
  return {
    request,
    manifest: buildEvidencePackageManifestGoverned(
      request,
      context,
      resolver,
    ),
  };
}

{
  const first = manifestFor();
  const second = manifestFor({
    packageId: "evidence-package:fixture:002",
    createdAt: "2026-08-06T00:35:00+09:00",
    codeVersion: "evidence-package-code-v2",
    supersedesPackageId: first.manifest.packageId,
  });
  assert.deepEqual(
    validateEvidencePackageLedger([first.manifest, second.manifest]),
    [],
  );
  assert.deepEqual(
    activeEvidencePackageHeads([first.manifest, second.manifest])
      .map((record) => record.packageId),
    [second.manifest.packageId],
  );
  console.log("evidence-package-ledger: valid supersession chain OK");
}

{
  const first = manifestFor({
    packageId: "evidence-package:fixture:fractional-first",
    createdAt: "2026-08-06T00:35:00.000000002+09:00",
  });
  const regressed = manifestFor({
    packageId: "evidence-package:fixture:fractional-regressed",
    createdAt: "2026-08-06T00:35:00.000000001+09:00",
    codeVersion: "evidence-package-code-fractional-v2",
    supersedesPackageId: first.manifest.packageId,
  });
  assert.ok(
    validateEvidencePackageLedger([first.manifest, regressed.manifest])
      .some((item) => item.code === "evidence_package_created_at_not_monotonic"),
    "同一millisecond内でも1nsのcreatedAt逆行をfail-closedにする",
  );
  console.log("evidence-package-ledger: supersession preserves sub-millisecond createdAt ordering OK");
}

{
  const first = manifestFor();
  const changedIdentity = manifestFor({
    packageId: "evidence-package:fixture:identity-change",
    candidateId: "candidate:evidence-package:other",
    createdAt: "2026-08-06T00:35:00+09:00",
    supersedesPackageId: first.manifest.packageId,
  });
  assert.ok(validateEvidencePackageLedger([
    first.manifest,
    changedIdentity.manifest,
  ]).some((item) => item.code === "evidence_package_chain_identity_mismatch"));
  console.log("evidence-package-ledger: chain identity mutation block OK");
}

{
  const base = manifestFor().manifest;
  const aInput = {
    ...base,
    packageId: "evidence-package:cycle:a",
    createdAt: "2026-08-06T00:31:00+09:00",
    supersedesPackageId: "evidence-package:cycle:b",
  };
  const a = {
    ...aInput,
    contentHash: computeEvidencePackageHash(aInput),
  };
  const bInput = {
    ...base,
    packageId: "evidence-package:cycle:b",
    createdAt: "2026-08-06T00:32:00+09:00",
    supersedesPackageId: "evidence-package:cycle:a",
  };
  const b = {
    ...bInput,
    contentHash: computeEvidencePackageHash(bInput),
  };
  assert.ok(validateEvidencePackageLedger([a, b])
    .some((item) => item.code === "evidence_package_revision_cycle"));
  console.log("evidence-package-ledger: revision cycle block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-ledger-"));
  const path = join(dir, "manifests.jsonl");
  const first = manifestFor();
  const second = manifestFor({
    packageId: "evidence-package:fixture:writer-002",
    createdAt: "2026-08-06T00:36:00+09:00",
    codeVersion: "evidence-package-code-writer-v2",
    supersedesPackageId: first.manifest.packageId,
  });
  const requestById = new Map([
    [first.manifest.packageId, first.request],
    [second.manifest.packageId, second.request],
  ]);
  const validator = (manifest: EvidencePackageManifest) => {
    const request = requestById.get(manifest.packageId);
    if (!request) {
      return [{
        severity: "error" as const,
        code: "missing_fixture_request",
        target: manifest.packageId,
        message: "fixture request missing",
      }];
    }
    return validateEvidencePackageManifestGoverned(
      manifest,
      request,
      context,
      resolver,
      schemas,
    );
  };
  try {
    appendEvidencePackageManifestsGoverned(
      path,
      [first.manifest],
      "package-writer-owner-1",
      validator,
    );
    appendEvidencePackageManifestsGoverned(
      path,
      [second.manifest],
      "package-writer-owner-2",
      validator,
    );
    assert.equal(readFileSync(path, "utf-8").trim().split("\n").length, 2);
    assert.equal(existsSync(`${path}.lock`), false);

    const tampered = {
      ...second.manifest,
      packageId: "evidence-package:fixture:tampered",
      contentHash: "0".repeat(64),
    };
    requestById.set(tampered.packageId, {
      ...second.request,
      packageId: tampered.packageId,
      supersedesPackageId: second.manifest.packageId,
      createdAt: "2026-08-06T00:37:00+09:00",
    });
    assert.throws(
      () => appendEvidencePackageManifestsGoverned(
        path,
        [tampered],
        "package-writer-tampered",
        validator,
      ),
      /invalid_evidence_package_hash|governed_evidence_package_mismatch/,
    );
    assert.equal(existsSync(`${path}.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-ledger: append/fsync/tamper/lock cleanup OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-package-partial-"));
  const path = join(dir, "manifests.jsonl");
  try {
    writeFileSync(path, '{"partial":true}', "utf-8");
    assert.throws(
      () => appendEvidencePackageManifestsGoverned(
        path,
        [manifestFor().manifest],
        "package-partial-owner",
        () => [],
      ),
      /partial write/,
    );
    assert.equal(existsSync(`${path}.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("evidence-package-ledger: partial tail fail-closed OK");
}

console.log("evidence-package-ledger: 全テスト成功");
