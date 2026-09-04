import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readLedger } from "../src/market-events/local-ledger.js";

const tmpRoot = join(process.cwd(), "tmp");
mkdirSync(tmpRoot, { recursive: true });
const directory = mkdtempSync(join(tmpRoot, "market-event-ledger-read-boundary-"));

try {
  const regularPath = join(directory, "regular.jsonl");
  writeFileSync(regularPath, "{broken-json}\n", "utf8");
  const regular = readLedger(regularPath);
  assert.equal(regular.records.length, 0);
  assert.equal(regular.parseErrors[0]?.lineNumber, 1, "regular files must preserve line-level parse errors");

  const symlinkPath = join(directory, "symlink.jsonl");
  symlinkSync(regularPath, symlinkPath);
  const symlinked = readLedger(symlinkPath);
  assert.deepEqual(symlinked.records, []);
  assert.equal(symlinked.parseErrors[0]?.lineNumber, 0);
  assert.equal(symlinked.parseErrors[0]?.message, "non_regular_file");

  const hardTarget = join(directory, "hard-target.jsonl");
  const hardLink = join(directory, "hard-link.jsonl");
  writeFileSync(hardTarget, "{broken-json}\n", "utf8");
  linkSync(hardTarget, hardLink);
  const hardLinked = readLedger(hardLink);
  assert.deepEqual(hardLinked.records, []);
  assert.equal(hardLinked.parseErrors[0]?.lineNumber, 0);
  assert.equal(hardLinked.parseErrors[0]?.message, "non_regular_file");

  const realDirectory = join(directory, "real");
  mkdirSync(realDirectory);
  const nestedLedger = join(realDirectory, "ledger.jsonl");
  writeFileSync(nestedLedger, "{broken-json}\n", "utf8");
  const aliasDirectory = join(directory, "alias");
  symlinkSync(realDirectory, aliasDirectory, "dir");
  const ancestorLinked = readLedger(join(aliasDirectory, "ledger.jsonl"));
  assert.deepEqual(ancestorLinked.records, []);
  assert.equal(ancestorLinked.parseErrors[0]?.lineNumber, 0);
  assert.equal(ancestorLinked.parseErrors[0]?.message, "non_regular_file");

  assert.deepEqual(readLedger(join(directory, "missing.jsonl")), { records: [], parseErrors: [] });
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("market-event-ledger-read-boundary: ok");
