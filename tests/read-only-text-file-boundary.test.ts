import assert from "node:assert/strict";
import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

  const knowledgeReviewSource = readFileSync("src/knowledge-review.ts", "utf-8");
  assert.match(
    knowledgeReviewSource,
    /readReadOnlyTextFile\("reports\/regime_scenarios_latest\.md"\)/,
    "weekly/monthly knowledge review must use the canonical text Evidence boundary",
  );
  assert.doesNotMatch(
    knowledgeReviewSource,
    /function readText\(|readFileSync\(path, "utf-8"\)/,
    "knowledge review must not bypass the canonical text Evidence boundary",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("read-only-text-file-boundary.test.ts passed");
