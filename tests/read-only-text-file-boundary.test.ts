import assert from "node:assert/strict";
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReadOnlyTextFile } from "../src/read-only-text-file.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-read-only-text-"));
try {
  const canonical = join(dir, "canonical.md");
  const symlinkPath = join(dir, "symlink.md");
  const hardlinkPath = join(dir, "hardlink.md");
  const emptyPath = join(dir, "empty.md");

  writeFileSync(canonical, "# source health\n生成日: 2026-08-26\n", "utf-8");
  writeFileSync(emptyPath, "  \n", "utf-8");

  assert.match(readReadOnlyTextFile(canonical), /source health/, "standalone regular text evidence remains readable");
  assert.equal(readReadOnlyTextFile(emptyPath), "", "empty text evidence fails closed");
  assert.equal(readReadOnlyTextFile(join(dir, "missing.md")), "", "missing text evidence fails closed");

  symlinkSync(canonical, symlinkPath);
  assert.equal(readReadOnlyTextFile(symlinkPath), "", "symlinked text evidence must not masquerade as canonical evidence");

  rmSync(symlinkPath);
  linkSync(canonical, hardlinkPath);
  assert.equal(readReadOnlyTextFile(canonical), "", "a multiply-linked source must fail closed even through its original path");
  assert.equal(readReadOnlyTextFile(hardlinkPath), "", "hard-linked aliases must fail closed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("read-only-text-file-boundary.test.ts passed");
