import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listingReadinessFileStatus } from "../src/listing-automation-readiness-file.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-listing-readiness-file-"));
try {
  const missing = join(dir, "missing.csv");
  const empty = join(dir, "empty.csv");
  const ready = join(dir, "ready.csv");
  const directory = join(dir, "directory");
  const symlink = join(dir, "ready-link.csv");
  writeFileSync(empty, "\n", "utf-8");
  writeFileSync(ready, "code,price\n8136,1000\n", "utf-8");
  mkdirSync(directory);
  symlinkSync(ready, symlink);

  assert.equal(listingReadinessFileStatus(missing), "missing");
  assert.equal(listingReadinessFileStatus(empty), "warning");
  assert.equal(listingReadinessFileStatus(directory), "warning");
  assert.equal(listingReadinessFileStatus(symlink), "warning", "symlinked local evidence must not be accepted as canonical readiness input");
  assert.equal(listingReadinessFileStatus(ready), "ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("listing-automation-readiness-file: OK");
