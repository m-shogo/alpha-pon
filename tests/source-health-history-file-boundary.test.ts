import assert from "node:assert/strict";
import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceHealthHistoryLines, replaceSourceHealthHistory } from "../src/source-health-history-file.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-source-health-history-"));
try {
  const historyPath = join(dir, "history.jsonl");
  const aliasTarget = join(dir, "target.jsonl");
  writeFileSync(historyPath, '{"date":"2026-08-25"}\n', "utf-8");

  assert.deepEqual(readSourceHealthHistoryLines(historyPath), ['{"date":"2026-08-25"}'], "standalone history remains readable");
  replaceSourceHealthHistory(historyPath, '{"date":"2026-08-26"}\n');
  assert.equal(readFileSync(historyPath, "utf-8"), '{"date":"2026-08-26"}\n', "standalone history remains replaceable");

  rmSync(historyPath);
  writeFileSync(aliasTarget, "original\n", "utf-8");
  symlinkSync(aliasTarget, historyPath);
  assert.throws(() => readSourceHealthHistoryLines(historyPath), /standalone regular file/, "symlink history input must fail closed");
  assert.throws(() => replaceSourceHealthHistory(historyPath, "replacement\n"), /standalone regular file/, "symlink history output must fail closed");
  assert.equal(readFileSync(aliasTarget, "utf-8"), "original\n", "symlink target must remain untouched");

  rmSync(historyPath);
  linkSync(aliasTarget, historyPath);
  assert.throws(() => readSourceHealthHistoryLines(historyPath), /standalone regular file/, "hard-linked history input must fail closed");
  assert.throws(() => replaceSourceHealthHistory(historyPath, "replacement\n"), /standalone regular file/, "hard-linked history output must fail closed");
  assert.equal(readFileSync(aliasTarget, "utf-8"), "original\n", "hard-link target must remain untouched");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("source-health-history-file-boundary.test.ts passed");
