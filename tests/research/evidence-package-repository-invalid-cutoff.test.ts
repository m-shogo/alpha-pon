import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEvidencePackageManifestGoverned } from "../../src/research/evidence-package-governed.js";
import { validateEvidencePackageRepository } from "../../src/research/evidence-package-repository.js";
import {
  governedEvidencePackageContext,
  governedEvidencePackageRequest,
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";

const dir = mkdtempSync(join(tmpdir(), "evidence-package-invalid-cutoff-"));
try {
  const manifestsPath = join(dir, "manifests.jsonl");
  const valid = buildEvidencePackageManifestGoverned(
    governedEvidencePackageRequest(),
    governedEvidencePackageContext(),
    governedEvidencePackageResolver(),
  );
  const malformed = {
    ...valid,
    informationCutoff: "not-an-explicit-instant",
  };
  writeFileSync(manifestsPath, `${JSON.stringify(malformed)}\n`, "utf-8");

  const result = validateEvidencePackageRepository({ manifestsPath });
  assert.equal(result.manifestCount, 1);
  assert.ok(result.issues.some((item) =>
    item.code === "schema_violation"
    && item.target.includes("informationCutoff"),
  ));
  console.log("evidence-package-repository: malformed cutoff returns structured validation issue OK");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
