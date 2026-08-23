import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPriceJsonlFiles } from "../../src/research/price-store-files.js";

const root = mkdtempSync(join(tmpdir(), "price-store-files-"));
const outside = mkdtempSync(join(tmpdir(), "price-store-outside-"));
try {
  const nested = join(root, "nested");
  mkdirSync(nested);
  writeFileSync(join(root, "a.jsonl"), "{}\n", "utf-8");
  writeFileSync(join(nested, "b.jsonl"), "{}\n", "utf-8");
  writeFileSync(join(root, "ignore.txt"), "ignored", "utf-8");
  assert.deepEqual(listPriceJsonlFiles(root), [join(root, "a.jsonl"), join(nested, "b.jsonl")].sort());

  const outsideFile = join(outside, "outside.jsonl");
  writeFileSync(outsideFile, "{}\n", "utf-8");
  symlinkSync(outsideFile, join(root, "linked.jsonl"));
  assert.throws(() => listPriceJsonlFiles(root), /price_store_symlink_not_allowed/);
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

console.log("price-store-files: symlink provenance boundary OK");
