import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isPriceStoreSidecarName,
  listPriceJsonlFiles,
} from "../../src/research/price-store-files.js";
import { JQUANTS_ADJUSTMENT_LEDGER_NAME } from "../../src/research/providers/jquants-adjustment-events.js";
import { INGEST_LEDGER_NAME } from "../../src/research/providers/jquants-daily-ingest.js";

const root = mkdtempSync(join(tmpdir(), "price-store-files-"));
const outside = mkdtempSync(join(tmpdir(), "price-store-outside-"));
try {
  const nested = join(root, "nested");
  mkdirSync(nested);
  writeFileSync(join(root, "a.jsonl"), "{}\n", "utf-8");
  writeFileSync(join(nested, "b.jsonl"), "{}\n", "utf-8");
  writeFileSync(join(root, "ignore.txt"), "ignored", "utf-8");
  assert.deepEqual(listPriceJsonlFiles(root), [join(root, "a.jsonl"), join(nested, "b.jsonl")].sort());

  // 付帯台帳は価格ファイルと同じディレクトリに同じ拡張子で置かれる。
  // 名前でしか区別できないので、実在する2本が規約どおりか固定する。
  // 規約を外れると、価格として読まれて検査が例外で止まる（2026-09-11 に実測）。
  for (const name of [JQUANTS_ADJUSTMENT_LEDGER_NAME, INGEST_LEDGER_NAME]) {
    assert.ok(isPriceStoreSidecarName(name), `付帯台帳は _ で始めること: ${name}`);
    writeFileSync(join(root, name), '{"not":"a price record"}\n', "utf-8");
  }
  assert.deepEqual(
    listPriceJsonlFiles(root),
    [join(root, "a.jsonl"), join(nested, "b.jsonl")].sort(),
    "付帯台帳を価格ファイルとして返さないこと",
  );

  const outsideFile = join(outside, "outside.jsonl");
  writeFileSync(outsideFile, "{}\n", "utf-8");
  symlinkSync(outsideFile, join(root, "linked.jsonl"));
  assert.throws(() => listPriceJsonlFiles(root), /price_store_symlink_not_allowed/);
  rmSync(join(root, "linked.jsonl"));

  const linkedRoot = join(tmpdir(), `price-store-linked-root-${process.pid}-${Date.now()}`);
  symlinkSync(outside, linkedRoot, "dir");
  try {
    assert.throws(() => listPriceJsonlFiles(linkedRoot), /price_store_symlink_not_allowed/);
  } finally {
    rmSync(linkedRoot, { force: true });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

console.log("price-store-files: symlink provenance boundary / 付帯台帳の除外 OK");
