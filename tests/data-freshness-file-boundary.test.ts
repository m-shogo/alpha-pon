import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshnessOf } from "../src/data-freshness.js";

const dir = mkdtempSync(join(tmpdir(), "data-freshness-file-boundary-"));
try {
  const directoryResult = freshnessOf(dir, "pipeline status");
  assert.equal(directoryResult.exists, true, "existing directory remains distinguishable from a missing path");
  assert.equal(directoryResult.isFreshToday, false, "directory mtime must not count as fresh report evidence");
  assert.match(directoryResult.reason, /regular fileではない/);

  const emptyFile = join(dir, "empty.json");
  writeFileSync(emptyFile, "", "utf-8");
  const emptyResult = freshnessOf(emptyFile, "empty report");
  assert.equal(emptyResult.exists, true, "existing empty file remains distinguishable from a missing path");
  assert.equal(emptyResult.isFreshToday, false, "empty file mtime must not count as fresh report evidence");
  assert.match(emptyResult.reason, /空ファイル/);

  const whitespaceOnlyFile = join(dir, "whitespace-only.json");
  writeFileSync(whitespaceOnlyFile, " \n\t \n", "utf-8");
  const whitespaceOnlyResult = freshnessOf(whitespaceOnlyFile, "whitespace-only report");
  assert.equal(whitespaceOnlyResult.exists, true);
  assert.equal(
    whitespaceOnlyResult.isFreshToday,
    false,
    "whitespace-only file mtime must not count as fresh report evidence",
  );
  assert.match(whitespaceOnlyResult.reason, /空ファイル/);

  const futureFile = join(dir, "future.json");
  writeFileSync(futureFile, "{}", "utf-8");
  const future = new Date(Date.now() + 60_000);
  utimesSync(futureFile, future, future);
  const futureResult = freshnessOf(futureFile, "future report");
  assert.equal(futureResult.exists, true);
  assert.equal(futureResult.isFreshToday, false, "future mtime must not count as current freshness evidence");
  assert.match(futureResult.reason, /更新時刻が未来/);

  const file = join(dir, "pipeline_status_latest.json");
  writeFileSync(file, "{}", "utf-8");
  const fileResult = freshnessOf(file, "pipeline status");
  assert.equal(fileResult.exists, true);
  assert.equal(fileResult.isFreshToday, true, "a non-empty regular file created now remains fresh");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("data-freshness-file-boundary.test.ts passed");
