import assert from "node:assert/strict";
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEvidencePackageManifestGoverned } from "../../src/research/evidence-package-governed.js";
import {
  computeEvidencePackageHash,
} from "../../src/research/evidence-package-manifest.js";
import { validateEvidencePackageRepository } from "../../src/research/evidence-package-repository.js";
import {
  governedEvidencePackageContext,
  governedEvidencePackageRequest,
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";

// macOS の tmpdir() は /var/folders/... を返すが /var は /private/var への symlink。
// Catalog validator は祖先 symlink を正しく拒否するため、テスト側で実体パスへ解決する。
// validator を緩めるのではなく、テストが正規のパスを使う。
function canonicalTmpdir(): string {
  return realpathSync(tmpdir());
}


const dir = mkdtempSync(join(canonicalTmpdir(), "evidence-package-invalid-revision-ledger-"));
try {
  const manifestsPath = join(dir, "manifests.jsonl");
  const root = buildEvidencePackageManifestGoverned(
    governedEvidencePackageRequest(),
    governedEvidencePackageContext(),
    governedEvidencePackageResolver(),
  );
  const { contentHash: _rootHash, ...rootInput } = root;
  const malformedInput = {
    ...rootInput,
    packageId: "evidence-package:fixture:malformed-revision",
    createdAt: "not-an-explicit-instant",
    supersedesPackageId: root.packageId,
  };
  const malformed = {
    ...malformedInput,
    contentHash: computeEvidencePackageHash(malformedInput),
  };
  writeFileSync(
    manifestsPath,
    `${JSON.stringify(root)}\n${JSON.stringify(malformed)}\n`,
    "utf-8",
  );

  const result = validateEvidencePackageRepository({ manifestsPath });
  assert.equal(result.manifestCount, 2);
  assert.ok(result.issues.some((item) =>
    item.code === "schema_violation"
    && item.target.includes("createdAt"),
  ));
  assert.equal(result.activeHeadCount, 1);
  console.log("evidence-package-repository: malformed revision cannot crash ledger projection OK");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
