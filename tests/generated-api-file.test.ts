import assert from "node:assert/strict";
import {
  linkSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCanonicalGeneratedJsonFile } from "../apps/web/lib/generated-api-file.js";

const dir = mkdtempSync(join(tmpdir(), "generated-api-file-"));
try {
  const canonical = join(dir, "canonical.json");
  writeFileSync(canonical, JSON.stringify({ status: "ok" }));

  assert.deepEqual(
    readCanonicalGeneratedJsonFile(canonical),
    { status: "ok" },
    "standalone regular generated JSON must remain readable",
  );

  const symlink = join(dir, "symlink.json");
  symlinkSync(canonical, symlink, "file");
  assert.throws(
    () => readCanonicalGeneratedJsonFile(symlink),
    /standalone regular file/,
    "symlinked generated JSON must not qualify as canonical API evidence",
  );

  const hardlink = join(dir, "hardlink.json");
  linkSync(canonical, hardlink);
  assert.throws(
    () => readCanonicalGeneratedJsonFile(hardlink),
    /standalone regular file/,
    "hard-linked generated JSON must not qualify as canonical API evidence",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("generated-api-file.test.ts passed");
